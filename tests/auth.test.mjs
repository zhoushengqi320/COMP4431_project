import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createAuthService } from '../server/auth.mjs';

const account = (email = 'student@example.test') => ({ name: 'Test Student', email, password: 'A-long-test-password-42' });
const demoAccount = { email: 'test@polypath.local', password: 'Test1234!' };

function databaseSnapshot(databasePath) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return {
      users: db.prepare('SELECT * FROM users ORDER BY id').all(),
      sessions: db.prepare('SELECT * FROM sessions ORDER BY token_hash').all(),
      conversations: db.prepare('SELECT * FROM conversations ORDER BY id').all()
    };
  } finally {
    db.close();
  }
}

async function fixture(t, options = {}) {
  const { onRequest, ...serviceOptions } = options;
  const directory = await mkdtemp(join(tmpdir(), 'polypath-auth-test-'));
  const databasePath = join(directory, 'accounts.sqlite');
  let auth;
  let server;
  let base;
  async function start() {
    auth = createAuthService({ databasePath, ...serviceOptions });
    server = createServer(async (req, res) => {
      onRequest?.(req);
      if (await auth.handle(req, res)) return;
      if (req.url === '/api/advisor') {
        if (!auth.checkSameOrigin(req, res) || !auth.requireUser(req, res)) return;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true }));
      } else {
        res.statusCode = 404;
        res.end();
      }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  async function stop() {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    auth.close();
  }
  await start();
  t.after(async () => {
    await stop();
    await rm(directory, { recursive: true, force: true });
  });
  async function call(path, { method = 'GET', data, cookie, headers = {}, raw } = {}) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(data !== undefined || raw !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers
      },
      body: raw !== undefined ? raw : data !== undefined ? JSON.stringify(data) : undefined
    });
    const text = await response.text();
    return {
      status: response.status,
      body: text ? JSON.parse(text) : null,
      headers: response.headers,
      cookie: response.headers.get('set-cookie')?.split(';')[0]
    };
  }
  return {
    call, databasePath, get base() { return base; },
    ensureTestAccount: () => auth.ensureTestAccount(),
    restart: async () => { await stop(); await start(); }
  };
}

test('the team test login is seeded once and preserves saved account data across restarts', async t => {
  const app = await fixture(t);
  assert.equal(databaseSnapshot(app.databasePath).users.length, 0);
  assert.equal(await app.ensureTestAccount(), true);
  assert.equal(await app.ensureTestAccount(), false);

  const login = await app.call('/api/auth/login', { method: 'POST', data: demoAccount });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.email, demoAccount.email);
  assert.ok(login.cookie);
  assert.deepEqual((await app.call('/api/conversations', { cookie: login.cookie })).body, { conversations: [] });
  const profile = { programme: 'Computing', interests: 'Preserve the team demo profile' };
  assert.equal((await app.call('/api/profile', { method: 'PUT', cookie: login.cookie, data: profile })).status, 200);
  const chat = await app.call(`/api/conversations/${randomUUID()}`, {
    method: 'PUT', cookie: login.cookie,
    data: { title: 'Saved demo chat', revision: 0, messages: [{ id: randomUUID(), role: 'user', text: 'What is COMP4431?' }] }
  });
  assert.equal(chat.status, 201);
  const before = databaseSnapshot(app.databasePath);
  assert.equal(before.users.length, 1);
  assert.match(before.users[0].password_hash, /^scrypt\$32768\$8\$3\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
  assert.ok(!before.users[0].password_hash.includes(demoAccount.password));

  assert.equal(await app.ensureTestAccount(), false);
  await app.restart();
  assert.equal(await app.ensureTestAccount(), false);
  assert.deepEqual(databaseSnapshot(app.databasePath), before);
  const session = await app.call('/api/auth/session', { cookie: login.cookie });
  assert.equal(session.body.user.id, login.body.user.id);
  assert.equal(session.body.profile.interests, profile.interests);
  assert.deepEqual((await app.call('/api/conversations', { cookie: login.cookie })).body.conversations, [chat.body.conversation]);
  const relogin = await app.call('/api/auth/login', { method: 'POST', data: demoAccount });
  assert.equal(relogin.status, 200);
  assert.equal(relogin.body.user.id, login.body.user.id);
});

