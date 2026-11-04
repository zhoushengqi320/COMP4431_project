// Read-only observer: never submits jobs, uploads data or creates deployments.
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { loadEnv } from 'vite';
import { resolveDatasetDirectory } from './validate-finetuning.mjs';

const args = process.argv.slice(2);
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const watch = args.includes('--watch');
const interval = Number(option('--interval-seconds') || 60);
const hours = Number(option('--max-hours') || 12);
if (!Number.isFinite(interval) || interval < 10 || interval > 3600 || !Number.isFinite(hours) || hours <= 0 || hours > 48) throw new Error('Invalid observer interval/duration');
const directory = resolveDatasetDirectory(option('--data'));
const submission = JSON.parse(readFileSync(join(directory, 'training-submission.json'), 'utf8'));
if (submission.status !== 'created' || !/^ft-[a-zA-Z0-9-]+$/.test(submission.jobId || '')) throw new Error('A confirmed training job is required');
const jobId = submission.jobId;
const destination = join(directory, 'training-run');
mkdirSync(destination, { recursive: true });
const env = loadEnv('development', process.cwd(), '');
const apiKey = (env.QWEN_API_KEY || env.DASHSCOPE_API_KEY || '').trim();
if (!apiKey) throw new Error('A server-side Qwen key is required');
const redact = value => String(value).replaceAll(apiKey, '[redacted]').replace(/sk-[a-z0-9_-]+/gi, '[redacted]');
const save = (name, value) => writeFileSync(join(destination, name), redact(JSON.stringify(value, null, 2)) + '\n');
const json = (name, fallback) => existsSync(join(destination, name)) ? JSON.parse(readFileSync(join(destination, name), 'utf8')) : fallback;
const terminal = new Set(['SUCCEEDED', 'FAILED', 'CANCELED']);
const lock = join(destination, 'watcher-lock.json');
let ownsLock = false;
if (watch) {
  if (existsSync(lock)) {
    const previous = JSON.parse(readFileSync(lock, 'utf8'));
    let active = false;
    try { process.kill(previous.pid, 0); active = true; } catch { /* Previous observer ended. */ }
    if (active) throw new Error('An observer is already active; inspect the recorded PID instead of duplicating it');
  }
  writeFileSync(lock, JSON.stringify({ pid: process.pid, jobId, startedAt: new Date().toISOString() }));
  ownsLock = true;
}

async function get(path) {
  const response = await fetch(`https://dashscope.aliyuncs.com/api/v1/fine-tunes/${encodeURIComponent(jobId)}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(20000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.code) throw new Error(`Read-only status/log request failed: HTTP ${response.status}, ${data.code || 'unknown'}`);
  return data;
}

async function poll() {
  const data = await get('');
  const output = data.output;
  if (!output || output.job_id !== jobId || typeof output.status !== 'string') throw new Error('Unexpected provider task response');
  const observedAt = new Date().toISOString();
  const fields = ['job_id', 'job_name', 'status', 'model', 'base_model', 'training_type', 'hyper_parameters', 'create_time', 'end_time', 'usage', 'finetuned_output', 'code', 'message'];
  const latest = { observedAt, requestId: data.request_id, ...Object.fromEntries(fields.filter(k => output[k] !== undefined).map(k => [k, output[k]])) };
  save('latest-job.json', latest);
  appendFileSync(join(destination, 'status-history.jsonl'), redact(JSON.stringify(latest)) + '\n');
  const planPath = resolve('finetuning/training-plan.json');
  const plan = JSON.parse(readFileSync(planPath, 'utf8'));
  if (plan.trainingJobId === jobId) {
    plan.status = latest.status;
    plan.trainingTaskCreated = true;
    plan.trainingStarted = plan.trainingStarted || ['RUNNING', 'SUCCEEDED'].includes(latest.status);
    plan.lastTrainingStatusCheckedAt = observedAt;
    plan.actualHyperparameters = latest.hyper_parameters || plan.actualHyperparameters;
    if (latest.finetuned_output) plan.fineTunedModelId = latest.finetuned_output;
    if (typeof latest.usage === 'number') {
      plan.actualTrainingTokensReported = latest.usage;
      plan.trainingFeeFromReportedUsageCny = Math.round(latest.usage / 1000 * .006 * 100) / 100;
      plan.feeIsFinalBill = false;
      plan.reportedUsageFeeExceedsBudget = plan.trainingFeeFromReportedUsageCny > plan.budgetCapCny;
    }
    writeFileSync(planPath, JSON.stringify(plan, null, 2) + '\n');
  }
  const logState = json('platform-logs.json', { jobId, nextOffset: 0, entries: [] });
  try {
    for (let batch = 0; batch < 10; batch++) {
      const logs = await get(`/logs?offset=${logState.nextOffset}&line=200`);
      const rows = logs.output?.logs;
      if (!Array.isArray(rows)) throw new Error('Unexpected training-log structure');
      const startOffset = logState.nextOffset;
      rows.forEach((value, index) => logState.entries.push({ index: startOffset + index, observedAt, value }));
      logState.nextOffset += rows.length;
      logState.providerTotal = logs.output.total;
      logState.lastCheckedAt = observedAt;
      logState.lastError = null;
      save('platform-logs.json', logState);
      if (!rows.length || logState.nextOffset >= logs.output.total) break;
    }
  } catch (error) {
    logState.lastError = redact(error.message); logState.lastCheckedAt = observedAt;
    save('platform-logs.json', logState);
  }
  save('observer-health.json', { pid: process.pid, jobId, lastSuccessfulStatusAt: observedAt, status: latest.status,
    capturedLogEntries: logState.entries.length, logError: logState.lastError, readOnly: true, deploymentCreated: false });
  if (terminal.has(latest.status)) save('completion.json', { ...latest, capturedLogEntries: logState.entries.length,
    trainingFeeCnyEstimatedFromReportedUsage: typeof latest.usage === 'number' ? Math.round(latest.usage / 1000 * .006 * 100) / 100 : null,
    feeIsFinalBill: false, modelDeployed: false, evaluationPerformed: false });
  console.log(JSON.stringify({ jobId, status: latest.status, capturedLogEntries: logState.entries.length,
    usage: latest.usage, modelId: latest.finetuned_output || null, logError: logState.lastError }));
  return terminal.has(latest.status);
}

try {
  const deadline = Date.now() + hours * 3600000;
  while (true) {
    try {
      if (await poll()) break;
    } catch (error) {
      save('observer-error.json', { recordedAt: new Date().toISOString(), jobId, error: redact(error.message), readOnly: true });
      if (!watch) throw new Error(redact(error.message));
    }
    if (!watch || Date.now() + interval * 1000 > deadline) break;
    await sleep(interval * 1000);
  }
} finally {
  if (ownsLock) unlinkSync(lock);
}
