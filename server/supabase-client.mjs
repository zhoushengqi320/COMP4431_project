// Server-only transport. Session results contain credentials for the BFF session
// store; never serialize them into a browser API response or log them.
// HTTP contracts: https://github.com/supabase/auth/blob/master/openapi.yaml
// Data API: https://docs.postgrest.org/en/stable/references/api/tables_views.html
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9._~-]+$/;
const MAX_REQUEST_BYTES = 1024 * 1024;

export class SupabaseClientError extends Error {
  constructor(message, { status = 503, code = 'SUPABASE_UNAVAILABLE', retryable = false } = {}) {
    super(message);
    this.name = 'SupabaseClientError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

const invalid = message => new SupabaseClientError(message, { status: 400, code: 'INVALID_INPUT' });
const invalidResponse = () => new SupabaseClientError('Supabase returned an invalid response.', { status: 502, code: 'INVALID_RESPONSE' });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function string(value, label, max, min = 1) {
  if (typeof value !== 'string' || value.length < min || value.length > max) throw invalid(`${label} is invalid.`);
  return value;
}

function jwtRole(value) {
  if (typeof value !== 'string' || value.length > 16384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) return null;
  try { return JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString('utf8')).role; } catch { return null; }
}

function userToken(value) {
  // This is a credential-type check, not JWT verification. Auth /user and RLS
  // perform verification. Elevated keys must never enter the user data path.
  if (jwtRole(value) !== 'authenticated') throw invalid('A user access token is required.');
  return value;
}

function opaqueToken(value, label) {
  string(value, label, 16384);
  if (!TOKEN.test(value)) throw invalid(`${label} is invalid.`);
  return value;
}

function identifier(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) throw invalid(`${label} is invalid.`);
  return value;
}

function columnsQuery(columns) {
  if (!Array.isArray(columns) || !columns.length || columns.length > 100) throw invalid('Columns are invalid.');
  if (columns.length === 1 && columns[0] === '*') return '*';
  return columns.map(column => identifier(column, 'Column')).join(',');
}

function addFilters(query, filters, required = false) {
  if (!object(filters) || (required && !Object.keys(filters).length) || Object.keys(filters).length > 50) throw invalid('Filters are invalid.');
  for (const [column, value] of Object.entries(filters)) {
    identifier(column, 'Filter column');
    if (['select', 'order', 'limit', 'offset', 'or', 'and'].includes(column)) throw invalid('Filter column is reserved.');
    if (value === null) query.set(column, 'is.null');
    else if ((typeof value === 'string' && value.length <= 4000) || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
      query.set(column, `eq.${value}`);
    } else throw invalid('Filter value is invalid.');
  }
}

function normalizeUser(value) {
  if (!object(value) || typeof value.id !== 'string' || !UUID.test(value.id)) throw invalidResponse();
  const email = typeof value.email === 'string' ? value.email.slice(0, 254) : '';
  const metadata = object(value.user_metadata) ? value.user_metadata : {};
  const name = [metadata.name, metadata.full_name].find(item => typeof item === 'string' && item.trim());
  return { id: value.id, email, name: (name || email.split('@')[0] || 'Student').slice(0, 80) };
}

function normalizeSession(data, now) {
  if (!object(data) || typeof data.access_token !== 'string' || jwtRole(data.access_token) !== 'authenticated' ||
      typeof data.refresh_token !== 'string' || !data.refresh_token || !TOKEN.test(data.refresh_token) || data.refresh_token.length > 16384 ||
      !Number.isInteger(data.expires_in) || data.expires_in <= 0 || data.expires_in > 31536000 ||
      typeof data.token_type !== 'string' || data.token_type.toLowerCase() !== 'bearer') throw invalidResponse();
  const expiresAt = data.expires_at ?? Math.floor(now() / 1000) + data.expires_in;
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) throw invalidResponse();
  return {
    user: normalizeUser(data.user),
    session: { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt, expiresIn: data.expires_in, tokenType: 'bearer' }
  };
}

