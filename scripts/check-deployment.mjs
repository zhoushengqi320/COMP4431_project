// Refreshes the status of the existing deployment; never creates resources.
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { loadEnv } from 'vite';

const record = JSON.parse(readFileSync('finetuning/v8/deployment-submission.json', 'utf8'));
const model = record.output?.deployed_model;
if (record.status !== 'created' || typeof model !== 'string' || !/^[a-zA-Z0-9-]+$/.test(model)) throw new Error('A confirmed deployment is required');
const env = loadEnv('development', process.cwd(), '');
const key = (env.QWEN_API_KEY || env.DASHSCOPE_API_KEY || '').trim();
if (!key) throw new Error('A server-side key is required');
const response = await fetch(`https://dashscope.aliyuncs.com/api/v1/deployments/${encodeURIComponent(model)}`, {
  headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20000)
});
const data = await response.json().catch(() => ({}));
if (!response.ok || !data.output || data.output.deployed_model !== model) throw new Error(`Deployment query failed: HTTP ${response.status}, ${data.code || 'unexpected response'}`);
const fields = ['deployed_model', 'model_name', 'base_model', 'status', 'plan', 'capacity', 'ready_capacity', 'max_context_length', 'fail_reason'];
const latest = { observedAt: new Date().toISOString(), httpStatus: response.status,
  ...Object.fromEntries(fields.filter(k => data.output[k] !== undefined).map(k => [k, data.output[k]])) };
const safe = value => JSON.stringify(value).replaceAll(key, '[redacted]').replace(/sk-[a-z0-9_-]+/gi, '[redacted]');
writeFileSync('finetuning/v8/deployment-status.json', safe(latest) + '\n');
appendFileSync('finetuning/v8/deployment-status-history.jsonl', safe(latest) + '\n');
const plan = JSON.parse(readFileSync('finetuning/training-plan.json', 'utf8'));
plan.deploymentStatus = latest.status;
plan.deploymentLastCheckedAt = latest.observedAt;
plan.deployedModel = latest.deployed_model;
writeFileSync('finetuning/training-plan.json', JSON.stringify(plan, null, 2) + '\n');
console.log(safe(latest));
