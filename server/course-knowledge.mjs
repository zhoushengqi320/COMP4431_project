import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractCourseCodes, courseCodeAliases } from './course-codes.mjs';
export { extractCourseCodes } from './course-codes.mjs';

const SNAPSHOT = join(dirname(fileURLToPath(import.meta.url)), '../data/courses.json');
// Optional id/rating columns must survive when present; do not require absent columns.
const SELECT = '*';
const PUBLIC_FIELDS = ['code', 'name', 'department', 'faculty', 'credits', 'level', 'description', 'objectives', 'prerequisites', 'semester_offered', 'teaching_pattern', 'school_id', 'id', 'rating'];
const PAGE = 1000;
const TTL_MS = 30 * 60 * 1000;
const SYNONYMS = [
  ['finance', 'financial', '金融', '投资', 'investment'],
  ['statistics', 'statistical', '统计', 'probability', '概率'],
  ['mathematics', '数学', 'calculus', '微积分', 'linear algebra', '线性代数'],
  ['optimization', 'optimisation', '优化'],
  ['data structures', '数据结构', 'algorithms', '算法'],
  ['machine learning', '机器学习', 'ml'],
  ['artificial intelligence', '人工智能', 'ai'],
  ['data science', '数据科学', 'data analytics', '数据分析'],
  ['programming', '编程', '程序设计'],
  ['software engineering', '软件工程'],
  ['database', '数据库'],
  ['network', '网络'],
  ['cybersecurity', 'security', '网络安全'],
  ['computer', 'computing', '计算机', '计算'],
  ['chemistry', 'chemical', 'chem', '化学'],
  ['physics', 'physical', '物理'],
  ['biology', 'biological', '生物'],
  ['history', 'historical', '历史', '歷史'],
  ['economics', 'economic', '经济', '經濟'],
  ['accounting', 'accountancy', '会计', '會計'],
  ['psychology', '心理'],
  ['geography', '地理'],
  ['engineering', '工程'],
  ['business', '管理', '商科', '商业', '商業']
];

let cache = { at: 0, courses: null, live: false };

function supabaseCredentials(env = {}) {
  const url = env.SUPABASE_URL?.replace(/\/$/, '');
  const key = env.SUPABASE_ANON_KEY?.trim() || env.SUPABASE_PUBLISHABLE_KEY?.trim();
  return url && key ? { url, key } : null;
}

export function resetCourseCache() {
  cache = { at: 0, courses: null, live: false };
}

function snapshotCourses() {
  const data = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
  return Array.isArray(data.courses) ? data.courses : [];
}

function expandQuery(text) {
  const lower = String(text || '').toLowerCase();
  const extra = [];
  for (const group of SYNONYMS) {
    if (group.some(term => lower.includes(term))) extra.push(...group);
  }
  return `${text} ${extra.join(' ')}`;
}

const STOP = new Set(['in', 'of', 'on', 'to', 'for', 'and', 'the', 'or', 'is', 'at', 'an', 'a', 'i', 'my', 'me', 'we', 'you', 'which', 'should', 'consider', 'want', 'focus', 'hons', 'bsc', 'year', 'with', 'from', '给我', '我想', '请', '推荐', '介绍', '一下', '一些', '什么', '哪些', '有关', '相关', '课程']);

function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(token => {
      if (STOP.has(token)) return false;
      if (/^[a-z0-9]+$/.test(token)) return token.length > 2;
      return token.length > 1;
    });
}

function containsToken(hay, token) {
  if (!token) return false;
  if (/^\d+$/.test(token)) return hay.includes(token);
  if (/^[\p{Script=Han}]+$/u.test(token)) return hay.includes(token);
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(hay);
}

function departmentGuess(text = '') {
  const hay = String(text || '').toLowerCase();
  if (/comput|programming|software|comp\b/.test(hay)) return 'comp';
  if (/\bai\b|artificial|dsai|data scien/.test(hay)) return 'dsai';
  if (/math|统计|statist/.test(hay)) return 'ama';
  if (/chem|化学/.test(hay)) return 'abct';
  return '';
}

export function scoreCourse(course, { queryText, queryTokens, codes, department }) {
  const code = String(course.code || '').toUpperCase().replace(/\s+/g, '');
  const name = String(course.name || '').toLowerCase();
  const dept = String(course.department || '').toLowerCase();
  const hay = [course.code, course.name, course.department, course.faculty, course.description, course.objectives, course.prerequisites]
    .join('\n')
    .toLowerCase();
  let score = 0;
  for (const wanted of codes) {
    if (code.includes(wanted) || wanted.includes(code.replace(/:.*$/, ''))) score += 80;
  }
  for (const token of queryTokens) {
    if (code.includes(token.toUpperCase())) score += 10;
    if (containsToken(name, token)) score += 8;
    if (dept === token) score += 14;
    else if (containsToken(hay, token)) score += 2;
  }
  if (department && dept === department) score += 9;
  if (queryText && name && queryText.toLowerCase().includes(name) && name.length > 8) score += 20;
  return score;
}

