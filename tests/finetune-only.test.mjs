import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleAdvisorRequest } from '../server/qwen-advisor.mjs';

test('finetune-only HTTP mode isolates current question, preserves raw output and records observations without paid calls', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'polypath-raw-'));
  const requests = [];
  const raw = '  ```json\n{"text":"模型原话","courses":[{"code":"UNKNOWN9999"}]}\n```  ';
  let upstreamStatus = 200, finishReason = 'stop';
  const mock = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push(JSON.parse(body));
    res.writeHead(upstreamStatus, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(upstreamStatus === 200 ? { id: 'mock-id', model: 'mock-returned-model',
      choices: [{ message: { content: raw }, finish_reason: finishReason }],
      usage: { prompt_tokens: 12, completion_tokens: 34, total_tokens: 46 } }
      : { error: { message: 'denied sk-test-secret' } }));
  });
  await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
  const env = { QWEN_API_KEY: 'sk-test-secret', QWEN_MODEL: 'test-finetuned-model',
    QWEN_ADVISOR_MODE: 'finetune-only', QWEN_OBSERVATIONS_DIR: directory,
    QWEN_BASE_URL: `http://127.0.0.1:${mock.address().port}/v1` };
  const server = createServer((req, res) => handleAdvisorRequest(req, res, env));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/advisor`;
  const post = () => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '请继续推荐更多相关课程',
      history: [{ role: 'assistant', text: 'Old format instructions must not enter this call' }],
      profile: { major: 'Must not enter this call' } }) });
  try {
    const response = await post();
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.text, raw);
    assert.equal(data.rawMode, true);
    assert.equal(data.courses, undefined);
    assert.equal(data.observationSaved, true);
    assert.deepEqual(requests[0], { model: 'test-finetuned-model', stream: false,
      max_tokens: 8192, enable_thinking: false,
      messages: [{ role: 'user', content: '请继续推荐更多相关课程' }] });
    finishReason = 'length';
    assert.equal((await (await post()).json()).finishReason, 'length');
    upstreamStatus = 401;
    const denied = await post();
    assert.equal(denied.status, 502);
    assert.doesNotMatch(await denied.text(), /sk-test-secret/);
    env.QWEN_MODEL = '';
    assert.equal((await post()).status, 503);
    assert.equal(requests.length, 3, 'missing explicit model must never fall back to qwen-plus');
    const saved = await readFile(join(directory, 'finetune-only.jsonl'), 'utf8');
    assert.doesNotMatch(saved, /sk-test-secret/);
    const records = saved.trim().split('\n').map(JSON.parse);
    assert.equal(records.length, 3);
    assert.equal(records[0].content, raw);
    assert.deepEqual(records[0].usage, { prompt_tokens: 12, completion_tokens: 34, total_tokens: 46 });
    for (const key of ['systemPromptApplied', 'retrievalApplied', 'historyApplied', 'jsonConstraintApplied', 'normalizationApplied']) {
      assert.equal(records[0][key], false);
    }
    assert.equal(records[0].returnedModel, 'mock-returned-model');
    assert.ok(records[0].latencyMs >= 0);
    assert.equal(records[1].finishReason, 'length');
    assert.match(records[2].error, /401/);
  } finally {
    server.closeAllConnections(); mock.closeAllConnections();
    await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => mock.close(resolve))]);
    await rm(directory, { recursive: true, force: true });
  }
});
