import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createAuthService } from '../server/auth.mjs';

const message = (text = 'What are the prerequisites for COMP4431?') => ({ id: randomUUID(), role: 'user', text });
const payload = (title = 'AI course planning', messages = [message()], revision = 0) => ({ title, messages, revision });

async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'polypath-conversations-test-'));
  const databasePath = join(directory, 'accounts.sqlite');
  let service;
  let server;
  let base;
  async function start() {
    service = createAuthService({ databasePath, ...options });
    server = createServer(async (req, res) => {
      if (await service.handle(req, res)) return;
      res.statusCode = 404;
      res.end();
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  async function stop() {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    service.close();
  }
  await start();
  t.after(async () => { await stop(); await rm(directory, { recursive: true, force: true }); });
  async function call(path, { method = 'GET', data, cookie, expectedUser, headers = {} } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: { ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...(expectedUser ? { 'X-PolyPath-User': expectedUser } : {}), ...headers },
      ...(data === undefined ? {} : { body: JSON.stringify(data) })
    });
    return { status: response.status, body: await response.json(), headers: response.headers, cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  async function register(email = 'history@example.test') {
    const response = await call('/api/auth/register', { method: 'POST', data: { name: 'History Test', email, password: 'Temporary-history-password-42' } });
    assert.equal(response.status, 201);
    return { cookie: response.cookie, user: response.body.user };
  }
  return {
    call, register, get base() { return base; }, restart: async () => { await stop(); await start(); },
    account: (cookie, expectedUser) => service.getAccount({ headers: { cookie, ...(expectedUser ? { 'x-polypath-user': expectedUser } : {}) } })
  };
}

test('saved conversations preserve visible messages, revisions, ordering and restart persistence', async t => {
  let time = Date.now();
  const app = await fixture(t, { now: () => time });
  const user = await app.register();
  const options = { cookie: user.cookie, expectedUser: user.user.id };
  assert.deepEqual((await app.call('/api/conversations', options)).body, { conversations: [] });
  const id = randomUUID();
  const assistant = {
    id: randomUUID(), role: 'assistant', text: 'Check the published prerequisite alternatives.', mode: 'knowledge', language: 'en',
    courses: [{ code: 'COMP4431', title: 'Artificial Intelligence', credits: 3, tag: 'Reference', reason: 'Relevant to AI.', prerequisite: 'COMP2011 or equivalent.' }],
    semesters: [{ title: 'Illustrative study order', credits: 3, courses: ['COMP4431 · Artificial Intelligence'] }],
    sources: [{ id: 'course-comp4431', title: 'Subject description', detail: 'Published prerequisite information.', kind: 'course', url: 'https://www.polyu.edu.hk/comp/docdrive/ug/subject/COMP4431.pdf' }],
    checks: ['Verify your cohort requirements.'], warnings: ['Uploaded text is unverified.'], documentWarnings: ['No OCR.'], providerWarning: 'Local reference mode.', followUps: ['What about COMP4432?']
  };
  const messages = [{ ...message(), attachments: [{ name: 'transcript.pdf', size: 1280 }] }, assistant];
  const created = await app.call(`/api/conversations/${id}`, { ...options, method: 'PUT', data: payload('AI course planning', messages) });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body.conversation, { id, title: 'AI course planning', messages, revision: 1, updatedAt: new Date(time).toISOString() });
  assert.equal(created.headers.get('cache-control'), 'no-store');
  time += 1000;
  const secondId = randomUUID();
  assert.equal((await app.call(`/api/conversations/${secondId}`, { ...options, method: 'PUT', data: payload('Database planning') })).status, 201);
  time += 1000;
  const edited = await app.call(`/api/conversations/${id}`, { ...options, method: 'PUT', data: payload('Updated AI planning', [...messages, message('Thank you')], 1) });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.conversation.revision, 2);
  const listed = await app.call('/api/conversations', options);
  assert.deepEqual(listed.body.conversations.map(chat => chat.id), [id, secondId]);
  assert.deepEqual(listed.body.conversations[0], edited.body.conversation);
  await app.restart();
  assert.deepEqual((await app.call('/api/conversations', options)).body, listed.body);
  assert.equal((await app.call('/api/auth/session', options)).body.user.id, user.user.id);
});

