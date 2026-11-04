// Runs at most three real requests through the production local handler.
// Raw outputs are recorded before normalization; no credentials are recorded.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { loadEnv } from 'vite';
import { handleAdvisorRequest } from '../server/qwen-advisor.mjs';

const deployment = JSON.parse(readFileSync('finetuning/v8/deployment-status.json', 'utf8'));
if (!process.argv.includes('--run')) {
  console.log(JSON.stringify({ mode: 'dry_run', model: deployment.deployed_model, maximumRequests: 3 }));
  process.exit(0);
}
assert.equal(deployment.status, 'RUNNING');
assert.equal(deployment.plan, 'lora');
const destination = 'docs/evaluations/deployment-v8-smoke.json';
if (existsSync(destination)) throw new Error('Observations already exist. Inspect them before repeating paid calls.');
const env = { ...loadEnv('development', process.cwd(), ''), QWEN_MODEL: deployment.deployed_model };
const apiKey = (env.QWEN_API_KEY || env.DASHSCOPE_API_KEY || '').trim();
assert.ok(apiKey);
assert.equal(new URL(env.QWEN_BASE_URL).hostname, 'dashscope.aliyuncs.com');
assert.equal(new URL(env.QWEN_BASE_URL).protocol, 'https:');
const report = { startedAt: new Date().toISOString(), model: env.QWEN_MODEL, deploymentPlan: deployment.plan,
  scope: 'Connectivity and course-format smoke checks, not independent answer-accuracy evaluation',
  upstream: [], results: [] };
const save = () => writeFileSync(destination, JSON.stringify(report, null, 2).replaceAll(apiKey, '[redacted]').replace(/sk-[a-z0-9_-]+/gi, '[redacted]') + '\n');
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const start = performance.now();
  const response = await originalFetch(url, options);
  if (String(url).startsWith('https://dashscope.aliyuncs.com/') && String(url).endsWith('/chat/completions')) {
    const data = await response.clone().json().catch(() => ({}));
    const payload = JSON.parse(options.body);
    report.upstream.push({ httpStatus: response.status, latencyMs: Math.round(performance.now() - start),
      requestedModel: payload.model, returnedModel: data.model, requestId: data.id,
      finishReason: data.choices?.[0]?.finish_reason, usage: data.usage,
      rawContent: data.choices?.[0]?.message?.content, error: response.ok ? undefined : data.error || { code: data.code, message: data.message } });
    save();
  }
  return response;
};
const server = createServer((req, res) => handleAdvisorRequest(req, res, env));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const history = [];
try {
  for (const [index, question] of ['请问COMP4431是什么课？', '我想学machine learning相关内容，给我推荐一些课', '请继续推荐更多相关课程，避开之前介绍过的课程。'].entries()) {
    const context = index === 2 ? history : [];
    const start = performance.now();
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/advisor`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: question, history: context, profile: {} }), signal: AbortSignal.timeout(65000)
    });
    const answer = await response.json();
    const shown = (answer.courses || []).map(c => c.code);
    const previousShown = index === 2 ? report.results[1].shownCodes : [];
    const checks = {
      httpOk: response.ok, textPresent: typeof answer.text === 'string' && !!answer.text.trim(),
      courseCountWithinLimit: shown.length <= 3,
      requestedCoursePresent: index !== 0 || shown.includes('COMP4431'),
      courseIntroductionsPresent: index === 2 || shown.length > 0,
      overviewBeforeMultipleCards: shown.length < 2 || typeof answer.overview === 'string' && !!answer.overview.trim(),
      threeFollowUpsWhenCards: !shown.length || Array.isArray(answer.followUps) && answer.followUps.length === 3,
      summariesBounded: (answer.courses || []).every(c => Array.from(c.summary || '').length <= 500),
      preparationPresent: (answer.courses || []).every(c => c.preparation && typeof c.preparation.sourceText === 'string'),
      noRepeatedContinuation: !shown.some(code => previousShown.includes(code))
    };
    report.results.push({ question, httpStatus: response.status, latencyMs: Math.round(performance.now() - start), shownCodes: shown,
      checks, passed: Object.values(checks).every(Boolean), normalizedAnswer: answer });
    save();
    console.log(JSON.stringify({ case: index + 1, status: response.status, shownCodes: shown, passed: report.results.at(-1).passed }));
    if (!response.ok) break;
    if (index === 1) history.push({ role: 'user', text: question }, { ...answer, role: 'assistant' });
  }
  report.completedAt = new Date().toISOString();
  report.passed = report.results.length === 3 && report.results.every(r => r.passed);
  report.reportedUsage = report.upstream.reduce((sum, row) => ({ inputTokens: sum.inputTokens + (row.usage?.prompt_tokens || 0),
    outputTokens: sum.outputTokens + (row.usage?.completion_tokens || 0) }), { inputTokens: 0, outputTokens: 0 });
  report.estimatedInferenceFeeCny = (report.reportedUsage.inputTokens * .5 + report.reportedUsage.outputTokens * 2) / 1000000;
  report.feeIsFinalBill = false;
  save();
  if (!report.passed) process.exitCode = 1;
} finally {
  globalThis.fetch = originalFetch;
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
