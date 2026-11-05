import assert from 'node:assert/strict';
import test from 'node:test';
import { createSupabaseClient, SupabaseClientError } from '../server/supabase-client.mjs';

// Deliberately synthetic credentials. Every request uses an injected transport;
// these tests never read .env, contact a project, or create an Auth user.
const key = 'sb_publishable_test_placeholder_only';
const url = 'https://project.example.test';
const id = 'cb0a2ad9-6ea1-4ed3-9848-d2831f426deb';
const jwt = role => `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ role, sub: id })).toString('base64url')}.synthetic-signature`;
const accessToken = jwt('authenticated');
const user = { id, email: 'student@example.test', user_metadata: { name: 'Test Student', private_extra: 'not-returned' }, identities: [{ secret: 'not-returned' }] };
const session = (extra = {}) => ({ access_token: accessToken, refresh_token: 'synthetic-refresh-token', expires_in: 3600, token_type: 'bearer', user, ...extra });
const response = (body, status = 200, headers = {}) => new Response(body === null ? null : JSON.stringify(body), { status, headers });

function fixture(reply, options = {}) {
  const calls = [];
  const client = createSupabaseClient({ url, key, now: () => 1700000000000, ...options, fetchImpl: async (target, init) => {
    calls.push({ url: new URL(target), ...init, parsedBody: init.body ? JSON.parse(init.body) : undefined });
    return typeof reply === 'function' ? reply(calls.at(-1), calls.length) : reply;
  } });
  return { client, calls };
}

test('construction is inert, HTTPS origin only, accepts public/anon and rejects elevated keys without echoing them', () => {
  let requests = 0;
  const fetchImpl = () => { requests++; throw new Error('must not run'); };
  createSupabaseClient({ url, key, fetchImpl });
  createSupabaseClient({ url, key: jwt('anon'), fetchImpl });
  assert.equal(requests, 0);
  for (const badUrl of ['http://project.example.test', `${url}/rest/v1`, `${url}?token=private`, 'https://name:password@project.example.test']) {
    assert.throws(() => createSupabaseClient({ url: badUrl, key }), error => error.code === 'INVALID_INPUT' && !error.message.includes(badUrl));
  }
  for (const badKey of ['sb_secret_private_value', jwt('service_role'), jwt('authenticated'), 'invalid']) {
    assert.throws(() => createSupabaseClient({ url, key: badKey }), error => error.code === 'INVALID_INPUT' && !error.message.includes(badKey));
  }
});

test('settings projection exposes only requested boolean capabilities with apikey and no bearer credential', async () => {
  const { client, calls } = fixture(response({ external: { email: true, phone: false }, disable_signup: false, mailer_autoconfirm: false, private_extra: 'not-returned' }));
  assert.deepEqual(await client.getAuthSettings(), { emailEnabled: true, signupEnabled: true, emailAutoConfirm: false });
  assert.equal(calls[0].url.pathname, '/auth/v1/settings');
  assert.equal(calls[0].headers.apikey, key);
  assert.equal(calls[0].headers.Authorization, undefined);
  assert.equal(calls[0].redirect, 'error');
  assert.equal(calls[0].cache, 'no-store');
});

test('password login uses token grant, returns internal normalized session and strips arbitrary user fields', async () => {
  const { client, calls } = fixture(response(session()));
  const result = await client.signIn({ email: user.email, password: 'synthetic-password' });
  assert.deepEqual(result.user, { id, email: user.email, name: 'Test Student' });
  assert.deepEqual(result.session, { accessToken, refreshToken: 'synthetic-refresh-token', expiresAt: 1700003600, expiresIn: 3600, tokenType: 'bearer' });
  assert.equal(calls[0].url.pathname, '/auth/v1/token');
  assert.equal(calls[0].url.searchParams.get('grant_type'), 'password');
  assert.deepEqual(calls[0].parsedBody, { email: user.email, password: 'synthetic-password' });
  assert.equal(calls[0].headers.Authorization, undefined);
  assert.equal(calls[0].url.href.includes('synthetic-password'), false);
});

test('signup distinguishes confirmation from a live session and supports server PKCE challenge plus redirect', async () => {
  const { client, calls } = fixture((_, count) => response(count === 1 ? user : session()));
  const input = { email: user.email, password: 'synthetic-password', name: 'Test Student', emailRedirectTo: 'http://localhost:5173/api/auth/callback', codeChallenge: 'a'.repeat(43) };
  const pending = await client.signUp(input);
  assert.equal(pending.session, null);
  assert.equal(pending.confirmationRequired, true);
  assert.equal(pending.user.id, id);
  assert.equal(calls[0].url.searchParams.get('redirect_to'), input.emailRedirectTo);
  assert.deepEqual(calls[0].parsedBody, { email: user.email, password: input.password, data: { name: input.name }, code_challenge: input.codeChallenge, code_challenge_method: 's256' });
  const ready = await client.signUp(input);
  assert.equal(ready.confirmationRequired, false);
  assert.equal(ready.session.accessToken, accessToken);
  await assert.rejects(client.signUp({ ...input, emailRedirectTo: 'javascript:alert(1)' }), { code: 'INVALID_INPUT' });
  assert.equal(calls.length, 2);
});