test('test-account initialization never resets a pre-existing account with the same email', async t => {
  const app = await fixture(t);
  const existing = { ...account(demoAccount.email), name: 'Existing Student' };
  const registered = await app.call('/api/auth/register', { method: 'POST', data: existing });
  assert.equal(registered.status, 201);
  assert.equal((await app.call('/api/profile', {
    method: 'PUT', cookie: registered.cookie, data: { interests: 'Keep my existing profile' }
  })).status, 200);
  const before = databaseSnapshot(app.databasePath);
  assert.equal(await app.ensureTestAccount(), false);
  assert.deepEqual(databaseSnapshot(app.databasePath), before);
  assert.equal((await app.call('/api/auth/login', { method: 'POST', data: demoAccount })).status, 401);
  const login = await app.call('/api/auth/login', { method: 'POST', data: existing });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.id, registered.body.user.id);
  assert.equal(login.body.user.name, existing.name);
  assert.equal(login.body.profile.interests, 'Keep my existing profile');
});

test('two services initializing the same database create only one usable test account', async t => {
  const app = await fixture(t);
  const second = createAuthService({ databasePath: app.databasePath });
  try {
    const results = await Promise.all([app.ensureTestAccount(), second.ensureTestAccount()]);
    assert.deepEqual(results.sort(), [false, true]);
    const snapshot = databaseSnapshot(app.databasePath);
    assert.equal(snapshot.users.length, 1);
    assert.equal(snapshot.users[0].email, demoAccount.email);
    const login = await app.call('/api/auth/login', { method: 'POST', data: demoAccount });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.id, snapshot.users[0].id);
  } finally {
    second.close();
  }
});

test('register, refresh, update profile, logout and sign in again through HTTP', async t => {
  const app = await fixture(t);
  assert.deepEqual((await app.call('/api/auth/session')).body, { user: null });
  assert.equal((await app.call('/api/profile', { method: 'PUT', data: {} })).status, 401);
  assert.equal((await app.call('/api/advisor', { method: 'POST' })).status, 401);

  const registered = await app.call('/api/auth/register', { method: 'POST', data: account(' Student@Example.test ') });
  assert.equal(registered.status, 201);
  assert.equal(registered.body.user.email, 'student@example.test');
  assert.equal(registered.body.user.name, 'Test Student');
  assert.ok(registered.body.user.id);
  assert.deepEqual(Object.keys(registered.body.user).sort(), ['email', 'id', 'name']);
  assert.equal(registered.headers.get('cache-control'), 'no-store');
  const setCookie = registered.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.match(setCookie, /Max-Age=604800/);
  assert.doesNotMatch(setCookie, /Secure/);
  const cookie = registered.cookie;
  assert.deepEqual((await app.call('/api/auth/session', { cookie })).body, registered.body);
  assert.equal((await app.call('/api/advisor', { method: 'POST', cookie })).status, 200);

  const profile = { programme: 'Computing', year: 'Year 2', semester: 'Semester 1', graduation: '2028-06', interests: 'Machine learning' };
  const saved = await app.call('/api/profile', { method: 'PUT', data: profile, cookie });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body, { profile });
  assert.deepEqual((await app.call('/api/auth/session', { cookie })).body.profile, profile);

  const logout = await app.call('/api/auth/logout', { method: 'POST', cookie });
  assert.deepEqual(logout.body, { ok: true });
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  assert.deepEqual((await app.call('/api/auth/session', { cookie })).body, { user: null });
  assert.equal((await app.call('/api/advisor', { method: 'POST', cookie })).status, 401);

  const login = await app.call('/api/auth/login', { method: 'POST', data: { ...account(), remember: true } });
  assert.equal(login.status, 200);
  assert.deepEqual(login.body.profile, profile);
  assert.equal(login.body.user.id, registered.body.user.id);
  assert.match(login.headers.get('set-cookie'), /Max-Age=2592000/);
  assert.notEqual(login.cookie, cookie);
});

