import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadEnv } from 'vite';
import { handleAdvisorRequest } from '../server/qwen-advisor.mjs';

const stage = process.argv[2] || 'after';
const label = process.argv[3] || '';
if (label && !/^[a-z0-9-]+$/.test(label)) throw new Error('Invalid experiment label');
if (!['before', 'after'].includes(stage)) throw new Error('Use before or after');
const env = loadEnv('development', process.cwd(), '');
// Use the same local snapshot for both stages so catalogue changes cannot bias comparison.
delete env.SUPABASE_URL;
delete env.SUPABASE_ANON_KEY;
const server = createServer((req, res) => handleAdvisorRequest(req, res, env));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const results = [];
try {
  for (const message of (process.argv[4] ? [process.argv[4]] : ['请问Comp4431是什么课', '请介绍DSAI2201，包括必要先修和建议先修'])) {
    const started = performance.now();
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }), signal: AbortSignal.timeout(65000)
      });
      const answer = await response.json();
      results.push({ message, status: response.status, latencyMs: Math.round(performance.now() - started), answer });
    } catch (error) {
      results.push({ message, latencyMs: Math.round(performance.now() - started), error: error.name });
    }
  }
} finally { server.closeAllConnections(); server.close(); }
mkdirSync('docs/evaluations', { recursive: true });
writeFileSync(`docs/evaluations/course-format-${stage}${label ? `-${label}` : ''}.json`, JSON.stringify({
  recordedAt: new Date().toISOString(), stage, model: env.QWEN_MODEL || 'qwen-plus',
  catalogue: 'local snapshot', results
}, null, 2));
console.log(JSON.stringify(results.map(({ message, status, latencyMs, error, answer }) => ({
  message, status, latencyMs, error, courseCount: answer?.courses?.length || 0,
  standardized: answer?.courses?.every(course => course.format === 'course-introduction-v1') ?? false
})), null, 2));