function upstreamError(status, data, context) {
  // Never forward provider messages/details: they may include SQL, row contents,
  // credentials, email addresses, or internal URLs.
  const code = object(data) ? (data.error_code || data.code || data.error) : undefined;
  if (status === 429) return new SupabaseClientError('Too many requests. Please try again later.', { status: 429, code: 'RATE_LIMITED', retryable: true });
  if (status >= 500) return new SupabaseClientError('Supabase is temporarily unavailable. Please try again.', { retryable: true });
  if (code === 'invalid_credentials') return new SupabaseClientError('The email or password is incorrect.', { status: 401, code: 'INVALID_CREDENTIALS' });
  if (code === 'email_not_confirmed') return new SupabaseClientError('Confirm your email address before signing in.', { status: 403, code: 'EMAIL_NOT_CONFIRMED' });
  if (['bad_jwt', 'session_not_found', 'refresh_token_not_found', 'refresh_token_already_used', 'user_not_found', 'PGRST301', 'PGRST303'].includes(code)) {
    return new SupabaseClientError('Your session has expired. Please sign in again.', { status: 401, code: 'INVALID_SESSION' });
  }
  if (code === 'weak_password') return new SupabaseClientError('Choose a stronger password that meets the account requirements.', { status: 400, code: 'WEAK_PASSWORD' });
  if (code === 'email_address_invalid') return new SupabaseClientError('Enter a valid email address.', { status: 400, code: 'INVALID_EMAIL' });
  if (code === 'signup_disabled') return new SupabaseClientError('New account registration is currently disabled.', { status: 403, code: 'SIGNUP_DISABLED' });
  if (status === 409) return new SupabaseClientError('The saved data changed or already exists.', { status: 409, code: 'CONFLICT' });
  if (status === 403 || code === '42501') return new SupabaseClientError('This operation is not permitted.', { status: 403, code: 'ACCESS_DENIED' });
  if (context === 'auth' && [400, 422].includes(status)) return new SupabaseClientError('The authentication request could not be completed.', { status: 400, code: 'AUTH_REJECTED' });
  // A generic 401 can be an invalid project key, not an expired user session.
  return new SupabaseClientError('The Supabase request could not be completed.', { status: 502, code: 'UPSTREAM_REJECTED' });
}

async function readResponse(response, maxBytes) {
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel();
    throw invalidResponse();
  }
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw invalidResponse();
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (!size) return null;
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw invalidResponse(); }
}

/** No requests occur at construction. Auth session.expiresAt is Unix seconds.
 * This stateless transport does not retry writes or coordinate refreshes: the
 * eventual auth adapter must serialize refreshes and persist both rotated tokens.
 * All data methods require a user JWT and
 * return rows under that user's RLS policies. The caller must also apply its
 * explicit owner filter and map/validate the known table's columns.
 */