export function hasNoPrerequisite(course) {
  const raw = String(course?.prerequisites ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return true;
  if (/not stated|未提供|unknown/i.test(raw) && !/^(无|無)/.test(raw)) return false;
  return /^(none|nil|n\/?a|no(\s+formal)?(\s+prerequisites?)?)(\b|[。．.\s（(，,]|$)/i.test(raw)
    || /^(无|無)(?!机)/.test(raw);
}

export function retrieveCourses(courses, { message, profile, limit = 18, excludeCodes = [] } = {}) {
  const excluded = new Set(excludeCodes.flatMap(courseCodeAliases));
  const catalogue = (Array.isArray(courses) ? courses : []).filter(course => !courseCodeAliases(course.code).some(code => excluded.has(code)));
  const queryText = expandQuery(`${message || ''} ${profile?.interests || ''} ${profile?.programme || ''}`);
  const queryTokens = [...new Set(tokens(queryText))].slice(0, 40);
  const codes = extractCourseCodes(`${message || ''} ${profile?.programme || ''}`);
  const department = departmentGuess(queryText);
  const ranked = catalogue
    .map(course => ({ course, score: scoreCourse(course, { queryText, queryTokens, codes, department }) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);
  let hits = ranked.slice(0, limit).map(item => item.course);
  if (!hits.length && department) {
    hits = catalogue.filter(course => String(course.department || '').toLowerCase() === department).slice(0, Math.min(12, limit));
  }
  return hits;
}

export function searchCourses(courses, plan = {}, { limit = 18, excludeCodes = [] } = {}) {
  if (!plan || typeof plan !== 'object') return [];
  const excluded = new Set(excludeCodes.flatMap(courseCodeAliases));
  let pool = (Array.isArray(courses) ? courses : []).filter(course => !courseCodeAliases(course.code).some(code => excluded.has(code)));
  if (plan.noPrerequisite) pool = pool.filter(hasNoPrerequisite);
  const codes = (Array.isArray(plan.courseCodes) ? plan.courseCodes : []).flatMap(value => extractCourseCodes(String(value)));
  const keywords = (Array.isArray(plan.keywords) ? plan.keywords : []).filter(value => typeof value === 'string' && value.trim());
  const queryText = keywords.join(' ');
  const queryTokens = [...new Set(tokens(queryText))].slice(0, 40);
  const department = String(plan.department || '').trim().toLowerCase();
  if (codes.length) {
    const wanted = new Set(codes.flatMap(courseCodeAliases));
    const exact = pool.filter(course => courseCodeAliases(course.code).some(code => wanted.has(code)));
    if (exact.length) return exact.slice(0, limit);
  }
  const ranked = pool
    .map(course => ({ course, score: scoreCourse(course, { queryText, queryTokens, codes, department }) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);
  let hits = ranked.slice(0, limit).map(item => item.course);
  if (!hits.length && department) {
    hits = pool.filter(course => String(course.department || '').toLowerCase() === department).slice(0, limit);
  }
  if (!hits.length && plan.noPrerequisite) {
    hits = [...pool].sort((a, b) => Number(a.level) - Number(b.level) || String(a.code).localeCompare(String(b.code))).slice(0, limit);
  }
  return hits;
}

function clip(text, limit) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}…`;
}

export function formatCatalogue(courses) {
  if (!courses.length) return 'No matching courses were retrieved from the PolyU catalogue for this question.';
  return courses.map(course => [
    `${course.code} | ${course.name} | ${course.credits ?? '?'} credits | ${course.faculty || ''} | dept ${course.department || ''} | level ${course.level || ''}`,
    course.prerequisites ? `Prerequisites (preserve AND/OR and required/recommended labels): ${course.prerequisites}` : '',
    course.objectives ? `Objectives: ${course.objectives}` : '',
    course.description ? `Description: ${clip(course.description, 2200)}` : '',
    course.teaching_pattern ? `Teaching: ${clip(course.teaching_pattern, 1000)}` : '',
    course.semester_offered ? `Offered: ${course.semester_offered}` : ''
  ].filter(Boolean).join('\n')).join('\n\n');
}

export async function fetchCoursesFromSupabase(env) {
  const creds = supabaseCredentials(env);
  if (!creds) throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  const headers = { apikey: creds.key, Authorization: `Bearer ${creds.key}` };
  const all = [];
  let from = 0;
  while (true) {
    const response = await fetch(`${creds.url}/rest/v1/courses?select=${SELECT}&order=code.asc&offset=${from}&limit=${PAGE}`, {
      headers,
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`Supabase courses fetch failed (${response.status})`);
    const rows = await response.json();
    if (!Array.isArray(rows) || !rows.length) break;
    all.push(...rows.filter(row => row && typeof row === 'object' && typeof row.code === 'string')
      .map(row => Object.fromEntries(PUBLIC_FIELDS.filter(field => Object.hasOwn(row, field)).map(field => [field, row[field]]))));
    if (all.length > 20000) throw new Error('Catalogue exceeds the supported local snapshot size.');
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export async function getCourses(env = {}) {
  const live = Boolean(supabaseCredentials(env));
  if (cache.courses && Date.now() - cache.at < TTL_MS && cache.live === live) return cache.courses;
  if (live) {
    const courses = await fetchCoursesFromSupabase(env);
    cache = { at: Date.now(), courses, live: true };
    console.info(`[catalogue] Loaded ${courses.length} live Supabase courses.`);
    return courses;
  }
  console.warn('[catalogue] SUPABASE_URL / SUPABASE_ANON_KEY missing; using local snapshot. Set both to answer from the database.');
  const courses = snapshotCourses();
  cache = { at: Date.now(), courses, live: false };
  return courses;
}

export function startCourseRefresh(env) {
  getCourses(env).catch(() => {});
}
