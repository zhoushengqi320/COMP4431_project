import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SNAPSHOT = join(dirname(fileURLToPath(import.meta.url)), '../data/courses.json');
const SELECT = 'code,name,department,faculty,credits,level,description,objectives,prerequisites,semester_offered,teaching_pattern,school_id';
const PAGE = 1000;
const TTL_MS = 30 * 60 * 1000;
const SYNONYMS = [
  ['machine learning', '机器学习', 'ml'],
  ['artificial intelligence', '人工智能', 'ai'],
  ['data science', '数据科学', 'data analytics', '数据分析'],
  ['programming', '编程', '程序设计'],
  ['software engineering', '软件工程'],
  ['database', '数据库'],
  ['network', '网络'],
  ['cybersecurity', 'security', '网络安全'],
  ['computer', 'computing', '计算机', '计算']
];

let cache = { at: 0, courses: null };

function snapshotCourses() {
  const data = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
  return Array.isArray(data.courses) ? data.courses : [];
}

export function extractCourseCodes(text) {
  return [...String(text || '').toUpperCase().matchAll(/\b([A-Z]{2,6})\s*(\d{3,4}[A-Z]?)\b/g)]
    .map(match => `${match[1]}${match[2]}`);
}

function expandQuery(text) {
  const lower = String(text || '').toLowerCase();
  const extra = [];
  for (const group of SYNONYMS) {
    if (group.some(term => lower.includes(term))) extra.push(...group);
  }
  return `${text} ${extra.join(' ')}`;
}

const STOP = new Set(['in', 'of', 'on', 'to', 'for', 'and', 'the', 'or', 'is', 'at', 'an', 'a', 'i', 'my', 'me', 'we', 'you', 'which', 'should', 'consider', 'want', 'focus', 'hons', 'bsc', 'year', 'with', 'from']);

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

function departmentGuess(profile = {}) {
  const hay = `${profile.programme || ''} ${profile.interests || ''}`.toLowerCase();
  if (/comput|programming|software|comp\b/.test(hay)) return 'comp';
  if (/\bai\b|artificial|dsai|data scien/.test(hay)) return 'dsai';
  if (/math|统计|statist/.test(hay)) return 'ama';
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

export function retrieveCourses(courses, { message, profile, limit = 18 } = {}) {
  const catalogue = Array.isArray(courses) ? courses : [];
  const queryText = expandQuery(`${message || ''} ${profile?.interests || ''} ${profile?.programme || ''}`);
  const queryTokens = [...new Set(tokens(queryText))].slice(0, 40);
  const codes = extractCourseCodes(`${message || ''} ${profile?.programme || ''}`);
  const department = departmentGuess(profile);
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

function clip(text, limit) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}…`;
}

export function formatCatalogue(courses) {
  if (!courses.length) return 'No matching courses were retrieved from the PolyU catalogue for this question.';
  return courses.map(course => [
    `${course.code} | ${course.name} | ${course.credits ?? '?'} credits | ${course.faculty || ''} | dept ${course.department || ''} | level ${course.level || ''}`,
    course.prerequisites ? `Prerequisites: ${clip(course.prerequisites, 280)}` : '',
    course.objectives ? `Objectives: ${clip(course.objectives, 280)}` : '',
    course.description ? `Description: ${clip(course.description, 360)}` : '',
    course.semester_offered ? `Offered: ${course.semester_offered}` : ''
  ].filter(Boolean).join('\n')).join('\n\n');
}

export async function fetchCoursesFromSupabase(env) {
  const base = env.SUPABASE_URL?.replace(/\/$/, '');
  const key = env.SUPABASE_ANON_KEY?.trim();
  if (!base || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const all = [];
  let from = 0;
  while (true) {
    const response = await fetch(`${base}/rest/v1/courses?select=${SELECT}&order=code.asc&offset=${from}&limit=${PAGE}`, { headers });
    if (!response.ok) throw new Error(`Supabase courses fetch failed (${response.status})`);
    const rows = await response.json();
    if (!Array.isArray(rows) || !rows.length) break;
    all.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export async function getCourses(env = {}) {
  if (cache.courses && Date.now() - cache.at < TTL_MS) return cache.courses;
  try {
    if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
      const courses = await fetchCoursesFromSupabase(env);
      cache = { at: Date.now(), courses };
      return courses;
    }
  } catch (error) {
    console.warn('Live Supabase catalogue unavailable, using snapshot:', error.message);
  }
  const courses = snapshotCourses();
  cache = { at: Date.now(), courses };
  return courses;
}

export function startCourseRefresh(env) {
  getCourses(env).catch(() => {});
}