export function createSupabaseClient({ url, key, fetchImpl = globalThis.fetch, timeoutMs = 10000, maxResponseBytes = 2 * 1024 * 1024, now = Date.now } = {}) {
  let origin;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || !['', '/'].includes(parsed.pathname)) throw new Error();
    origin = parsed.origin;
  } catch { throw invalid('SUPABASE_URL must be an HTTPS origin.'); }
  if (typeof key !== 'string' || key.length > 4096 || (!/^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(key) && jwtRole(key) !== 'anon')) {
    throw invalid('Use a Supabase publishable key or legacy anon key. Elevated keys are not supported.');
  }
  if (typeof fetchImpl !== 'function' || typeof now !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000 ||
      !Number.isInteger(maxResponseBytes) || maxResponseBytes < 128 || maxResponseBytes > 32 * 1024 * 1024) throw invalid('Supabase transport options are invalid.');

  async function request(path, { method = 'GET', query, body, accessToken, schema, signal, context = 'auth', allowEmpty = false } = {}) {
    const target = new URL(path, origin);
    if (query) target.search = query.toString();
    const headers = { apikey: key, Accept: 'application/json' };
    if (accessToken !== undefined) headers.Authorization = `Bearer ${userToken(accessToken)}`;
    if (schema) headers[method === 'GET' ? 'Accept-Profile' : 'Content-Profile'] = identifier(schema, 'Schema');
    let payload;
    if (body !== undefined) {
      try { payload = JSON.stringify(body); } catch { throw invalid('Request body is invalid.'); }
      if (typeof payload !== 'string' || Buffer.byteLength(payload) > MAX_REQUEST_BYTES) throw invalid('Request body is too large.');
      headers['Content-Type'] = 'application/json';
    }
    if (context === 'data' && method !== 'GET') headers.Prefer = 'return=representation';
    const controller = new AbortController();
    let timer;
    let abortListener;
    const cancelled = new Promise((_, reject) => {
      const abort = error => { reject(error); controller.abort(); };
      timer = setTimeout(() => abort(new SupabaseClientError('Supabase took too long to respond. Please try again.', { status: 504, code: 'UPSTREAM_TIMEOUT', retryable: true })), timeoutMs);
      if (signal) {
        abortListener = () => abort(new SupabaseClientError('The request was cancelled.', { status: 499, code: 'REQUEST_ABORTED' }));
        if (signal.aborted) abortListener();
        else signal.addEventListener('abort', abortListener, { once: true });
      }
    });
    try {
      return await Promise.race([cancelled, (async () => {
        if (controller.signal.aborted) throw new SupabaseClientError('The request was cancelled.', { status: 499, code: 'REQUEST_ABORTED' });
        const response = await fetchImpl(target.href, { method, headers, body: payload, signal: controller.signal, redirect: 'error', cache: 'no-store' });
        if (response.redirected || (response.status >= 300 && response.status < 400)) throw invalidResponse();
        let data;
        try { data = await readResponse(response, maxResponseBytes); } catch (error) {
          if (response.ok) throw error;
          // Non-JSON errors still receive a safe status-specific message.
          throw upstreamError(response.status, null, context);
        }
        if (!response.ok) throw upstreamError(response.status, data, context);
        if (data === null && !allowEmpty) throw invalidResponse();
        return data;
      })()]);
    } catch (error) {
      if (error instanceof SupabaseClientError) throw error;
      throw new SupabaseClientError('Supabase could not be reached. Please try again.', { retryable: true });
    } finally {
      clearTimeout(timer);
      if (signal && abortListener) signal.removeEventListener('abort', abortListener);
    }
  }

  const rows = data => {
    if (!Array.isArray(data) || data.some(row => !object(row))) throw invalidResponse();
    return data;
  };
  return {
    async getAuthSettings({ signal } = {}) {
      const data = await request('/auth/v1/settings', { signal });
      if (!object(data) || typeof data.external?.email !== 'boolean' || typeof data.disable_signup !== 'boolean' || typeof data.mailer_autoconfirm !== 'boolean') throw invalidResponse();
      return { emailEnabled: data.external.email, signupEnabled: !data.disable_signup, emailAutoConfirm: data.mailer_autoconfirm };
    },
    async signIn({ email, password, signal }) {
      const data = await request('/auth/v1/token', { method: 'POST', query: new URLSearchParams({ grant_type: 'password' }), body: { email: string(email, 'Email', 254), password: string(password, 'Password', 128) }, signal });
      return normalizeSession(data, now);
    },
    async signUp({ email, password, name, emailRedirectTo, codeChallenge, signal }) {
      const body = { email: string(email, 'Email', 254), password: string(password, 'Password', 128, 8), data: { name: string(name, 'Name', 80) } };
      const query = new URLSearchParams();
      if (emailRedirectTo !== undefined) {
        let redirect;
        try { redirect = new URL(emailRedirectTo); } catch { throw invalid('Email redirect URL is invalid.'); }
        if (redirect.username || redirect.password || !(redirect.protocol === 'https:' || (redirect.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(redirect.hostname)))) throw invalid('Email redirect URL is invalid.');
        query.set('redirect_to', redirect.href);
      }
      if (codeChallenge !== undefined) {
        if (typeof codeChallenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) throw invalid('PKCE challenge is invalid.');
        body.code_challenge = codeChallenge;
        body.code_challenge_method = 's256';
      }
      const data = await request('/auth/v1/signup', { method: 'POST', query, body, signal });
      if (object(data) && ('access_token' in data || 'refresh_token' in data)) return { ...normalizeSession(data, now), confirmationRequired: false };
      return { user: normalizeUser(data), session: null, confirmationRequired: true };
    },
    async refresh(refreshToken, { signal } = {}) {
      const data = await request('/auth/v1/token', { method: 'POST', query: new URLSearchParams({ grant_type: 'refresh_token' }), body: { refresh_token: opaqueToken(refreshToken, 'Refresh token') }, signal });
      return normalizeSession(data, now);
    },
    async getUser(accessToken, { signal } = {}) {
      userToken(accessToken);
      return normalizeUser(await request('/auth/v1/user', { accessToken, signal }));
    },
    async signOut(accessToken, { signal } = {}) {
      userToken(accessToken);
      await request('/auth/v1/logout', { method: 'POST', query: new URLSearchParams({ scope: 'local' }), accessToken, signal, allowEmpty: true });
      return { ok: true };
    },
    async select(table, { accessToken, columns = ['*'], filters = {}, order = [], limit = 50, schema = 'public', signal } = {}) {
      userToken(accessToken);
      const query = new URLSearchParams({ select: columnsQuery(columns) });
      addFilters(query, filters);
      if (!Number.isInteger(limit) || limit < 1 || limit > 1000 || !Array.isArray(order) || order.length > 10) throw invalid('Read options are invalid.');
      query.set('limit', String(limit));
      if (order.length) query.set('order', order.map(item => {
        if (!object(item) || (item.direction !== undefined && !['asc', 'desc'].includes(item.direction))) throw invalid('Sort order is invalid.');
        return `${identifier(item.column, 'Sort column')}.${item.direction || 'asc'}`;
      }).join(','));
      return rows(await request(`/rest/v1/${identifier(table, 'Table')}`, { accessToken, query, schema, signal, context: 'data' }));
    },
    async insert(table, values, { accessToken, returning = ['*'], schema = 'public', signal } = {}) {
      userToken(accessToken);
      if (!object(values) || !Object.keys(values).length) throw invalid('Row values are invalid.');
      return rows(await request(`/rest/v1/${identifier(table, 'Table')}`, { method: 'POST', accessToken, body: values, query: new URLSearchParams({ select: columnsQuery(returning) }), schema, signal, context: 'data' }));
    },
    async update(table, values, { accessToken, filters, returning = ['*'], schema = 'public', signal } = {}) {
      userToken(accessToken);
      if (!object(values) || !Object.keys(values).length) throw invalid('Row values are invalid.');
      const query = new URLSearchParams({ select: columnsQuery(returning) });
      addFilters(query, filters, true);
      return rows(await request(`/rest/v1/${identifier(table, 'Table')}`, { method: 'PATCH', accessToken, body: values, query, schema, signal, context: 'data' }));
    }
  };
}
