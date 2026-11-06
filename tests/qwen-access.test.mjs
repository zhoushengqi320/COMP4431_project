import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createAdvisorAccess } from '../server/advisor-access.mjs';

async function fixture(t, { access = 'guest' } = {}) {
  let calls = 0;
  let account = access === 'member' ? { user: { id: 'member-1' } } : null;
  const upstream = createServer(async (req, res) => {
    calls++;
    req.resume();
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: '{"text":"A mock answer."}' } }] }));
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const auth = {
    getAccount: () => account,
    checkSameOrigin: () => true,
    requireUser(req, res) {
      if (account) return account;
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Please sign in again.' }));
      return null;
    }
  };
  const handler = createAdvisorAccess({ auth, env: {
    QWEN_API_KEY: 'mock-key', QWEN_MODEL: 'mock-model',
    QWEN_BASE_URL: `http://127.0.0.1:${upstream.address().port}/v1`
  } });
  const server = createServer((req, res) => {
    const pending = handler(req, res);
    // The initial authorization has completed, but the request body is still asynchronous.
    if (access === 'member') account = null;
    return pending;
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections(); upstream.closeAllConnections();
    await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => upstream.close(resolve))]);
  });
  return {
    get calls() { return calls; },
    post(body) {
      const multipart = body instanceof FormData;
      return fetch(`http://127.0.0.1:${server.address().port}/api/advisor`, {
        method: 'POST', headers: multipart ? {} : { 'Content-Type': 'application/json' },
        body: multipart ? body : JSON.stringify(body)
      });
    }
  };
}

test('actual Qwen route rejects guest profiles and all file upload fields before upstream calls', async t => {
  const app = await fixture(t);
  const profile = await app.post({ message: 'Recommend courses', profile: { interests: 'AI' } });
  assert.equal(profile.status, 403);
  for (const field of ['documents', 'attachments', 'files']) {
    const inline = await app.post({ message: 'Read my file', [field]: [{ text: 'Private file' }] });
    assert.equal(inline.status, 403);
  }
  for (const field of ['documents', 'attachments', 'arbitrary-file-field']) {
    const form = new FormData();
    form.set('message', 'Read this file');
    form.set(field, new File(['Private file'], 'note.txt'));
    assert.equal((await app.post(form)).status, 403);
  }
  const valid = await app.post({ message: 'Recommend more related courses', profile: {} });
  assert.equal(valid.status, 200);
  assert.equal(app.calls, 0);
});

test('actual Qwen route rechecks membership after reading the request before any model calls', async t => {
  const app = await fixture(t, { access: 'member' });
  const response = await app.post({ message: 'What is COMP4431?' });
  assert.equal(response.status, 401);
  assert.match((await response.json()).error, /sign in/i);
  assert.equal(app.calls, 0);
});