test('conversation lists and writes are isolated per account, including guessed IDs and stale identities', async t => {
  const app = await fixture(t);
  const first = await app.register('first-history@example.test');
  const second = await app.register('second-history@example.test');
  const id = randomUUID();
  const original = await app.call(`/api/conversations/${id}`, { method: 'PUT', cookie: first.cookie, data: payload('Private first-account discussion') });
  assert.equal(original.status, 201);
  assert.deepEqual((await app.call('/api/conversations', { cookie: second.cookie })).body, { conversations: [] });
  for (const revision of [0, 1]) {
    const attempt = await app.call(`/api/conversations/${id}`, { method: 'PUT', cookie: second.cookie, data: payload('Cross-account overwrite', [message()], revision) });
    assert.equal(attempt.status, 404);
  }
  const staleRead = await app.call('/api/conversations', { cookie: second.cookie, expectedUser: first.user.id });
  assert.equal(staleRead.status, 401);
  assert.equal(staleRead.headers.get('set-cookie'), null);
  const staleWrite = await app.call(`/api/conversations/${randomUUID()}`, { method: 'PUT', cookie: second.cookie, expectedUser: first.user.id, data: payload() });
  assert.equal(staleWrite.status, 401);
  const firstList = await app.call('/api/conversations', { cookie: first.cookie });
  assert.deepEqual(firstList.body.conversations, [original.body.conversation]);
  assert.deepEqual((await app.call('/api/conversations', { cookie: second.cookie })).body, { conversations: [] });
  assert.equal(app.account(second.cookie, first.user.id), null);
  assert.equal(app.account(second.cookie, second.user.id).user.id, second.user.id);
  assert.equal(app.account('polypath_session=invalid'), null);
});

