import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { loadEnv } from 'vite';
import { loadDataset, resolveDatasetDirectory } from './validate-finetuning.mjs';
import { scoreRawAnswer } from './finetuning/metrics.mjs';
import { approvedRecords } from './finetuning/validation.mjs';

const args = process.argv.slice(2);
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const dataset = resolveDatasetDirectory(option('--data'));
const { records, manifest } = loadDataset(dataset);
const reviews = JSON.parse(readFileSync(join(dataset, 'review.json'), 'utf8'));
const allowAiPilot = args.includes('--allow-ai-pilot');
const reviewedTest = approvedRecords(records, reviews, 'test', { allowAiPilot });
const limit = Number(option('--limit') || 10);
if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Use --limit 1..100');
// Round-robin tasks instead of evaluating only the first course template.
const tasks = new Map();
for (const record of (reviewedTest.length ? reviewedTest : records.filter(r => r.split === 'test'))) {
  if (!tasks.has(record.task)) tasks.set(record.task, []);
  tasks.get(record.task).push(record);
}
const selected = [];
while (selected.length < limit && [...tasks.values()].some(queue => queue.length)) {
  for (const queue of tasks.values()) if (queue.length && selected.length < limit) selected.push(queue.shift());
}
const model = option('--model');
if (!args.includes('--run')) {
  console.log(JSON.stringify({ mode: 'dry_run_no_network', heldOutSamples: records.filter(r => r.split === 'test').length,
    reviewedTestSamples: reviewedTest.length, selectionScope: reviewedTest.length ? 'reviewed test samples' : 'unreviewed drafts for dry-run preview only',
    selected: selected.map(r => ({ id: r.id, task: r.task })), model: model || 'not selected',
    note: 'Use --run --model MODEL only when inference costs and data use are authorized. Raw results are evaluated without server normalization.' }, null, 2));
} else {
  if (!model) throw new Error('Specify --model for an actual evaluation');
  if (!reviewedTest.length) throw new Error('Review test samples before actual model evaluation');
  const env = loadEnv('development', process.cwd(), '');
  const key = env.QWEN_API_KEY || env.DASHSCOPE_API_KEY;
  if (!key) throw new Error('A server-side Qwen key is required');
  const destination = resolve(option('--out') || `docs/evaluations/finetune-${model.replace(/[^a-z0-9_-]/gi, '_')}-${Date.now()}.json`);
  if (existsSync(destination)) throw new Error('Refusing to overwrite existing observations');
  const report = { startedAt: new Date().toISOString(), model, sourceHash: manifest.source.sha256,
    datasetVersion: manifest.version, temperature: 0.2, normalizationApplied: false,
    metricScope: 'Structural and source-code checks, not semantic factual accuracy', results: [] };
  mkdirSync(dirname(destination), { recursive: true });
  const save = () => writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`);
  for (const item of selected) {
    const start = performance.now();
    try {
      const response = await fetch(`${(env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/$/, '')}/chat/completions`, {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, temperature: 0.2, enable_thinking: false, max_tokens: 4096,
          response_format: { type: 'json_object' }, messages: item.record.messages.slice(0, -1) }), signal: AbortSignal.timeout(65000)
      });
      if (!response.ok) {
        report.results.push({ id: item.id, task: item.task, status: response.status, latencyMs: Math.round(performance.now() - start) });
      } else {
        const data = await response.json(), content = data.choices?.[0]?.message?.content || '';
        report.results.push({ id: item.id, task: item.task, status: response.status,
          latencyMs: Math.round(performance.now() - start), usage: data.usage, finishReason: data.choices?.[0]?.finish_reason,
          content, metrics: scoreRawAnswer(content, item) });
      }
    } catch (error) { report.results.push({ id: item.id, task: item.task, error: error.name, latencyMs: Math.round(performance.now() - start) }); }
    save();
    console.log(JSON.stringify({ completed: report.results.length, total: selected.length, id: item.id }));
  }
  report.completedAt = new Date().toISOString();
  save();
  console.log(JSON.stringify({ output: destination, observations: report.results.length }));
}
