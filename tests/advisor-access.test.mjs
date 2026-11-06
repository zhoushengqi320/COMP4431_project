import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, request } from 'node:http';
import { createServer as createViteServer } from 'vite';
import { advisorPlugin } from '../vite.config.js';
import { createAppServer } from '../server/index.mjs';
import { createAdvisorAccess } from '../server/advisor-access.mjs';
import { handleAdvisorRequest } from '../server/deepseek-advisor.mjs';

async function fixture(t, adapter, extraOptions = {}) {
  let modelCalls = 0;
  const env = { AUTH_DATABASE_PATH: ':memory:', DEEPSEEK_API_KEY: 'must-never-be-used-by-guests' };
  const advisorHandler = (...args) => {
    extraOptions.onAdviceStart?.();
    return handleAdvisorRequest(...args);
  };
  const advisorAccessOptions = {
    ...extraOptions,
    advisorHandler,
    handlerOptions: {
      fetchImpl: async (url, options) => {
        modelCalls++;
        const payload = JSON.parse(options.body);
        const sources = JSON.parse(payload.messages.at(-1).content).retrieved_sources;
        return Response.json({ choices: [{ message: { content: JSON.stringify({
          text: 'Member-only model answer.', sourceIds: sources.slice(0, 1).map(source => source.id)
        }) } }] });
      }
    }
  };
  let port;
  if (adapter === 'production') {
    const server = createAppServer({ env, advisorAccessOptions, advisorHandler });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;
    t.after(() => new Promise(resolve => server.close(resolve)));
  } else {
    const vite = await createViteServer({
      configFile: false, plugins: [advisorPlugin(env, { advisorAccessOptions })],
      appType: 'custom', logLevel: 'silent', optimizeDeps: { noDiscovery: true, include: [] },
      server: { host: '127.0.0.1', port: 0, strictPort: true, hmr: false }
    });
    t.after(() => vite.close());
    try {
      // Vite's listen() replaces port 0 with its default. Its HTTP server's
      // wrapped listen() still initializes Vite while preserving Node's port 0.
      await Promise.all([
        once(vite.httpServer, 'listening'),
        vite.httpServer.listen(0, '127.0.0.1')
      ]);
      port = vite.httpServer.address().port;
    } catch (error) {
      await vite.close();
      throw error;
    }
  }
  const base = `http://127.0.0.1:${port}`;
  return {
    base,
    get modelCalls() { return modelCalls; },
    async request(path, { body, headers = {}, method = body === undefined ? 'GET' : 'POST' } = {}) {
      const multipart = body instanceof FormData;
      const response = await fetch(`${base}${path}`, {
        method, headers: { Connection: 'close', ...(body !== undefined && !multipart ? { 'Content-Type': 'application/json' } : {}), ...headers },
        ...(body === undefined ? {} : { body: multipart ? body : JSON.stringify(body) })
      });
      return { status: response.status, headers: response.headers, data: await response.json() };
    },
    async register() {
      const response = await fetch(`${base}/api/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close' },
        body: JSON.stringify({ name: 'Member Student', email: `${adapter}@example.com`, password: 'member-password-123' })
      });
      assert.equal(response.status, 201);
      const data = await response.json();
      return { Cookie: response.headers.get('set-cookie').split(';')[0], 'X-PolyPath-User': data.user.id };
    }
  };
}

function startSlowRequest(base, headers = {}) {
  const body = JSON.stringify({ message: 'What is COMP4431?' });
  let upload;
  const response = new Promise((resolve, reject) => {
    upload = request(`${base}/api/advisor`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), Connection: 'close', ...headers }
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) }));
    });
    upload.on('error', reject);
    upload.write(body.slice(0, 10));
  });
  return { response, finish: () => upload.end(body.slice(10)), destroy: () => upload.destroy() };
}

test('guest voice requests preserve the configured speech reply model', async () => {
  let forwarded;
  const access = createAdvisorAccess({
    auth: { getAccount: () => null, checkSameOrigin: () => true },
    env: {
      QWEN_API_KEY: 'test-key', QWEN_MODEL: 'fine-tuned-course-model',
      QWEN_PLANNER_MODEL: 'search-model', QWEN_VOICE_MODEL: 'spoken-reply-model',
      QWEN_ASR_MODEL: 'transcription-model', DEEPSEEK_API_KEY: 'member-only-key'
    },
    advisorHandler: async (req, res, env) => { forwarded = env; }
  });
  await access({ url: '/api/advisor', method: 'POST', headers: { 'x-polypath-access': 'guest' },
    socket: { remoteAddress: '127.0.0.1' } }, { setHeader() {} });
  assert.equal(forwarded.QWEN_VOICE_MODEL, 'spoken-reply-model');
  assert.equal(forwarded.QWEN_MODEL, 'fine-tuned-course-model');
  assert.equal(forwarded.QWEN_PLANNER_MODEL, 'search-model');
  assert.equal(forwarded.QWEN_ASR_MODEL, 'transcription-model');
  assert.equal(forwarded.DEEPSEEK_API_KEY, undefined);
});

for (const adapter of ['production', 'vite']) {
  test(`${adapter}: anonymous and explicitly forced guest requests use knowledge only`, async t => {
    const app = await fixture(t, adapter);
    const status = await app.request('/api/advisor/status');
    assert.equal(status.status, 200);
    assert.equal(status.data.mode, 'knowledge');
    assert.equal(status.data.access, 'guest');
    assert.equal(status.data.model, undefined);
    assert.deepEqual(status.data.guestLimits, { requests: 20, windowSeconds: 900 });
    const anonymous = await app.request('/api/advisor', { body: { message: 'What is COMP4431?' } });
    assert.equal(anonymous.status, 200);
    assert.equal(anonymous.data.mode, 'knowledge');
    assert.equal(anonymous.data.guestRemaining, 19);
    assert.equal(app.modelCalls, 0);
    const member = await app.register();
    const memberStatus = await app.request('/api/advisor/status', { headers: member });
    assert.equal(memberStatus.data.mode, 'llm');
    assert.equal(memberStatus.data.access, 'member');
    const guestHeaders = { Cookie: member.Cookie, 'X-PolyPath-Access': 'guest' };
    const forcedStatus = await app.request('/api/advisor/status', { headers: guestHeaders });
    assert.equal(forcedStatus.data.mode, 'knowledge');
    const forced = await app.request('/api/advisor', { headers: guestHeaders, body: { message: 'What are the prerequisites of COMP4431?' } });
    assert.equal(forced.data.mode, 'knowledge');
    assert.equal(forced.data.access, 'guest');
    assert.equal(app.modelCalls, 0);
    const forcedProfile = await app.request('/api/advisor', { headers: guestHeaders, body: { message: 'Recommend courses', profile: { programme: 'Computing' } } });
    assert.equal(forcedProfile.status, 403);
    const full = await app.request('/api/advisor', { headers: member, body: { message: 'What is COMP4431?', profile: { programme: 'Computing' } } });
    assert.equal(full.status, 200);
    assert.equal(full.data.mode, 'llm');
    assert.equal(full.data.access, 'member');
    assert.equal(app.modelCalls, 1);
    const document = new FormData();
    document.append('message', 'What does my uploaded academic document say?');
    document.append('documents', new File(['Computing programme requirement: complete 132 credits.'], 'requirements.txt'));
    const memberDocument = await app.request('/api/advisor', { headers: member, body: document });
    assert.equal(memberDocument.status, 200);
    assert.equal(memberDocument.data.documents[0].name, 'requirements.txt');
    assert.equal(app.modelCalls, 2);
    assert.doesNotMatch(JSON.stringify(status.data), /must-never-be-used/);
  });

  test(`${adapter}: guest uploads and profile data are rejected at the server boundary`, async t => {
    const app = await fixture(t, adapter);
    const denied = await app.request('/api/advisor', { body: { message: 'Recommend courses', profile: { interests: 'machine learning' } } });
    assert.equal(denied.status, 403);
    assert.match(denied.data.error, /Sign in/);
    const file = new FormData();
    file.append('message', 'Read this file');
    file.append('documents', new File(['Course text'], 'course.txt'));
    assert.equal((await app.request('/api/advisor', { body: file })).status, 403);
    const unknownField = new FormData();
    unknownField.append('message', 'Read this file');
    unknownField.append('arbitrary-upload-name', new File(['Course text'], 'course.txt'));
    assert.equal((await app.request('/api/advisor', { body: unknownField })).status, 403);
    assert.equal((await app.request('/api/advisor', { body: { message: 'Read this file', documents: [{ name: 'fake.txt', text: 'Uploaded inline' }] } })).status, 403);
    const allowed = new FormData();
    allowed.append('message', 'What are the prerequisites for the first course?');
    allowed.append('profile', '{}');
    allowed.append('history', JSON.stringify([{ role: 'assistant', text: 'Two choices.', courses: [{ code: 'COMP4431' }, { code: 'COMP4432' }] }]));
    const followup = await app.request('/api/advisor', { body: allowed });
    assert.equal(followup.status, 200);
    assert.ok(followup.data.evidence.some(source => source.code === 'COMP4431'));
    assert.equal((await app.request('/api/profile', { method: 'PUT', body: { programme: 'Computing' } })).status, 401);
    assert.equal((await app.request('/api/conversations')).status, 401);
    assert.equal(app.modelCalls, 0);
  });

  test(`${adapter}: stale expected accounts never downgrade to guest and cross-site requests fail`, async t => {
    const app = await fixture(t, adapter);
    const member = await app.register();
    const stale = { ...member, 'X-PolyPath-User': 'different-user', 'X-PolyPath-Access': 'guest' };
    assert.equal((await app.request('/api/advisor/status', { headers: stale })).status, 401);
    assert.equal((await app.request('/api/advisor', { headers: stale, body: { message: 'What is COMP4431?' } })).status, 401);
    const crossSite = await app.request('/api/advisor', { headers: { Origin: 'https://unrelated.example' }, body: { message: 'What is COMP4431?' } });
    assert.equal(crossSite.status, 403);
    await app.request('/api/auth/logout', { headers: member, body: {} });
    assert.equal((await app.request('/api/advisor/status', { headers: member })).status, 401);
    assert.equal((await app.request('/api/advisor', { headers: member, body: { message: 'What is COMP4431?' } })).status, 401);
    assert.equal(app.modelCalls, 0);
  });

  test(`${adapter}: guest quota is shared per socket peer, ignores forwarding spoofing and resets`, async t => {
    let time = 1000;
    const app = await fixture(t, adapter, { rateLimitMax: 2, rateLimitWindowMs: 15_000, now: () => time });
    const body = { message: 'What is COMP4431?' };
    assert.equal((await app.request('/api/advisor', { body })).data.guestRemaining, 1);
    assert.equal((await app.request('/api/advisor', { body, headers: { 'X-Forwarded-For': '203.0.113.5' } })).data.guestRemaining, 0);
    const blocked = await app.request('/api/advisor', { body, headers: { 'X-Forwarded-For': '203.0.113.6' } });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get('retry-after'), '15');
    assert.equal(blocked.data.access, 'guest');
    const member = await app.register();
    assert.equal((await app.request('/api/advisor', { body, headers: member })).status, 200);
    time += 15_001;
    assert.equal((await app.request('/api/advisor', { body })).status, 200);
  });

  test(`${adapter}: logout during body upload blocks member work with and without an expected-user header`, async t => {
    let started = 0;
    let bothStarted;
    const ready = new Promise(resolve => { bothStarted = resolve; });
    const app = await fixture(t, adapter, { onAdviceStart() { if (++started === 2) bothStarted(); } });
    const member = await app.register();
    const expected = startSlowRequest(app.base, member);
    const cookieOnly = startSlowRequest(app.base, { Cookie: member.Cookie });
    t.after(() => { expected.destroy(); cookieOnly.destroy(); });
    await ready;
    const logout = await app.request('/api/auth/logout', { headers: member, body: {} });
    assert.equal(logout.status, 200);
    expected.finish(); cookieOnly.finish();
    const responses = await Promise.all([expected.response, cookieOnly.response]);
    for (const response of responses) {
      assert.equal(response.status, 401);
      assert.match(response.data.error, /sign in/i);
      assert.equal(response.data.mode, undefined);
    }
    assert.equal(app.modelCalls, 0);
  });
}

test('member revalidation pins the initial identity even for a cookie-only caller', async t => {
  let account = { user: { id: 'first-user' }, profile: {} };
  let began;
  const ready = new Promise(resolve => { began = resolve; });
  let modelCalls = 0;
  const advisorAccess = createAdvisorAccess({
    auth: { getAccount: () => account, requireUser: () => account, checkSameOrigin: () => true },
    env: { DEEPSEEK_API_KEY: 'fake-key' },
    advisorHandler: (...args) => { began(); return handleAdvisorRequest(...args); },
    handlerOptions: { fetchImpl: async () => { modelCalls++; throw new Error('A changed account must never reach the model'); } }
  });
  const server = createServer((req, res) => advisorAccess(req, res));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const upload = startSlowRequest(`http://127.0.0.1:${server.address().port}`, { Cookie: 'session=example' });
  t.after(() => upload.destroy());
  await ready;
  account = { user: { id: 'second-user' }, profile: {} };
  upload.finish();
  const response = await upload.response;
  assert.equal(response.status, 401);
  assert.match(response.data.error, /account has changed/i);
  assert.equal(modelCalls, 0);
});
