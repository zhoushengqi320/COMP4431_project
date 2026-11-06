import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';
import { TEST_ACCOUNT } from './test-account.mjs';

const deriveKey = promisify(scrypt);
const COOKIE = 'polypath_session';
const DAY = 24 * 60 * 60 * 1000;
const BODY_LIMIT = 16 * 1024;
const CONVERSATION_LIMIT = 256 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCRYPT = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const EMPTY_PROFILE = { programme: '', year: '', semester: '', graduation: '', interests: '' };
const PROFILE_LIMITS = { programme: 160, year: 80, semester: 80, graduation: 7, interests: 1000 };
const METHODS = {
  '/api/auth/session': 'GET',
  '/api/auth/register': 'POST',
  '/api/auth/login': 'POST',
  '/api/auth/logout': 'POST',
  '/api/profile': 'PUT',
  '/api/conversations': 'GET'
};

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(payload));
}

function fail(status, message) {
  return Object.assign(new Error(message), { status });
}

function readJson(req, limit = BODY_LIMIT) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) {
    req.resume();
    return Promise.reject(fail(415, 'Send the request as application/json.'));
  }
  if (Number(req.headers['content-length']) > limit) {
    req.resume();
    return Promise.reject(fail(413, 'The request is too large.'));
  }
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    const cleanup = () => {
      clearTimeout(timer);
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('error', onError);
      req.off('aborted', onAbort);
    };
    const stop = error => {
      cleanup();
      req.resume();
      reject(error);
    };
    const onData = chunk => {
      size += chunk.length;
      if (size > limit) return stop(fail(413, 'The request is too large.'));
      chunks.push(chunk);
    };
    const onEnd = () => {
      cleanup();
      try {
        const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
        resolveBody(data);
      } catch {
        reject(fail(400, 'Send a valid JSON object.'));
      }
    };
    const onError = () => stop(fail(400, 'The request could not be read.'));
    const onAbort = () => stop(fail(400, 'The request was interrupted.'));
    const timer = setTimeout(() => stop(fail(408, 'The request timed out.')), 15000);
    timer.unref();
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
    req.on('aborted', onAbort);
  });
}

function emailAddress(value) {
  if (typeof value !== 'string' || value.length > 254) throw fail(400, 'Enter a valid email address.');
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, 'Enter a valid email address.');
  return email;
}

function passwordValue(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) {
    throw fail(400, 'Use a password between 8 and 128 characters.');
  }
  return value;
}

function publicAccount(row) {
  return { user: { id: row.id, name: row.name, email: row.email }, profile: JSON.parse(row.profile_json) };
}

function sessionToken(req) {
  const value = (req.headers.cookie || '').split(';').find(part => part.trim().startsWith(`${COOKIE}=`));
  const token = value?.trim().slice(COOKIE.length + 1);
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

const tokenHash = token => createHash('sha256').update(token).digest('hex');

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail(400, `${label} must be an object.`);
  return value;
}

function textField(value, label, max, required = false) {
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
    throw fail(400, `${label} must be ${required ? 'nonempty ' : ''}text no longer than ${max} characters.`);
  }
  return value;
}

function listField(value, label, max, map) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > max) throw fail(400, `${label} must be an array of at most ${max} items.`);
  return value.map((item, index) => map(item, `${label}[${index}]`));
}

function numberField(value, label, max = 1000) {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0 || value > max) throw fail(400, `${label} must be a number between 0 and ${max}.`);
  return value;
}

function stringFields(value, label, fields) {
  record(value, label);
  return Object.fromEntries(Object.entries(fields).map(([key, max]) => [key, textField(value[key], `${label}.${key}`, max)]).filter(([, item]) => item !== undefined));
}