test('refresh returns rotated credentials, user lookup supplies user bearer, logout has explicit local scope', async () => {
  const { client, calls } = fixture(call => call.url.pathname === '/auth/v1/user' ? response(user) : call.url.pathname === '/auth/v1/logout' ? response(null, 204) : response(session({ refresh_token: 'rotated-synthetic-token', expires_at: 1700007200 })));
  const refreshed = await client.refresh('prior-synthetic-token');
  assert.equal(refreshed.session.refreshToken, 'rotated-synthetic-token');
  assert.equal(refreshed.session.expiresAt, 1700007200);
  assert.equal(calls[0].url.searchParams.get('grant_type'), 'refresh_token');
  assert.deepEqual(calls[0].parsedBody, { refresh_token: 'prior-synthetic-token' });
  assert.equal(calls[0].headers.Authorization, undefined);
  assert.equal((await client.getUser(accessToken)).id, id);
  assert.equal(calls[1].headers.Authorization, `Bearer ${accessToken}`);
  assert.deepEqual(await client.signOut(accessToken), { ok: true });
  assert.equal(calls[2].method, 'POST');
  assert.equal(calls[2].url.searchParams.get('scope'), 'local');
  assert.equal(calls[2].headers.Authorization, `Bearer ${accessToken}`);
});

test('safe errors distinguish bad credentials, unconfirmed email, revoked token, conflicts, rate limits and outages', async () => {
  const cases = [
    [400, 'invalid_credentials', 401, 'INVALID_CREDENTIALS', false],
    [400, 'email_not_confirmed', 403, 'EMAIL_NOT_CONFIRMED', false],
    [400, 'refresh_token_already_used', 401, 'INVALID_SESSION', false],
    [401, 'bad_jwt', 401, 'INVALID_SESSION', false],
    [401, undefined, 502, 'UPSTREAM_REJECTED', false],
    [403, '42501', 403, 'ACCESS_DENIED', false],
    [409, '23505', 409, 'CONFLICT', false],
    [422, 'weak_password', 400, 'WEAK_PASSWORD', false],
    [429, undefined, 429, 'RATE_LIMITED', true],
    [503, undefined, 503, 'SUPABASE_UNAVAILABLE', true]
  ];
  for (const [upstreamStatus, code, status, expectedCode, retryable] of cases) {
    const { client } = fixture(response({ code, message: `private-${key}`, details: accessToken }, upstreamStatus));
    await assert.rejects(client.getUser(accessToken), error => {
      assert.ok(error instanceof SupabaseClientError);
      assert.equal(error.status, status);
      assert.equal(error.code, expectedCode);
      assert.equal(error.retryable, retryable);
      assert.equal(`${error.stack}${JSON.stringify(error)}`.includes(key), false);
      assert.equal(`${error.stack}${JSON.stringify(error)}`.includes(accessToken), false);
      return true;
    });
  }
});

test('transport errors do not expose URLs or credentials, and timeout aborts the upstream fetch', async () => {
  const broken = createSupabaseClient({ url, key, fetchImpl: async () => { throw new Error(`${url} ${key} ${accessToken}`); } });
  await assert.rejects(broken.getAuthSettings(), error => error.code === 'SUPABASE_UNAVAILABLE' && !error.stack.includes(key) && !error.stack.includes(url));
  let aborted = false;
  const stalled = createSupabaseClient({ url, key, timeoutMs: 10, fetchImpl: (_, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => { aborted = true; reject(new Error('synthetic transport cancelled')); }, { once: true });
  }) });
  await assert.rejects(stalled.getAuthSettings(), { code: 'UPSTREAM_TIMEOUT', status: 504, retryable: true });
  assert.equal(aborted, true);
});

test('caller cancellation prevents a request or aborts an in-flight request', async () => {
  const abort = new AbortController();
  abort.abort();
  const { client, calls } = fixture(response(user));
  await assert.rejects(client.getUser(accessToken, { signal: abort.signal }), { code: 'REQUEST_ABORTED' });
  assert.equal(calls.length, 0);
  const inFlight = new AbortController();
  const pending = createSupabaseClient({ url, key, fetchImpl: (_, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
    queueMicrotask(() => inFlight.abort());
  }) });
  await assert.rejects(pending.getAuthSettings({ signal: inFlight.signal }), { code: 'REQUEST_ABORTED' });
});

