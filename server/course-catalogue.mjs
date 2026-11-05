import { inferTopics, setRemoteCourses } from './knowledge.mjs';

const SUBJECT_CODE = /\b[A-Z]{2,6}[0-9][A-Z0-9]{2,5}\b/g;
const SPACED_CODE = /\b([A-Z]{2,6})\s+([0-9][A-Z0-9]{2,5})\b/g;
const PAGE_SIZE = 1000;
const MAX_ROWS = 8000;
const COURSE_COLUMNS = 'id,code,name,department,faculty,credits,level,description,objectives,prerequisites,teaching_pattern,semester_offered';

function jwtRole(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) return null;
  try { return JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString('utf8')).role; } catch { return null; }
}

function isPublicKey(key) {
  return /^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(key) || jwtRole(key) === 'anon';
}

export function subjectCodesIn(value) {
  const text = String(value || '').toUpperCase().replace(/[:/,;|]+/g, ' ');
  const compact = text.match(SUBJECT_CODE) || [];
  const spaced = [...text.matchAll(SPACED_CODE)].map(([, prefix, rest]) => prefix + rest);
  return [...new Set([...compact, ...spaced])];
}

function clip(value, limit = 600) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

/** Publishable/anon key only. Never accepts a service-role or user JWT. */
export function readSupabaseConfig(env = process.env) {
  const rawUrl = typeof env.SUPABASE_URL === 'string' ? env.SUPABASE_URL.trim() : '';
  const key = String(env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || '').trim();
  if (!rawUrl || !key || !isPublicKey(key)) return null;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || !['', '/'].includes(parsed.pathname)) return null;
    return { url: parsed.origin, key };
  } catch {
    return null;
  }
}

export function mapCatalogueRow(row, { verifiedAt = new Date().toISOString().slice(0, 10), topicFn = inferTopics } = {}) {
  if (!row || typeof row !== 'object') return null;
  const codes = subjectCodesIn(row.code);
  if (!codes.length) return null;
  const [code, ...aliasCodes] = codes;
  const title = clip(row.name || code, 180) || code;
  const summary = clip(row.description) || clip(row.objectives) || title;
  const prerequisite = clip(row.prerequisites, 400);
  const department = clip(row.department, 80);
  const faculty = clip(row.faculty, 80);
  const creditsNumber = Number(row.credits);
  const levelNumber = Number(row.level);
  const aliases = [...new Set([title, department, faculty, ...aliasCodes, clip(row.semester_offered, 80)].filter(Boolean))];
  return {
    id: `supabase-${code}`,
    kind: 'course',
    code,
    aliasCodes,
    title,
    titleZh: title,
    ...(Number.isFinite(creditsNumber) ? { credits: creditsNumber } : {}),
    ...(Number.isFinite(levelNumber) ? { level: levelNumber } : {}),
    summary,
    summaryZh: summary,
    prerequisite: prerequisite || 'Not stated in the catalogue record.',
    prerequisiteZh: prerequisite || '课程目录未写明先修要求。',
    prerequisiteAny: subjectCodesIn(row.prerequisites),
    topics: topicFn(`${title} ${summary} ${department} ${faculty}`),
    aliases,
    department,
    faculty,
    version: 'PolyU catalogue',
    verifiedAt,
    source: 'supabase'
  };
}

function catalogueHeaders(key, extra = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json', ...extra };
}

async function readJson(response) {
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(`Supabase catalogue request failed (HTTP ${response.status}).`);
    error.status = response.status;
    throw error;
  }
  if (!Array.isArray(data)) throw new Error('Supabase catalogue response was not a row list.');
  return data;
}

/** Read-only GET of public.courses. Does not write, migrate, or use a user JWT. */
export async function fetchPublicCourses(env = process.env, { fetchImpl = fetch, signal, pageSize = PAGE_SIZE } = {}) {
  const config = readSupabaseConfig(env);
  if (!config) return [];
  const size = Number.isInteger(pageSize) && pageSize > 0 && pageSize <= PAGE_SIZE ? pageSize : PAGE_SIZE;
  const rows = [];
  for (let offset = 0; offset < MAX_ROWS; offset += size) {
    const query = new URLSearchParams({ select: COURSE_COLUMNS, order: 'code.asc', limit: String(size), offset: String(offset) });
    const response = await fetchImpl(`${config.url}/rest/v1/courses?${query}`, {
      method: 'GET',
      headers: catalogueHeaders(config.key),
      signal,
      redirect: 'error',
      cache: 'no-store'
    });
    const page = await readJson(response);
    rows.push(...page);
    if (page.length < size) break;
  }
  return rows;
}

export async function probeCatalogue(env = process.env, { fetchImpl = fetch, signal } = {}) {
  const config = readSupabaseConfig(env);
  if (!config) return { ok: false, count: 0, reason: 'not_configured' };
  try {
    const response = await fetchImpl(`${config.url}/rest/v1/courses?select=code&limit=1`, {
      method: 'GET',
      headers: catalogueHeaders(config.key, { Prefer: 'count=exact', Range: '0-0' }),
      signal,
      redirect: 'error',
      cache: 'no-store'
    });
    if (!response.ok) {
      await response.body?.cancel?.();
      return { ok: false, count: 0, reason: 'rejected' };
    }
    await response.body?.cancel?.();
    const count = Number((response.headers.get('content-range') || '').match(/\/(\d+)\s*$/)?.[1]);
    return { ok: true, count: Number.isFinite(count) ? count : 0 };
  } catch {
    return { ok: false, count: 0, reason: 'unreachable' };
  }
}

export function mapCatalogueRows(rows, options) {
  const seen = new Set();
  const mapped = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const entry = mapCatalogueRow(row, options);
    if (!entry || seen.has(entry.code)) continue;
    seen.add(entry.code);
    mapped.push(entry);
  }
  return mapped;
}

/** Fetch once at process start. Failures leave the curated local set unchanged. */
export async function startCatalogueRefresh(env = process.env, options = {}) {
  if (!readSupabaseConfig(env)) return [];
  const log = options.logger === false ? { info() {}, warn() {} } : options.logger || console;
  try {
    const rows = await fetchPublicCourses(env, options);
    const courses = mapCatalogueRows(rows, { verifiedAt: new Date().toISOString().slice(0, 10) });
    setRemoteCourses(courses);
    log.info?.(`[catalogue] Loaded ${courses.length} read-only Supabase courses.`);
    return courses;
  } catch (error) {
    log.warn?.(`[catalogue] ${error.message || error}. Advisor will use the curated local reference set.`);
    return [];
  }
}
