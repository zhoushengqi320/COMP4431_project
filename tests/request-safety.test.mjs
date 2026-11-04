import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import { RequestError, assertLocalOrigin, readRequestBody, validateChatFields, upstreamRequest } from '../server/request-safety.mjs';
import { handleAdvisorRequest, handleTranscribeRequest } from '../server/qwen-advisor.mjs';

test('local API rejects cross-site and DNS-rebinding hosts', () => {
  assert.doesNotThrow(() => assertLocalOrigin({ headers: { host: '127.0.0.1:5174', origin: 'http://127.0.0.1:5174' } }));
  assert.throws(() => assertLocalOrigin({ headers: { host: '127.0.0.1:5174', origin: 'https://evil.invalid' } }), error => error.status === 403);
  assert.throws(() => assertLocalOrigin({ headers: { host: 'evil.invalid:5174' } }), error => error.status === 403);
});

test('request bodies are bounded with and without a declared content length', async () => {
  const req = Readable.from([Buffer.alloc(6), Buffer.alloc(6)]); req.headers = {};
  await assert.rejects(readRequestBody(req, 10), error => error.status === 413);
  const declared = Readable.from([]); declared.headers = { 'content-length': '11' };
  await assert.rejects(readRequestBody(declared, 10), error => error.status === 413);
  assert.throws(() => validateChatFields({ message: 'x', history: {}, profile: {} }), error => error.status === 400);
  assert.throws(() => validateChatFields({ message: {}, history: [], profile: {} }), error => error.status === 400);
});

test('upstream timeouts/disconnects cancel work and redact key-bearing errors', async () => {
  const abortingFetch = (_url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true }));
  const res = new EventEmitter(); res.writableEnded = false;
  await assert.rejects(upstreamRequest('http://test.invalid', 'sk-audit-only', {}, res, { timeoutMs: 5, fetchImpl: abortingFetch }), error => error.status === 504);
  const pending = upstreamRequest('http://test.invalid', 'sk-audit-only', {}, res, { timeoutMs: 1000, fetchImpl: abortingFetch });
  res.emit('close');
  await assert.rejects(pending, error => error.status === 504);
  const failingFetch = async () => new Response(JSON.stringify({ error: { message: 'bad key sk-audit-only' } }), { status: 401 });
  await assert.rejects(upstreamRequest('http://test.invalid', 'sk-audit-only', {}, res, { fetchImpl: failingFetch }), error => error instanceof RequestError && error.status === 502 && !error.message.includes('sk-audit-only'));
});

test('HTTP integration accepts valid chat and rejects malformed/cross-origin requests without paid calls', async () => {
  let calls = 0, mode = 'valid';
  const mock = createServer((req, res) => {
    calls++;
    req.resume();
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: mode === 'valid' ? JSON.stringify({ text: '介绍', courses: [{ code: 'DSAI2201', summary: '学习组织数据和解决问题的方法。' }] }) : 'null' } }] }));
    });
  });
  await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
  const env = { QWEN_API_KEY: 'sk-audit-only', QWEN_BASE_URL: `http://127.0.0.1:${mock.address().port}/v1` };
  const server = createServer((req, res) => req.url === '/api/transcribe' ? handleTranscribeRequest(req, res, env) : handleAdvisorRequest(req, res, env));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/advisor`;
  const post = (body, headers = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  try {
    assert.equal((await post({ message: '介绍DSAI2201' }, { Origin: 'https://evil.invalid' })).status, 403);
    assert.equal((await post('{')).status, 400);
    assert.equal((await post('null')).status, 400);
    assert.equal((await post({ message: '你好', history: {} })).status, 400);
    assert.equal((await post({ message: '你好', profile: [] })).status, 400);
    assert.equal((await post({ message: 'x'.repeat(6001) })).status, 400);
    const multipart = new FormData(); multipart.append('message', '你好'); multipart.append('history', '{}');
    assert.equal((await fetch(url, { method: 'POST', body: multipart })).status, 400);
    assert.equal((await post({ message: '请继续推荐更多相关课程' })).status, 200);
    assert.equal(calls, 0);
    const response = await post({ message: '介绍DSAI2201' });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).courses[0].code, 'DSAI2201');
    mode = 'invalid';
    assert.equal((await post({ message: '介绍DSAI2201' })).status, 502);
    assert.equal(calls, 2);
  } finally {
    server.closeAllConnections(); mock.closeAllConnections();
    await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => mock.close(resolve))]);
  }
});