test('success response validation rejects malformed JSON, oversized bodies, redirects and partial sessions', async () => {
  for (const reply of [new Response('not JSON'), response({ unexpected: true }), response(session({ refresh_token: undefined })), response(null, 302, { Location: 'https://other.example.test' })]) {
    const { client } = fixture(reply);
    await assert.rejects(client.signIn({ email: user.email, password: 'synthetic-password' }), { code: 'INVALID_RESPONSE' });
  }
  const large = fixture(response({ excess: 'x'.repeat(300) }), { maxResponseBytes: 128 });
  await assert.rejects(large.client.getAuthSettings(), { code: 'INVALID_RESPONSE' });
  const length = fixture(response({}, 200, { 'Content-Length': '500' }), { maxResponseBytes: 128 });
  await assert.rejects(length.client.getAuthSettings(), { code: 'INVALID_RESPONSE' });
});

test('data helpers send explicit user bearer, schema, encoded owner filters and optimistic revision filter', async () => {
  const { client, calls } = fixture(() => response([{ id, revision: 2 }]));
  const owner = `${id}&or=(user_id.not.is.null)`;
  assert.deepEqual(await client.select('conversations', { accessToken, columns: ['id', 'revision'], filters: { user_id: owner }, order: [{ column: 'updated_at', direction: 'desc' }], limit: 50 }), [{ id, revision: 2 }]);
  assert.equal(calls[0].url.pathname, '/rest/v1/conversations');
  assert.equal(calls[0].url.searchParams.get('user_id'), `eq.${owner}`);
  assert.equal(calls[0].url.searchParams.has('or'), false);
  assert.equal(calls[0].url.searchParams.get('select'), 'id,revision');
  assert.equal(calls[0].url.searchParams.get('order'), 'updated_at.desc');
  assert.equal(calls[0].headers['Accept-Profile'], 'public');
  assert.equal(calls[0].headers.Authorization, `Bearer ${accessToken}`);
  await client.insert('conversations', { id, user_id: id }, { accessToken, schema: 'app', returning: ['id'] });
  assert.equal(calls[1].method, 'POST');
  assert.equal(calls[1].headers['Content-Profile'], 'app');
  assert.equal(calls[1].headers.Prefer, 'return=representation');
  await client.update('conversations', { revision: 2 }, { accessToken, filters: { id, user_id: id, revision: 1 } });
  assert.equal(calls[2].method, 'PATCH');
  assert.equal(calls[2].url.searchParams.get('revision'), 'eq.1');
  assert.equal(calls[2].url.searchParams.get('user_id'), `eq.${id}`);
});

test('data helper requires authenticated user tokens, safe identifiers, bounded body and actual update filters', async () => {
  const { client, calls } = fixture(() => response([]));
  for (const token of [undefined, key, jwt('anon'), jwt('service_role')]) {
    await assert.rejects(client.select('profiles', { accessToken: token }), { code: 'INVALID_INPUT' });
    await assert.rejects(client.getUser(token), { code: 'INVALID_INPUT' });
    await assert.rejects(client.signOut(token), { code: 'INVALID_INPUT' });
  }
  await assert.rejects(client.select('../auth/v1/user', { accessToken }), { code: 'INVALID_INPUT' });
  await assert.rejects(client.select('profiles', { accessToken, schema: 'public\r\nX-Test: no' }), { code: 'INVALID_INPUT' });
  await assert.rejects(client.update('profiles', { name: 'new' }, { accessToken, filters: {} }), { code: 'INVALID_INPUT' });
  await assert.rejects(client.update('profiles', { name: 'new' }, { accessToken, filters: { select: 'id' } }), { code: 'INVALID_INPUT' });
  await assert.rejects(client.insert('profiles', { body: 'x'.repeat(1024 * 1024) }, { accessToken }), { code: 'INVALID_INPUT' });
  assert.equal(calls.length, 0);
});

test('no matched data rows remain empty for caller conflict handling; schema/permission failures never masquerade as an empty result', async () => {
  const empty = fixture(response([]));
  assert.deepEqual(await empty.client.update('conversations', { revision: 2 }, { accessToken, filters: { id, revision: 1 } }), []);
  const missing = fixture(response({ code: 'PGRST205', message: 'private schema detail' }, 404));
  await assert.rejects(missing.client.select('profiles', { accessToken }), { code: 'UPSTREAM_REJECTED', status: 502 });
  const denied = fixture(response({ code: '42501', details: 'private row' }, 403));
  await assert.rejects(denied.client.select('profiles', { accessToken }), { code: 'ACCESS_DENIED', status: 403 });
});