function conversationMessages(value) {
  if (!Array.isArray(value) || value.length > 100) throw fail(400, 'A conversation can contain at most 100 messages.');
  const ids = new Set();
  return value.map((item, index) => {
    const label = `messages[${index}]`;
    record(item, label);
    const id = textField(item.id, `${label}.id`, 100, true);
    if (ids.has(id)) throw fail(400, 'Each message must have a unique id.');
    ids.add(id);
    if (!['user', 'assistant'].includes(item.role)) throw fail(400, 'Message roles must be user or assistant.');
    const message = { id, role: item.role, text: textField(item.text, `${label}.text`, 50000, true) };
    if (item.channel !== undefined) {
      if (item.channel !== 'voice') throw fail(400, 'Message channel must be voice when specified.');
      message.channel = 'voice';
    }
    if (item.replyLanguage !== undefined) {
      if (typeof item.replyLanguage !== 'string' || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,3}$/i.test(item.replyLanguage)) throw fail(400, 'Reply language must be a language tag such as en-US.');
      message.replyLanguage = item.replyLanguage;
    }
    const strings = { mode: 32, language: 32, providerWarning: 4000 };
    const displayLabelFields = Object.fromEntries(['guide', 'goals', 'outcomes', 'rating', 'example', 'summary', 'preparation', 'followUps', 'recommendations', 'exploreBelow', 'moreInfo', 'moreAction', 'missingCourses'].map(key => [key, 200]));
    if (item.labels !== undefined) message.labels = stringFields(item.labels, `${label}.labels`, displayLabelFields);
    for (const [key, max] of Object.entries(strings)) {
      if (item[key] !== undefined) message[key] = textField(item[key], `${label}.${key}`, max);
    }
    for (const key of ['overview', 'decisionNotice', 'model', 'finishReason']) {
      if (item[key] !== undefined) message[key] = textField(item[key], `${label}.${key}`, key === 'overview' || key === 'decisionNotice' ? 8000 : 200);
    }
    for (const key of ['rawMode', 'observationSaved']) {
      if (item[key] !== undefined) {
        if (typeof item[key] !== 'boolean') throw fail(400, `${label}.${key} must be a boolean.`);
        message[key] = item[key];
      }
    }
    if (item.latencyMs !== undefined) message.latencyMs = numberField(item.latencyMs, `${label}.latencyMs`, 600000);
    for (const key of ['checks', 'warnings', 'documentWarnings', 'followUps', 'unavailableCourses']) {
      const list = listField(item[key], `${label}.${key}`, 30, (text, path) => textField(text, path, 4000, true));
      if (list !== undefined) message[key] = list;
    }
    const attachments = listField(item.attachments, `${label}.attachments`, 8, (attachment, path) => {
      record(attachment, path);
      return { name: textField(attachment.name, `${path}.name`, 255, true), size: numberField(attachment.size, `${path}.size`, 10 * 1024 * 1024) };
    });
    if (attachments !== undefined) message.attachments = attachments;
    const storedLevels = (value, path) => listField(value, path, 12, (group, groupPath) => {
      record(group, groupPath);
      const courses = listField(group.courses, `${groupPath}.courses`, 40, (code, itemPath) => textField(code, itemPath, 40, true));
      const level = typeof group.level === 'number'
        ? numberField(group.level, `${groupPath}.level`, 9)
        : textField(group.level, `${groupPath}.level`, 40);
      return { ...(level !== undefined ? { level } : {}), ...(courses !== undefined ? { courses } : { courses: [] }) };
    });
    const courses = listField(item.courses, `${label}.courses`, 20, (course, path) => {
      const clean = stringFields(course, path, {
        format: 40, language: 8, code: 40, title: 300, department: 120, level: 40, faculty: 120, schoolId: 80, id: 80,
        tag: 100, reason: 4000, prerequisite: 4000, objectives: 4000, summary: 4000,
        requiredPrerequisites: 4000, recommendedPrerequisites: 4000, ratingSource: 32
      });
      if (course.labels !== undefined) clean.labels = stringFields(course.labels, `${path}.labels`, displayLabelFields);
      const credits = numberField(course.credits, `${path}.credits`);
      const rating = numberField(course.rating, `${path}.rating`, 5);
      const learningOutcomes = listField(course.learningOutcomes, `${path}.learningOutcomes`, 8, (outcome, itemPath) => textField(outcome, itemPath, 400, true));
      const prerequisiteLevels = storedLevels(course.prerequisiteLevels, `${path}.prerequisiteLevels`);
      let preparation;
      if (course.preparation !== undefined) {
        record(course.preparation, `${path}.preparation`);
        preparation = {
          ...stringFields(course.preparation, `${path}.preparation`, { description: 4000, note: 800, sourceText: 4000 }),
          ...(course.preparation.levels !== undefined ? { levels: storedLevels(course.preparation.levels, `${path}.preparation.levels`) } : {})
        };
      }
      return {
        ...clean,
        ...(credits !== undefined ? { credits } : {}),
        ...(rating !== undefined ? { rating } : {}),
        ...(learningOutcomes !== undefined ? { learningOutcomes } : {}),
        ...(prerequisiteLevels !== undefined ? { prerequisiteLevels } : {}),
        ...(preparation !== undefined ? { preparation } : {})
      };
    });
    if (courses !== undefined) message.courses = courses;
    if (item.moreCourses !== undefined) {
      record(item.moreCourses, `${label}.moreCourses`);
      const more = {};
      if (item.moreCourses.available !== undefined) {
        if (typeof item.moreCourses.available !== 'boolean') throw fail(400, `${label}.moreCourses.available must be a boolean.`);
        more.available = item.moreCourses.available;
      }
      if (item.moreCourses.prompt !== undefined) more.prompt = textField(item.moreCourses.prompt, `${label}.moreCourses.prompt`, 400);
      message.moreCourses = more;
    }
    if (item.recommendationContext !== undefined) {
      record(item.recommendationContext, `${label}.recommendationContext`);
      const context = {};
      if (item.recommendationContext.query !== undefined) context.query = textField(item.recommendationContext.query, `${label}.recommendationContext.query`, 6000);
      const seenCodes = listField(item.recommendationContext.seenCodes, `${label}.recommendationContext.seenCodes`, 500, (code, path) => textField(code, path, 40, true));
      const reserveCodes = listField(item.recommendationContext.reserveCodes, `${label}.recommendationContext.reserveCodes`, 100, (code, path) => textField(code, path, 40, true));
      if (seenCodes !== undefined) context.seenCodes = seenCodes;
      if (reserveCodes !== undefined) context.reserveCodes = reserveCodes;
      message.recommendationContext = context;
    }
    if (item.usage !== undefined) {
      record(item.usage, `${label}.usage`);
      const usage = {};
      for (const key of ['prompt_tokens', 'completion_tokens', 'total_tokens']) {
        if (item.usage[key] !== undefined) usage[key] = numberField(item.usage[key], `${label}.usage.${key}`, 1_000_000);
      }
      message.usage = usage;
    }
    const semesters = listField(item.semesters, `${label}.semesters`, 20, (semester, path) => {
      const clean = stringFields(semester, path, { title: 300 });
      const credits = numberField(semester.credits, `${path}.credits`);
      const courses = listField(semester.courses, `${path}.courses`, 30, (course, itemPath) => textField(course, itemPath, 500, true));
      if (!courses) throw fail(400, `${path}.courses must be an array.`);
      return { ...clean, courses, ...(credits !== undefined ? { credits } : {}) };
    });
    if (semesters !== undefined) message.semesters = semesters;
    const sources = listField(item.sources, `${label}.sources`, 20, (source, path) => {
      const clean = stringFields(source, path, { id: 200, title: 500, detail: 8000, kind: 80, url: 2048 });
      if (clean.url) {
        let parsed;
        try { parsed = new URL(clean.url); } catch { throw fail(400, 'Source links must be valid http(s) URLs.'); }
        if (!['http:', 'https:'].includes(parsed.protocol)) throw fail(400, 'Source links must be valid http(s) URLs.');
      }
      return clean;
    });
    if (sources !== undefined) message.sources = sources;
    // Only renderable fields are retained; raw evidence, files and UI state are not stored.
    return message;
  });
}