test('history endpoints require authentication, enforce methods and reject cross-site writes', async t => {
  const app = await fixture(t);
  const id = randomUUID();
  assert.equal((await app.call('/api/conversations')).status, 401);
  assert.equal((await app.call(`/api/conversations/${id}`, { method: 'PUT', data: payload() })).status, 401);
  const wrongListMethod = await app.call('/api/conversations', { method: 'POST' });
  assert.equal(wrongListMethod.status, 405);
  assert.equal(wrongListMethod.headers.get('allow'), 'GET');
  const wrongWriteMethod = await app.call(`/api/conversations/${id}`, { method: 'DELETE' });
  assert.equal(wrongWriteMethod.status, 405);
  assert.equal(wrongWriteMethod.headers.get('allow'), 'PUT');
  const user = await app.register();
  for (const headers of [{ Origin: 'https://unrelated.example.test' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    assert.equal((await app.call(`/api/conversations/${id}`, { method: 'PUT', cookie: user.cookie, data: payload(), headers })).status, 403);
  }
  await app.call('/api/auth/logout', { method: 'POST', cookie: user.cookie });
  assert.equal((await app.call('/api/conversations', { cookie: user.cookie })).status, 401);
});

test('optimistic revisions reject stale saves and permit only one concurrent writer', async t => {
  const app = await fixture(t);
  const user = await app.register();
  const id = randomUUID();
  const put = data => app.call(`/api/conversations/${id}`, { method: 'PUT', cookie: user.cookie, data });
  assert.equal((await put(payload())).status, 201);
  assert.equal((await put(payload('Duplicate create'))).status, 409);
  assert.equal((await put(payload('Stale update', [message()], 0))).status, 409);
  const results = await Promise.all([put(payload('First concurrent writer', [message('A')], 1)), put(payload('Second concurrent writer', [message('B')], 1))]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  const success = results.find(result => result.status === 200);
  const listed = await app.call('/api/conversations', { cookie: user.cookie });
  assert.deepEqual(listed.body.conversations[0], success.body.conversation);
  assert.equal(listed.body.conversations[0].revision, 2);
  assert.equal((await app.call(`/api/conversations/${randomUUID()}`, { method: 'PUT', cookie: user.cookie, data: payload('Missing update', [message()], 1) })).status, 404);
});

test('conversation and message limits are enforced without silently dropping saved history', async t => {
  const app = await fixture(t);
  const user = await app.register();
  const id = randomUUID();
  const save = data => app.call(`/api/conversations/${id}`, { method: 'PUT', cookie: user.cookie, data });
  assert.equal((await save(payload('Too many messages', Array.from({ length: 101 }, () => message())))).status, 400);
  assert.equal((await save(payload('Too much JSON', Array.from({ length: 6 }, () => message('x'.repeat(49000)))))).status, 413);
  assert.equal((await save(payload('x'.repeat(121)))).status, 400);
  assert.equal((await save(payload(' '))).status, 400);
  const accepted = await save(payload('Maximum message count', Array.from({ length: 100 }, () => message('Short message'))));
  assert.equal(accepted.status, 201);
  assert.equal(accepted.body.conversation.messages.length, 100);
  for (let index = 1; index < 50; index++) {
    const result = await app.call(`/api/conversations/${randomUUID()}`, { method: 'PUT', cookie: user.cookie, data: payload(`Conversation ${index}`) });
    assert.equal(result.status, 201);
  }
  assert.equal((await app.call(`/api/conversations/${randomUUID()}`, { method: 'PUT', cookie: user.cookie, data: payload('Over limit') })).status, 409);
  assert.equal((await save(payload('Existing conversation remains editable', [message()], 1))).status, 200);
  const listed = await app.call('/api/conversations', { cookie: user.cookie });
  assert.equal(listed.body.conversations.length, 50);
  const second = await app.register('other-limit@example.test');
  assert.equal((await app.call(`/api/conversations/${randomUUID()}`, { method: 'PUT', cookie: second.cookie, data: payload('Separate account capacity') })).status, 201);
});

test('stored message schema rejects React-breaking shapes and unsafe source links, and omits raw files or evidence', async t => {
  const app = await fixture(t);
  const user = await app.register();
  const invalidMessages = [
    { ...message(), text: { unsafe: 'object' } },
    { ...message(), role: 'system' },
    { ...message(), checks: [{}] },
    { ...message(), courses: [{} , { title: { invalid: true } }] },
    { ...message(), semesters: [{ title: 'Term' }] },
    { ...message(), semesters: [{ courses: [{}] }] },
    { ...message(), sources: [{ title: 'Invalid link', url: 'javascript:alert(1)' }] },
    { ...message(), attachments: [{ name: { invalid: true }, size: 1 }] },
    { ...message(), courses: [{ credits: 'three' }] }
  ];
  for (const invalid of invalidMessages) {
    assert.equal((await app.call(`/api/conversations/${randomUUID()}`, { method: 'PUT', cookie: user.cookie, data: payload('Invalid schema', [invalid]) })).status, 400);
  }
  const duplicate = message();
  assert.equal((await app.call(`/api/conversations/${randomUUID()}`, { method: 'PUT', cookie: user.cookie, data: payload('Duplicate IDs', [duplicate, duplicate]) })).status, 400);
  for (const revision of [-1, 0.5, '0', Number.MAX_SAFE_INTEGER]) {
    assert.equal((await app.call(`/api/conversations/${randomUUID()}`, { method: 'PUT', cookie: user.cookie, data: { ...payload(), revision } })).status, 400);
  }
  assert.equal((await app.call('/api/conversations/not-a-uuid', { method: 'PUT', cookie: user.cookie, data: payload() })).status, 400);
  assert.equal((await app.call(`/api/conversations/${randomUUID()}`, { method: 'PUT', cookie: user.cookie, data: { ...payload(), userId: 'spoofed-owner' } })).status, 400);
  const safe = message('Keep only visible fields');
  const stripped = await app.call(`/api/conversations/${randomUUID()}`, {
    method: 'PUT', cookie: user.cookie,
    data: payload('Sanitized', [{ ...safe, evidence: [{ text: 'raw reference data' }], retrieval: { method: 'debug' }, feedback: true, file: { bytes: 'raw file bytes' } }])
  });
  assert.equal(stripped.status, 201);
  assert.deepEqual(stripped.body.conversation.messages, [safe]);
});

test('logout revokes a conversation write whose body was still arriving', async t => {
  const app = await fixture(t);
  const user = await app.register();
  const data = JSON.stringify(payload());
  let finishBody;
  const completed = new Promise((resolve, reject) => {
    const req = request(`${app.base}/api/conversations/${randomUUID()}`, { method: 'PUT', headers: { Cookie: user.cookie, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, res => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.write(data.slice(0, 10));
    finishBody = () => req.end(data.slice(10));
  });
  await app.call('/api/auth/logout', { method: 'POST', cookie: user.cookie });
  finishBody();
  assert.equal(await completed, 401);
});

test('creating the conversations table preserves an existing legacy account and session', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'polypath-conversation-migration-'));
  const databasePath = join(directory, 'legacy.sqlite');
  t.after(() => rm(directory, { recursive: true, force: true }));
  const userId = randomUUID();
  const token = randomBytes(32).toString('base64url');
  const profile = { programme: 'Legacy programme', year: '', semester: '', graduation: '', interests: '' };
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, profile_json TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
  `);
  legacy.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)').run(userId, 'Legacy User', 'legacy@example.test', 'nonsecret-test-hash', JSON.stringify(profile), Date.now());
  legacy.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?)').run(createHash('sha256').update(token).digest('hex'), userId, Date.now() + 60000, Date.now());
  legacy.close();
  const service = createAuthService({ databasePath });
  try {
    const account = service.getAccount({ headers: { cookie: `polypath_session=${token}` } });
    assert.equal(account.user.id, userId);
    assert.deepEqual(account.profile, profile);
    const db = new DatabaseSync(databasePath);
    try {
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM conversations').get().count, 0);
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM users').get().count, 1);
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 1);
      assert.equal(db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId).password_hash, 'nonsecret-test-hash');
    } finally { db.close(); }
  } finally { service.close(); }
});