test('accounts stay isolated and stored secrets are salted or hashed', async t => {
  const app = await fixture(t);
  const first = await app.call('/api/auth/register', { method: 'POST', data: account('one@example.test') });
  const second = await app.call('/api/auth/register', { method: 'POST', data: account('two@example.test') });
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.notEqual(first.body.user.id, second.body.user.id);
  await app.call('/api/profile', { method: 'PUT', cookie: first.cookie, data: { programme: 'Account one only' } });
  assert.equal((await app.call('/api/auth/session', { cookie: second.cookie })).body.profile.programme, '');
  const spoof = await app.call('/api/profile', { method: 'PUT', cookie: second.cookie, data: { id: first.body.user.id, programme: 'Overwrite' } });
  assert.equal(spoof.status, 400);
  assert.equal((await app.call('/api/auth/session', { cookie: first.cookie })).body.profile.programme, 'Account one only');

  const db = new DatabaseSync(app.databasePath);
  try {
    const users = db.prepare('SELECT password_hash FROM users ORDER BY email').all();
    assert.equal(users.length, 2);
    assert.match(users[0].password_hash, /^scrypt\$32768\$8\$3\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
    assert.notEqual(users[0].password_hash, users[1].password_hash);
    assert.ok(users.every(row => !row.password_hash.includes(account().password)));
    const sessions = db.prepare('SELECT token_hash FROM sessions').all();
    const rawToken = first.cookie.split('=')[1];
    assert.ok(sessions.every(row => row.token_hash !== rawToken));
    assert.ok(sessions.some(row => row.token_hash === createHash('sha256').update(rawToken).digest('hex')));
  } finally {
    db.close();
  }

  await app.call('/api/auth/logout', { method: 'POST', cookie: first.cookie });
  assert.equal((await app.call('/api/auth/session', { cookie: second.cookie })).body.user.id, second.body.user.id);
});

test('accounts, profiles and sessions survive an auth server restart', async t => {
  const app = await fixture(t);
  const register = await app.call('/api/auth/register', { method: 'POST', data: account() });
  await app.call('/api/profile', { method: 'PUT', cookie: register.cookie, data: { interests: 'Persistent profile' } });
  await app.restart();
  const session = await app.call('/api/auth/session', { cookie: register.cookie });
  assert.equal(session.body.user.id, register.body.user.id);
  assert.equal(session.body.profile.interests, 'Persistent profile');
  await app.call('/api/auth/logout', { method: 'POST', cookie: register.cookie });
  const login = await app.call('/api/auth/login', { method: 'POST', data: account() });
  assert.equal(login.status, 200);
  assert.equal(login.body.profile.interests, 'Persistent profile');
});

test('wrong credentials, duplicate registration, forged and expired sessions are rejected', async t => {
  let time = Date.now();
  const app = await fixture(t, { now: () => time });
  const registered = await app.call('/api/auth/register', { method: 'POST', data: account() });
  const duplicate = await app.call('/api/auth/register', { method: 'POST', data: account('STUDENT@example.test') });
  assert.equal(duplicate.status, 409);
  const incorrect = await app.call('/api/auth/login', { method: 'POST', data: { ...account(), password: 'Wrong-password-42' } });
  const missing = await app.call('/api/auth/login', { method: 'POST', data: account('missing@example.test') });
  assert.equal(incorrect.status, 401);
  assert.equal(missing.status, 401);
  assert.equal(incorrect.body.error, missing.body.error);
  assert.equal(incorrect.headers.get('set-cookie'), null);
  for (const cookie of ['polypath_session=not-valid', `polypath_session=${'A'.repeat(43)}`, 'polypath_session=%broken']) {
    const session = await app.call('/api/auth/session', { cookie });
    assert.deepEqual(session.body, { user: null });
    assert.equal(session.headers.get('set-cookie'), null);
    const rejected = await app.call('/api/profile', { method: 'PUT', data: {}, cookie });
    assert.equal(rejected.status, 401);
    assert.equal(rejected.headers.get('set-cookie'), null);
  }
  time += 7 * 24 * 60 * 60 * 1000;
  assert.deepEqual((await app.call('/api/auth/session', { cookie: registered.cookie })).body, { user: null });
  assert.equal((await app.call('/api/profile', { method: 'PUT', data: {}, cookie: registered.cookie })).status, 401);
  const login = await app.call('/api/auth/login', { method: 'POST', data: { ...account(), remember: true } });
  time += 8 * 24 * 60 * 60 * 1000;
  assert.equal((await app.call('/api/auth/session', { cookie: login.cookie })).body.user.id, registered.body.user.id);
  time += 22 * 24 * 60 * 60 * 1000;
  assert.deepEqual((await app.call('/api/auth/session', { cookie: login.cookie })).body, { user: null });
});

test('same-origin enforcement guards registration, login, logout, profile and advisor', async t => {
  const app = await fixture(t);
  const registered = await app.call('/api/auth/register', { method: 'POST', data: account(), headers: { Origin: app.base } });
  assert.equal(registered.status, 201);
  for (const [path, method] of [['/api/auth/register', 'POST'], ['/api/auth/login', 'POST'], ['/api/auth/logout', 'POST'], ['/api/profile', 'PUT'], ['/api/advisor', 'POST']]) {
    const result = await app.call(path, { method, cookie: registered.cookie, data: account(), headers: { Origin: 'https://unrelated.example.test' } });
    assert.equal(result.status, 403, path);
  }
  assert.equal((await app.call('/api/auth/logout', { method: 'POST', cookie: registered.cookie, headers: { Origin: app.base, 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await app.call('/api/auth/logout', { method: 'POST', cookie: registered.cookie, headers: { Origin: 'null' } })).status, 403);
  assert.ok((await app.call('/api/auth/session', { cookie: registered.cookie })).body.user);
});

test('HTTPS deployment sets Secure cookies and honors the configured origin', async t => {
  const app = await fixture(t, { allowedOrigin: 'https://polypath.example.test' });
  assert.equal((await app.call('/api/auth/register', { method: 'POST', data: account(), headers: { Origin: app.base } })).status, 403);
  const registered = await app.call('/api/auth/register', { method: 'POST', data: account(), headers: { Origin: 'https://polypath.example.test' } });
  assert.equal(registered.status, 201);
  assert.match(registered.headers.get('set-cookie'), /; Secure/);
  const logout = await app.call('/api/auth/logout', { method: 'POST', cookie: registered.cookie });
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0; Secure/);
});

test('methods, invalid input, profile lengths and both declared and streamed body sizes are bounded', async t => {
  const app = await fixture(t, { rateLimitMax: 50 });
  const wrongMethod = await app.call('/api/auth/register');
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('allow'), 'POST');
  assert.equal((await app.call('/api/auth/unknown')).status, 404);
  assert.equal((await app.call('/api/auth/register', { method: 'POST', raw: '{bad' })).status, 400);
  assert.equal((await app.call('/api/auth/register', { method: 'POST', raw: '[]' })).status, 400);
  assert.equal((await app.call('/api/auth/register', { method: 'POST', raw: 'null' })).status, 400);
  assert.equal((await app.call('/api/auth/register', { method: 'POST', data: account(), headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await app.call('/api/auth/register', { method: 'POST', data: { ...account(), email: 'invalid' } })).status, 400);
  assert.equal((await app.call('/api/auth/register', { method: 'POST', data: { ...account(), name: '' } })).status, 400);
  assert.equal((await app.call('/api/auth/register', { method: 'POST', data: { ...account(), password: 'short' } })).status, 400);
  assert.equal((await app.call('/api/auth/register', { method: 'POST', data: { ...account(), password: 'x'.repeat(129) } })).status, 400);
  assert.equal((await app.call('/api/auth/register', { method: 'POST', raw: 'x'.repeat(17000) })).status, 413);

  const streamed = await new Promise((resolve, reject) => {
    const req = request(`${app.base}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' } }, res => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.write('x'.repeat(9000));
    req.end('x'.repeat(9000));
  });
  assert.equal(streamed, 413);

  const registered = await app.call('/api/auth/register', { method: 'POST', data: account() });
  const cookie = registered.cookie;
  assert.equal((await app.call('/api/profile', { method: 'PUT', cookie, data: { interests: 'x'.repeat(1001) } })).status, 400);
  assert.equal((await app.call('/api/profile', { method: 'PUT', cookie, data: { programme: 123 } })).status, 400);
  assert.equal((await app.call('/api/profile', { method: 'PUT', cookie, data: { graduation: '2028-13' } })).status, 400);
  assert.equal((await app.call('/api/auth/login', { method: 'POST', data: { ...account(), remember: 'true' } })).status, 400);
  assert.equal((await app.call('/api/auth/session', { cookie })).body.profile.programme, '');
});

test('login and registration share a rate limit that resets after the window', async t => {
  let time = Date.now();
  const app = await fixture(t, { rateLimitMax: 2, rateLimitWindowMs: 60000, now: () => time });
  const first = await app.call('/api/auth/login', { method: 'POST', data: account() });
  const second = await app.call('/api/auth/login', { method: 'POST', data: account() });
  assert.equal(first.status, 401);
  assert.equal(second.status, 401);
  const limited = await app.call('/api/auth/register', { method: 'POST', data: account() });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '60');
  time += 60000;
  assert.equal((await app.call('/api/auth/register', { method: 'POST', data: account() })).status, 201);
});

test('signing in rotates a previously authenticated browser session', async t => {
  const app = await fixture(t);
  const registered = await app.call('/api/auth/register', { method: 'POST', data: account() });
  const login = await app.call('/api/auth/login', { method: 'POST', data: account(), cookie: registered.cookie });
  assert.equal(login.status, 200);
  assert.notEqual(login.cookie, registered.cookie);
  assert.deepEqual((await app.call('/api/auth/session', { cookie: registered.cookie })).body, { user: null });
  assert.equal((await app.call('/api/auth/session', { cookie: login.cookie })).body.user.id, registered.body.user.id);
});

test('a stale tab cannot save or request advice for a different newly signed-in account', async t => {
  const app = await fixture(t);
  const first = await app.call('/api/auth/register', { method: 'POST', data: account('first@example.test') });
  const second = await app.call('/api/auth/register', { method: 'POST', data: account('second@example.test') });
  const staleHeaders = { 'X-PolyPath-User': first.body.user.id };
  const rejected = await app.call('/api/profile', {
    method: 'PUT', cookie: second.cookie, headers: staleHeaders, data: { programme: 'First account private draft' }
  });
  assert.equal(rejected.status, 401);
  assert.match(rejected.body.error, /account has changed/i);
  assert.equal(rejected.headers.get('set-cookie'), null);
  const advisor = await app.call('/api/advisor', { method: 'POST', cookie: second.cookie, headers: staleHeaders });
  assert.equal(advisor.status, 401);
  assert.equal(advisor.headers.get('set-cookie'), null);
  const secondSession = await app.call('/api/auth/session', { cookie: second.cookie });
  assert.equal(secondSession.body.user.id, second.body.user.id);
  assert.equal(secondSession.body.profile.programme, '');
  assert.equal((await app.call('/api/auth/session', { cookie: first.cookie })).body.profile.programme, '');
  const accepted = await app.call('/api/profile', {
    method: 'PUT', cookie: second.cookie, headers: { 'X-PolyPath-User': second.body.user.id }, data: { programme: 'Correct account' }
  });
  assert.equal(accepted.status, 200);
});

test('a stale logout cannot revoke a different newly signed-in account', async t => {
  const app = await fixture(t);
  const first = await app.call('/api/auth/register', { method: 'POST', data: account('first-logout@example.test') });
  const second = await app.call('/api/auth/register', { method: 'POST', data: account('second-logout@example.test') });
  const rejected = await app.call('/api/auth/logout', {
    method: 'POST', cookie: second.cookie, headers: { 'X-PolyPath-User': first.body.user.id }
  });
  assert.equal(rejected.status, 401);
  assert.match(rejected.body.error, /account has changed/i);
  assert.equal(rejected.headers.get('set-cookie'), null);
  assert.equal((await app.call('/api/auth/session', { cookie: second.cookie })).body.user.id, second.body.user.id);
  assert.equal((await app.call('/api/auth/session', { cookie: first.cookie })).body.user.id, first.body.user.id);
  const accepted = await app.call('/api/auth/logout', {
    method: 'POST', cookie: second.cookie, headers: { 'X-PolyPath-User': second.body.user.id }
  });
  assert.equal(accepted.status, 200);
  assert.match(accepted.headers.get('set-cookie'), /Max-Age=0/);
  assert.deepEqual((await app.call('/api/auth/session', { cookie: second.cookie })).body, { user: null });
  const repeated = await app.call('/api/auth/logout', {
    method: 'POST', cookie: second.cookie, headers: { 'X-PolyPath-User': first.body.user.id }
  });
  assert.equal(repeated.status, 200);
  assert.deepEqual(repeated.body, { ok: true });
  assert.equal((await app.call('/api/auth/logout', { method: 'POST' })).status, 200);
});

test('profile writes revalidate after the body arrives when logout or expiry happens mid-request', async t => {
  let time = Date.now();
  let bodyStarted;
  const app = await fixture(t, {
    now: () => time,
    onRequest: req => { if (req.url === '/api/profile') req.once('data', () => bodyStarted?.()); }
  });
  const registered = await app.call('/api/auth/register', { method: 'POST', data: account() });
  const beginWrite = async cookie => {
    const data = JSON.stringify({ interests: 'This revoked write must not persist.' });
    const started = new Promise(resolve => { bodyStarted = resolve; });
    let finish;
    const completed = new Promise((resolve, reject) => {
      const req = request(`${app.base}/api/profile`, {
        method: 'PUT', headers: { Cookie: cookie, 'X-PolyPath-User': registered.body.user.id, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
      }, res => {
        res.resume();
        res.on('end', () => resolve({ status: res.statusCode, cookie: res.headers['set-cookie'] }));
      });
      req.on('error', reject);
      req.write(data.slice(0, 8));
      finish = () => req.end(data.slice(8));
    });
    await started;
    return { finish, completed };
  };
  const revoked = await beginWrite(registered.cookie);
  await app.call('/api/auth/logout', { method: 'POST', cookie: registered.cookie });
  revoked.finish();
  assert.deepEqual(await revoked.completed, { status: 401, cookie: undefined });
  const login = await app.call('/api/auth/login', { method: 'POST', data: account() });
  assert.equal(login.body.profile.interests, '');
  const expired = await beginWrite(login.cookie);
  time += 7 * 24 * 60 * 60 * 1000;
  expired.finish();
  assert.deepEqual(await expired.completed, { status: 401, cookie: undefined });
  const refreshed = await app.call('/api/auth/login', { method: 'POST', data: account() });
  assert.equal(refreshed.body.profile.interests, '');
});
