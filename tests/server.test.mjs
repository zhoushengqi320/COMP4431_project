import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAppServer } from '../server/index.mjs';

const html = '<!doctype html><html><body>PolyPath test app</body></html>';

async function fixture(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'polypath-server-'));
  const distDir = join(root, 'dist');
  await mkdir(join(distDir, 'assets'), { recursive: true });
  await writeFile(join(distDir, 'index.html'), html);
  await writeFile(join(distDir, 'assets/app-12345678.js'), 'window.polyPath = true;');
  await writeFile(join(distDir, 'assets/app-12345678.css'), 'body{color:#123}');
  await writeFile(join(root, '.env'), 'SECRET_DO_NOT_SERVE');
  await writeFile(join(root, 'private.txt'), 'SECRET_DO_NOT_SERVE');
  await symlink(join(root, 'private.txt'), join(distDir, 'leaked.txt'));
  const auth = {
    async handle() { return false; },
    checkSameOrigin() { return true; },
    getAccount() { return null; },
    requireUser(req, res) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Sign in required.' }));
      return null;
    }
  };
  const server = createAppServer({ distDir, auth, ...options });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  });
  return {
    auth,
    async request(path, method = 'GET', { headers, body } = {}) {
      return new Promise((resolve, reject) => {
        const req = request({
          hostname: '127.0.0.1', port: server.address().port, path, method, headers
        }, res => {
          const chunks = [];
          res.on('data', chunk => chunks.push(chunk));
          res.on('end', () => resolve({
            status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString()
          }));
        });
        req.on('error', reject);
        req.end(body);
      });
    }
  };
}

test('production server serves built assets, SPA routes, and HEAD with useful cache policies', async t => {
  const app = await fixture(t);
  for (const path of ['/', '/profile', '/advisor/history?chat=1']) {
    const response = await app.request(path);
    assert.equal(response.status, 200);
    assert.equal(response.text, html);
    assert.equal(response.headers['content-type'], 'text/html; charset=utf-8');
    assert.equal(response.headers['cache-control'], 'no-cache');
  }
  const asset = await app.request('/assets/app-12345678.js');
  assert.equal(asset.status, 200);
  assert.equal(asset.headers['content-type'], 'text/javascript; charset=utf-8');
  assert.equal(asset.headers['cache-control'], 'public, max-age=31536000, immutable');
  assert.equal(asset.headers['x-content-type-options'], 'nosniff');
  const head = await app.request('/assets/app-12345678.js', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.text, '');
  assert.equal(head.headers['content-length'], asset.headers['content-length']);
  const css = await app.request('/assets/app-12345678.css');
  assert.equal(css.headers['content-type'], 'text/css; charset=utf-8');
});

test('production server blocks traversal, hidden files, escaping symlinks, and missing assets', async t => {
  const app = await fixture(t);
  for (const path of [
    '/../private.txt', '/%2e%2e/private.txt', '/%2e%2e%2fprivate.txt', '/.env',
    '/assets/../../.env', '/leaked.txt', '/assets/missing.js', '/assets/missing', '/package.json'
  ]) {
    const response = await app.request(path);
    assert.equal(response.status, 404, path);
    assert.doesNotMatch(response.text, /SECRET_DO_NOT_SERVE/, path);
    assert.notEqual(response.text, html, path);
  }
  for (const path of ['/%E0%A4%A', '/%00', '/%5c..%5cprivate.txt']) {
    assert.equal((await app.request(path)).status, 400, path);
  }
});

test('production server handles unknown APIs and method errors without serving the SPA', async t => {
  const app = await fixture(t);
  for (const path of ['/api', '/api/unknown', '/api/auth/unknown']) {
    const response = await app.request(path);
    assert.equal(response.status, 404);
    assert.equal(response.headers['content-type'], 'application/json; charset=utf-8');
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.deepEqual(JSON.parse(response.text), { error: 'API route not found.' });
  }
  const post = await app.request('/', 'POST');
  assert.equal(post.status, 405);
  assert.equal(post.headers.allow, 'GET, HEAD');
  const advisor = await app.request('/api/advisor');
  assert.equal(advisor.status, 405);
  assert.equal(advisor.headers.allow, 'POST');
});

