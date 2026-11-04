import { getAdvisorStatus, handleAdvisorRequest } from './deepseek-advisor.mjs';

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(payload));
}

/** The same access boundary serves both Vite and the production HTTP server. */
export function createAdvisorAccess({
  auth,
  env = process.env,
  advisorHandler = handleAdvisorRequest,
  rateLimitMax = 20,
  rateLimitWindowMs = 15 * 60 * 1000,
  now = Date.now,
  handlerOptions = {}
}) {
  const attempts = new Map();
  const guestLimits = { requests: rateLimitMax, windowSeconds: Math.ceil(rateLimitWindowMs / 1000) };

  function useGuestQuota(req, res) {
    const currentTime = now();
    for (const [key, value] of attempts) if (value.reset <= currentTime) attempts.delete(key);
    // The actual socket peer is authoritative; client-supplied forwarding headers are not.
    const key = req.socket.remoteAddress || 'unknown';
    let entry = attempts.get(key);
    if (!entry) {
      if (attempts.size >= 10000) {
        res.setHeader('Retry-After', '60');
        json(res, 429, { error: 'Guest access is busy. Please try again later or sign in.' });
        return null;
      }
      entry = { count: 0, reset: currentTime + rateLimitWindowMs };
      attempts.set(key, entry);
    }
    if (entry.count >= rateLimitMax) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((entry.reset - currentTime) / 1000))));
      json(res, 429, { error: 'You have reached the guest message limit. Sign in to continue, or try again later.', access: 'guest', guestLimits });
      return null;
    }
    entry.count++;
    return rateLimitMax - entry.count;
  }

  return async function handleAdvisorAccess(req, res) {
    const path = req.url?.split('?')[0];
    if (path !== '/api/advisor' && path !== '/api/advisor/status') return false;
    res.setHeader('Cache-Control', 'no-store');
    const expectedMethod = path.endsWith('/status') ? 'GET' : 'POST';
    if (req.method !== expectedMethod) {
      res.setHeader('Allow', expectedMethod);
      json(res, 405, { error: `Use ${expectedMethod} for this endpoint.` });
      return true;
    }
    if (req.method === 'POST' && !auth.checkSameOrigin(req, res)) return true;

    // A request issued for an account must not become an anonymous request after logout
    // or an account change in another tab. requireUser also checks the exact account ID.
    const expectedUser = req.headers['x-polypath-user'];
    const account = expectedUser !== undefined ? auth.requireUser(req, res) : auth.getAccount(req);
    if (expectedUser !== undefined && !account) return true;
    const forceGuest = req.headers['x-polypath-access'] === 'guest';
    const guest = forceGuest || !account;
    const access = guest ? 'guest' : 'member';
    const advisorEnv = guest
      ? (env.QWEN_API_KEY ? { QWEN_API_KEY: env.QWEN_API_KEY, QWEN_BASE_URL: env.QWEN_BASE_URL, QWEN_MODEL: env.QWEN_MODEL } : {})
      : env;
    if (path.endsWith('/status')) {
      json(res, 200, { ...getAdvisorStatus(advisorEnv), access, ...(guest ? { guestLimits } : {}) });
      return true;
    }
    const guestRemaining = guest ? useGuestQuota(req, res) : undefined;
    if (guest && guestRemaining === null) return true;
    const initialUserId = account?.user.id;
    const revalidateMember = guest ? undefined : () => {
      const current = auth.requireUser(req, res);
      if (!current) return false;
      // Also pin cookie-only callers, whose request omitted an expected-user header.
      if (current.user.id !== initialUserId) {
        json(res, 401, { error: 'Your account has changed. Please refresh your workspace before continuing.' });
        return false;
      }
      return true;
    };
    await advisorHandler(req, res, advisorEnv, { ...handlerOptions, access, guestRemaining, revalidateMember });
    return true;
  };
}
