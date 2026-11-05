const AUTH_ENDPOINTS = new Set(['/api/auth/login', '/api/auth/register', '/api/auth/session']);

function responseError(response, data) {
  const defaults = {
    400: 'Please check your details and try again.',
    401: 'Your session has ended. Please sign in again.',
    403: 'This request could not be completed. Please refresh and try again.',
    409: 'An account with this email already exists. Please sign in instead.',
    413: 'The information you entered is too long. Please check your details.',
    429: 'Too many attempts. Please wait a moment and try again.',
  };
  const provided = typeof data?.error === 'string' ? data.error : data?.message;
  const safeMessage = typeof provided === 'string' && provided.length <= 300 && !/[<>]|SQLITE_|\bat \S+\(/.test(provided);
  const error = new Error(safeMessage ? provided : defaults[response.status] || 'We could not complete your request. Please try again shortly.');
  error.status = response.status;
  return error;
}

/** Send a JSON request using the server-managed, same-origin session cookie. */
export async function apiRequest(path, { method = 'GET', body, signal, expectedUserId, guest = false } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(expectedUserId ? { 'X-PolyPath-User': expectedUserId } : {}), ...(guest ? { 'X-PolyPath-Access': 'guest' } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: signal || AbortSignal.timeout(20000),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Unable to reach PolyPath. Check your connection and try again.');
  }

  let data;
  try {
    data = response.status === 204 ? {} : await response.json();
  } catch {
    if (response.ok) throw new Error('The account service is unavailable. Please check that the PolyPath server is running and try again.');
  }

  if (!response.ok) {
    if (response.status === 401 && !AUTH_ENDPOINTS.has(path.split('?')[0]) && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('polypath:unauthorized'));
    }
    throw responseError(response, data);
  }
  return data;
}
