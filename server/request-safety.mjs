export class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function assertLocalOrigin(req) {
  const host = req.headers.host;
  if (!host) {
    if (req.headers.origin) throw new RequestError(403, 'A local same-origin request is required.');
    return;
  }
  let target;
  try { target = new URL(`http://${host}`); } catch { throw new RequestError(403, 'Invalid local host.'); }
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)) throw new RequestError(403, 'This development API accepts localhost requests only.');
  if (req.headers.origin) {
    const expected = `${req.socket?.encrypted ? 'https' : 'http'}://${host}`;
    if (req.headers.origin !== expected) throw new RequestError(403, 'Cross-origin API requests are not allowed.');
  }
}

export async function readRequestBody(req, limit = 24 * 1024 * 1024) {
  const length = req.headers['content-length'];
  if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > limit)) {
    req.resume?.();
    throw new RequestError(413, 'The request is too large. Please send fewer or smaller files.');
  }
  const chunks = [];
  let bytes = 0;
  const iterator = typeof req.iterator === 'function' ? req.iterator({ destroyOnReturn: false }) : req;
  for await (const value of iterator) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    bytes += chunk.length;
    if (bytes > limit) {
      req.resume?.();
      throw new RequestError(413, 'The request is too large. Please send fewer or smaller files.');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function parseJsonObject(body) {
  let value;
  try { value = JSON.parse(body.toString('utf8')); } catch { throw new RequestError(400, 'The request must contain valid JSON.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RequestError(400, 'The request must be a JSON object.');
  return value;
}

export function validateChatFields({ message, history, profile }) {
  if (typeof message !== 'string' || !message.trim()) throw new RequestError(400, 'A question is required.');
  if (message.length > 6000) throw new RequestError(400, 'Please keep your question within 6,000 characters.');
  if (!Array.isArray(history) || history.length > 200) throw new RequestError(400, 'Chat history must be a list of up to 200 messages. Start a new chat if needed.');
  if (history.some(item => !item || typeof item !== 'object' || !['user', 'assistant'].includes(item.role) || typeof item.text !== 'string' || item.text.length > 12000)) throw new RequestError(400, 'Invalid chat history message.');
  if (!profile || typeof profile !== 'object' || Array.isArray(profile) || JSON.stringify(profile).length > 8000) throw new RequestError(400, 'Invalid or oversized student profile.');
  return { message: message.trim(), history, profile };
}

export async function upstreamRequest(url, apiKey, payload, res, { timeoutMs = 55000, fetchImpl = fetch } = {}) {
  if (res.destroyed || res.writableEnded) {
    throw new RequestError(504, 'The AI request timed out or was cancelled. Please try again.');
  }
  if (Number.isFinite(res.advisorDeadline)) {
    timeoutMs = Math.min(timeoutMs, res.advisorDeadline - Date.now());
    if (timeoutMs <= 0) throw new RequestError(504, 'The AI request timed out. Please try again.');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const disconnect = () => { if (!res.writableEnded) controller.abort(); };
  res.once?.('close', disconnect);
  try {
    const response = await fetchImpl(url, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: controller.signal });
    const raw = await response.text();
    if (!response.ok) {
      let detail = '';
      try { const parsed = JSON.parse(raw); detail = parsed.error?.message || parsed.message || parsed.code || ''; } catch { /* Do not expose arbitrary upstream HTML. */ }
      detail = String(detail).replaceAll(apiKey, '[redacted]').replace(/sk-[a-z0-9_-]+/gi, '[redacted]').slice(0, 180);
      throw new RequestError(502, `Qwen request failed (${response.status})${detail ? `: ${detail}` : '.'}`);
    }
    let data;
    try { data = JSON.parse(raw); } catch { throw new RequestError(502, 'Qwen returned an invalid response. Please try again.'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new RequestError(502, 'Qwen returned an invalid response object. Please try again.');
    return data;
  } catch (error) {
    if (controller.signal.aborted) throw new RequestError(504, 'The AI request timed out or was cancelled. Please try again.');
    if (error instanceof RequestError) throw error;
    throw new RequestError(502, 'Could not connect to the AI service. Please try again.');
  } finally {
    clearTimeout(timer);
    res.off?.('close', disconnect);
  }
}