test('production advisor validates origin and an explicitly expected account before using the handler', async t => {
  let calls = 0;
  const app = await fixture(t, {
    advisorHandler(req, res) {
      calls++;
      res.end('advice');
    }
  });
  assert.equal((await app.request('/api/advisor', 'POST', { headers: { 'X-PolyPath-User': '123' } })).status, 401);
  assert.equal(calls, 0);
  app.auth.checkSameOrigin = (req, res) => {
    res.writeHead(403).end();
    return false;
  };
  app.auth.requireUser = () => { throw new Error('Origin check must happen first'); };
  assert.equal((await app.request('/api/advisor', 'POST')).status, 403);
  assert.equal(calls, 0);
  app.auth.checkSameOrigin = () => true;
  app.auth.requireUser = () => ({ user: { id: '123' }, profile: {} });
  const response = await app.request('/api/advisor', 'POST', { headers: { 'X-PolyPath-User': '123' } });
  assert.equal(response.status, 200);
  assert.equal(response.text, 'advice');
  assert.equal(calls, 1);
});

test('production server delegates auth routes and does not expose unexpected errors', async t => {
  const errors = [];
  const app = await fixture(t, { logger: { error: (...args) => errors.push(args) } });
  app.auth.handle = async (req, res) => {
    if (req.url === '/api/profile') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"programme":"Computing"}');
      return true;
    }
    throw new Error('database password: do-not-leak');
  };
  const profile = await app.request('/api/profile');
  assert.equal(profile.status, 200);
  assert.equal(JSON.parse(profile.text).programme, 'Computing');
  assert.equal(profile.headers['cache-control'], 'no-store');
  const response = await app.request('/api/auth/session');
  assert.equal(response.status, 500);
  assert.deepEqual(JSON.parse(response.text), { error: 'Internal server error.' });
  assert.equal(errors.length, 1);
});

test('production server connects real registration, account profiles, and protected advisor requests', async t => {
  const app = await fixture(t, {
    auth: undefined,
    env: { AUTH_DATABASE_PATH: ':memory:' },
    advisorHandler(req, res) {
      res.setHeader('Content-Type', 'application/json');
      res.end('{"text":"Authenticated advice"}');
    }
  });
  const initial = await app.request('/api/auth/session');
  assert.deepEqual(JSON.parse(initial.text), { user: null });
  assert.equal((await app.request('/api/advisor', 'POST', { headers: { 'X-PolyPath-User': 'expected-user' } })).status, 401);

  const registration = await app.request('/api/auth/register', 'POST', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test Student', email: 'server-test@example.com', password: 'correct horse battery staple' })
  });
  assert.equal(registration.status, 201);
  assert.match(registration.headers['set-cookie'][0], /HttpOnly/);
  const cookie = registration.headers['set-cookie'][0].split(';')[0];
  const userId = JSON.parse(registration.text).user.id;
  const saved = await app.request('/api/profile', 'PUT', {
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ programme: 'Computing', year: 'Year 2' })
  });
  assert.equal(saved.status, 200);
  const session = await app.request('/api/auth/session', 'GET', { headers: { Cookie: cookie } });
  assert.equal(JSON.parse(session.text).profile.programme, 'Computing');
  const advice = await app.request('/api/advisor', 'POST', { headers: { Cookie: cookie } });
  assert.equal(advice.status, 200);
  assert.equal(JSON.parse(advice.text).text, 'Authenticated advice');
  const logout = await app.request('/api/auth/logout', 'POST', { headers: { Cookie: cookie } });
  assert.equal(logout.status, 200);
  assert.equal((await app.request('/api/advisor', 'POST', { headers: { Cookie: cookie, 'X-PolyPath-User': userId } })).status, 401);
});