function conversationFromRow(row) {
  return { id: row.id, title: row.title, messages: JSON.parse(row.messages_json), updatedAt: new Date(row.updated_at).toISOString(), revision: row.revision };
}

/** A reusable HTTP middleware. The caller owns the returned service's lifetime. */
export function createAuthService({
  databasePath = resolve('data/polypath.sqlite'),
  secureCookies = false,
  allowedOrigin,
  rateLimitMax = 20,
  rateLimitWindowMs = 15 * 60 * 1000,
  now = Date.now
} = {}) {
  if (allowedOrigin) {
    const parsed = new URL(allowedOrigin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== allowedOrigin) {
      throw new Error('AUTH_ORIGIN must be an http(s) origin without a trailing slash or path.');
    }
    secureCookies ||= parsed.protocol === 'https:';
  }
  if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(databasePath);
  if (databasePath !== ':memory:') chmodSync(databasePath, 0o600);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      profile_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      messages_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      revision INTEGER NOT NULL CHECK (revision > 0)
    );
    CREATE INDEX IF NOT EXISTS conversations_owner_updated ON conversations(user_id, updated_at DESC);
  `);
  const queries = {
    email: db.prepare('SELECT * FROM users WHERE email = ?'),
    session: db.prepare('SELECT users.* FROM sessions JOIN users ON sessions.user_id = users.id WHERE token_hash = ? AND expires_at > ?'),
    createUser: db.prepare('INSERT INTO users (id, name, email, password_hash, profile_json, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
    createSession: db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    deleteExpired: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
    profile: db.prepare('UPDATE users SET profile_json = ? WHERE id = ?'),
    conversations: db.prepare('SELECT id, title, messages_json, updated_at, revision FROM conversations WHERE user_id = ? ORDER BY updated_at DESC, id ASC LIMIT 50'),
    conversation: db.prepare('SELECT id, title, messages_json, updated_at, revision FROM conversations WHERE user_id = ? AND id = ?'),
    conversationCount: db.prepare('SELECT COUNT(*) AS count FROM conversations WHERE user_id = ?'),
    createConversation: db.prepare('INSERT INTO conversations (id, user_id, title, messages_json, updated_at, revision) VALUES (?, ?, ?, ?, ?, 1) ON CONFLICT(id) DO NOTHING'),
    updateConversation: db.prepare('UPDATE conversations SET title = ?, messages_json = ?, updated_at = ?, revision = revision + 1 WHERE user_id = ? AND id = ? AND revision = ?')
  };
  const attempts = new Map();
  const dummySalt = randomBytes(16).toString('hex');
  const dummyHash = randomBytes(64);
  let activeHashes = 0;

  function secure(req) {
    return secureCookies || Boolean(req.socket.encrypted);
  }

  function cookie(req, res, token, maxAge) {
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure(req) ? '; Secure' : ''}`);
  }

  function checkSameOrigin(req, res) {
    let acceptable = req.headers['sec-fetch-site'] !== 'cross-site';
    if (req.headers.origin) {
      try {
        const expected = allowedOrigin || new URL(`${secure(req) ? 'https' : 'http'}://${req.headers.host}`).origin;
        acceptable &&= req.headers.origin === expected;
      } catch {
        acceptable = false;
      }
    }
    if (!acceptable) json(res, 403, { error: 'This request must come from the same site.' });
    return acceptable;
  }

  function accountForToken(req) {
    const token = sessionToken(req);
    if (!token) return null;
    const row = queries.session.get(tokenHash(token), now());
    return row ? publicAccount(row) : null;
  }

  function getAccount(req) {
    const account = accountForToken(req);
    const expectedUser = req.headers['x-polypath-user'];
    return account && (expectedUser === undefined || expectedUser === account.user.id) ? account : null;
  }

  function requireUser(req, res) {
    const account = accountForToken(req);
    if (!account) {
      json(res, 401, { error: 'Please sign in to continue.' });
      return null;
    }
    const expectedUser = req.headers['x-polypath-user'];
    if (expectedUser !== undefined && expectedUser !== account.user.id) {
      json(res, 401, { error: 'Your account has changed. Please refresh your workspace before continuing.' });
      return null;
    }
    return account;
  }

  function rateLimit(key, res) {
    const currentTime = now();
    for (const [entryKey, entry] of attempts) {
      if (entry.reset <= currentTime) attempts.delete(entryKey);
    }
    let entry = attempts.get(key);
    if (!entry) {
      // Bound the limiter itself when requests arrive from many addresses.
      if (attempts.size >= 10000) {
        res.setHeader('Retry-After', '60');
        throw fail(429, 'Too many sign-in attempts. Please try again later.');
      }
      entry = { count: 0, reset: currentTime + rateLimitWindowMs };
      attempts.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > rateLimitMax) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((entry.reset - currentTime) / 1000))));
      throw fail(429, 'Too many sign-in attempts. Please try again later.');
    }
  }

  async function passwordKey(password, salt) {
    if (activeHashes >= 4) throw fail(503, 'Sign-in is busy. Please try again shortly.');
    activeHashes += 1;
    try {
      return await deriveKey(password, salt, 64, SCRYPT);
    } finally {
      activeHashes -= 1;
    }
  }

  async function hashPassword(password) {
    const salt = randomBytes(16).toString('hex');
    const key = await passwordKey(password, salt);
    return `scrypt$32768$8$3$${salt}$${key.toString('hex')}`;
  }

  // Called by the development server only; never reset an existing account.
  async function ensureTestAccount() {
    if (queries.email.get(TEST_ACCOUNT.email)) return false;
    const passwordHash = await hashPassword(TEST_ACCOUNT.password);
    const inserted = db.prepare(`
      INSERT INTO users (id, name, email, password_hash, profile_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(email) DO NOTHING
    `).run(randomUUID(), TEST_ACCOUNT.name, TEST_ACCOUNT.email, passwordHash, JSON.stringify(EMPTY_PROFILE), now());
    return inserted.changes === 1;
  }

  async function verifyPassword(password, storedHash) {
    const parts = storedHash?.split('$');
    const validHash = parts?.length === 6 && parts.slice(0, 4).join('$') === 'scrypt$32768$8$3'
      && /^[a-f0-9]{32}$/.test(parts[4]) && /^[a-f0-9]{128}$/.test(parts[5]);
    const candidate = await passwordKey(password, validHash ? parts[4] : dummySalt);
    const expected = validHash ? Buffer.from(parts[5], 'hex') : dummyHash;
    return timingSafeEqual(candidate, expected) && Boolean(validHash);
  }

  function createSession(req, res, userId, remember = false) {
    const token = randomBytes(32).toString('base64url');
    const lifetime = (remember ? 30 : 7) * DAY;
    const time = now();
    queries.deleteExpired.run(time);
    const previous = sessionToken(req);
    if (previous) queries.deleteSession.run(tokenHash(previous));
    queries.createSession.run(tokenHash(token), userId, time + lifetime, time);
    cookie(req, res, token, lifetime / 1000);
  }

  async function handle(req, res) {
    const path = req.url?.split('?')[0];
    const conversationPath = path === '/api/conversations' || path?.startsWith('/api/conversations/');
    if (!conversationPath && path !== '/api/profile' && path !== '/api/auth' && !path?.startsWith('/api/auth/')) return false;
    try {
      const conversationId = path?.startsWith('/api/conversations/') ? path.slice('/api/conversations/'.length).toLowerCase() : null;
      if (conversationId !== null && !UUID.test(conversationId)) throw fail(400, 'Use a valid conversation UUID.');
      const method = conversationId ? 'PUT' : METHODS[path];
      if (!method) throw fail(404, 'This API endpoint does not exist.');
      if (req.method !== method) {
        res.setHeader('Allow', method);
        throw fail(405, `Use ${method} for this endpoint.`);
      }
      if (method !== 'GET' && !checkSameOrigin(req, res)) return true;

      if (conversationPath) {
        const account = requireUser(req, res);
        if (!account) return true;
        if (method === 'GET') {
          json(res, 200, { conversations: queries.conversations.all(account.user.id).map(conversationFromRow) });
          return true;
        }
        const data = await readJson(req, CONVERSATION_LIMIT);
        if (Object.keys(data).some(key => !['title', 'messages', 'revision'].includes(key))) throw fail(400, 'Only title, messages and revision can be saved.');
        const title = textField(data.title, 'title', 120, true).trim();
        if (!Number.isSafeInteger(data.revision) || data.revision < 0 || data.revision >= Number.MAX_SAFE_INTEGER) {
          throw fail(400, 'The conversation revision must be a nonnegative integer.');
        }
        const messages = conversationMessages(data.messages);
        const updatedAt = now();
        const conversation = { id: conversationId, title, messages, updatedAt: new Date(updatedAt).toISOString(), revision: data.revision + 1 };
        if (Buffer.byteLength(JSON.stringify(conversation)) > CONVERSATION_LIMIT) throw fail(413, 'A saved conversation must be no larger than 256 KiB.');
        // Recheck after reading the body, so a revoked session cannot finish a delayed write.
        if (!requireUser(req, res)) return true;
        db.exec('BEGIN IMMEDIATE');
        let created = false;
        try {
          const previous = queries.conversation.get(account.user.id, conversationId);
          if (previous) {
            if (previous.revision !== data.revision) throw fail(409, 'This conversation changed in another tab. Reload it before saving.');
            queries.updateConversation.run(title, JSON.stringify(messages), updatedAt, account.user.id, conversationId, data.revision);
          } else {
            if (data.revision !== 0) throw fail(404, 'Conversation not found.');
            if (queries.conversationCount.get(account.user.id).count >= 50) throw fail(409, 'Your account has reached the limit of 50 saved conversations.');
            const inserted = queries.createConversation.run(conversationId, account.user.id, title, JSON.stringify(messages), updatedAt);
            if (!inserted.changes) throw fail(404, 'Conversation not found.');
            created = true;
          }
          db.exec('COMMIT');
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
        json(res, created ? 201 : 200, { conversation });
      } else if (path === '/api/auth/session') {
        const account = getAccount(req);
        json(res, 200, account || { user: null });
      } else if (path === '/api/auth/logout') {
        const account = accountForToken(req);
        const expectedUser = req.headers['x-polypath-user'];
        if (account && expectedUser !== undefined && expectedUser !== account.user.id) {
          throw fail(401, 'Your account has changed. Please refresh your workspace before signing out.');
        }
        const token = sessionToken(req);
        if (token) queries.deleteSession.run(tokenHash(token));
        cookie(req, res, '', 0);
        json(res, 200, { ok: true });
      } else if (path === '/api/profile') {
        const account = requireUser(req, res);
        if (!account) return true;
        const data = await readJson(req);
        const profile = { ...account.profile };
        if (Object.keys(data).some(key => !Object.hasOwn(PROFILE_LIMITS, key))) {
          throw fail(400, 'Only programme, year, semester, graduation and interests can be updated.');
        }
        for (const [key, maxLength] of Object.entries(PROFILE_LIMITS)) {
          if (!Object.hasOwn(data, key)) continue;
          if (typeof data[key] !== 'string' || data[key].length > maxLength) {
            throw fail(400, `${key} must be text no longer than ${maxLength} characters.`);
          }
          profile[key] = data[key].trim();
        }
        if (profile.graduation && !/^\d{4}-(0[1-9]|1[0-2])$/.test(profile.graduation)) {
          throw fail(400, 'Use YYYY-MM for the expected graduation date.');
        }
        if (!requireUser(req, res)) return true;
        queries.profile.run(JSON.stringify(profile), account.user.id);
        json(res, 200, { profile });
      } else {
        // Use the direct peer address; forwarded headers are not trusted.
        rateLimit(`ip:${req.socket.remoteAddress || 'unknown'}`, res);
        const data = await readJson(req);
        const email = emailAddress(data.email);
        const password = passwordValue(data.password);
        rateLimit(`email:${email}`, res);
        if (path === '/api/auth/register') {
          const name = typeof data.name === 'string' ? data.name.trim() : '';
          if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) {
            throw fail(400, 'Enter a name between 1 and 80 characters.');
          }
          if (queries.email.get(email)) throw fail(409, 'An account with this email already exists. Please sign in.');
          const passwordHash = await hashPassword(password);
          const id = randomUUID();
          // Recheck after asynchronous hashing to handle simultaneous registrations.
          if (queries.email.get(email)) throw fail(409, 'An account with this email already exists. Please sign in.');
          queries.createUser.run(id, name, email, passwordHash, JSON.stringify(EMPTY_PROFILE), now());
          createSession(req, res, id);
          json(res, 201, { user: { id, name, email }, profile: { ...EMPTY_PROFILE } });
        } else {
          if (data.remember !== undefined && typeof data.remember !== 'boolean') {
            throw fail(400, 'Remember me must be true or false.');
          }
          const row = queries.email.get(email);
          const verified = await verifyPassword(password, row?.password_hash);
          if (!row || !verified) throw fail(401, 'The email or password is incorrect.');
          createSession(req, res, row.id, data.remember === true);
          json(res, 200, publicAccount(row));
        }
      }
    } catch (error) {
      if (!res.writableEnded) json(res, error.status || 500, { error: error.status ? error.message : 'Something went wrong. Please try again.' });
    }
    return true;
  }

  return { handle, getAccount, requireUser, checkSameOrigin, ensureTestAccount, close: () => db.close() };
}
