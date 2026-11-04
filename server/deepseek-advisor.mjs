import { readFileSync } from 'node:fs';
import { extractDocuments, cleanText, DOCUMENT_LIMITS } from './documents.mjs';
import { retrieveKnowledge, answerFromKnowledge, getKnowledgeCount } from './knowledge.mjs';

const SYSTEM_PROMPT = readFileSync(new URL('../prompts/advisor-system.txt', import.meta.url), 'utf8');
const DEFAULT_MODEL = 'deepseek-flash';
const HISTORY_LIMIT = 12;
const PROFILE_FIELDS = ['programme', 'year', 'semester', 'graduation', 'interests'];

export function getAdvisorStatus(env = process.env) {
  return {
    mode: env.DEEPSEEK_API_KEY?.trim() ? 'llm' : 'knowledge',
    ...(env.DEEPSEEK_API_KEY?.trim() ? { model: env.DEEPSEEK_MODEL?.trim() || DEFAULT_MODEL } : {}),
    knowledgeCount: getKnowledgeCount()
  };
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

const fail = (status, message) => Object.assign(new Error(message), { status });
const string = (value, max = 1000) => typeof value === 'string' ? cleanText(value).slice(0, max) : '';
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const stringArray = (value, count = 8, max = 600) => Array.isArray(value)
  ? value.filter(item => typeof item === 'string').map(item => string(item, max)).filter(Boolean).slice(0, count) : [];

function historyMessages(history) {
  return (Array.isArray(history) ? history : []).filter(item => record(item) && ['user', 'assistant'].includes(item.role) && typeof item.text === 'string')
    .slice(-HISTORY_LIMIT).map(item => ({
      role: item.role, text: string(item.text, 3000),
      courses: (Array.isArray(item.courses) ? item.courses : []).filter(course => record(course) && typeof course.code === 'string' && /^[A-Z]{2,6}\s?\d{3,5}[A-Z]?$/i.test(course.code))
        .slice(0, 6).map(course => ({ code: course.code.replace(/\s/g, '').toUpperCase() }))
    })).filter(item => item.text);
}

function readRequestBody(req) {
  if (Number(req.headers['content-length']) > DOCUMENT_LIMITS.requestBytes) {
    req.resume();
    return Promise.reject(fail(413, 'The message and files exceed the 25 MiB request limit.'));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const cleanup = () => {
      clearTimeout(timer);
      req.off('data', onData); req.off('end', onEnd); req.off('error', onError); req.off('aborted', onAbort);
    };
    const stop = error => { cleanup(); req.resume(); reject(error); };
    const onData = chunk => {
      size += chunk.length;
      if (size > DOCUMENT_LIMITS.requestBytes) return stop(fail(413, 'The message and files exceed the 25 MiB request limit.'));
      chunks.push(chunk);
    };
    const onEnd = () => { cleanup(); resolve(Buffer.concat(chunks)); };
    const onError = () => stop(fail(400, 'The message could not be read.'));
    const onAbort = () => stop(fail(400, 'The message was interrupted.'));
    const timer = setTimeout(() => stop(fail(408, 'The upload timed out. Please try again.')), 30_000);
    timer.unref();
    req.on('data', onData); req.on('end', onEnd); req.on('error', onError); req.on('aborted', onAbort);
  });
}

function parseField(value, fallback) {
  if (value === null || value === '') return fallback;
  try { return JSON.parse(value); } catch { throw fail(400, 'The profile or conversation history is not valid JSON.'); }
}

async function parseInput(req, { guest = false } = {}) {
  const contentType = req.headers['content-type'] || '';
  if (!/^(application\/json|multipart\/form-data)(?:\s*;|$)/i.test(contentType)) {
    req.resume();
    throw fail(415, 'Send JSON or multipart form data.');
  }
  const body = await readRequestBody(req);
  let data;
  let files = [];
  let hasFileParts = false;
  if (/^multipart\/form-data/i.test(contentType)) {
    let form;
    try {
      form = await new Request('http://localhost/api/advisor', { method: 'POST', headers: { 'content-type': contentType }, body }).formData();
    } catch { throw fail(400, 'The uploaded form could not be read.'); }
    hasFileParts = [...form.values()].some(value => typeof value !== 'string');
    if (guest && hasFileParts) throw fail(403, 'Sign in to upload documents. Guest access supports text questions only.');
    data = { message: form.get('message'), history: parseField(form.get('history'), []), profile: parseField(form.get('profile'), {}) };
    files = ['documents', 'attachments'].flatMap(field => form.getAll(field)
      .filter(file => typeof file !== 'string').map(file => ({ file, category: field === 'documents' ? 'Reference document' : 'Message attachment' })));
  } else {
    try { data = JSON.parse(body.toString('utf8')); } catch { throw fail(400, 'Send a valid JSON object.'); }
  }
  if (!record(data)) throw fail(400, 'Send a valid JSON object.');
  if (typeof data.message !== 'string' || !data.message.trim()) throw fail(400, 'A question is required.');
  if (data.message.length > 6000) throw fail(400, 'Keep your question under 6,000 characters.');
  if (guest) {
    const hasProfile = data.profile !== undefined && data.profile !== null &&
      (record(data.profile) ? Object.values(data.profile).some(value => value !== '' && value !== null && value !== undefined) : data.profile !== '');
    const hasFiles = hasFileParts || ['documents', 'attachments', 'files'].some(field =>
      Array.isArray(data[field]) ? data[field].length > 0 : Boolean(data[field]));
    if (hasProfile || hasFiles) throw fail(403, 'Sign in to use an academic profile or upload documents. Guest access supports text questions only.');
  }
  const profile = {};
  if (!guest && record(data.profile)) for (const field of PROFILE_FIELDS) profile[field] = string(data.profile[field], 1000);
  const extracted = await extractDocuments(files);
  return { message: cleanText(data.message), history: historyMessages(data.history), profile, ...extracted };
}

function knownSources(sources) {
  return sources.filter(source => record(source) && typeof source.id === 'string' && typeof source.text === 'string').slice(0, 10)
    .map(source => ({ ...source, text: source.text.slice(0, 4000) }));
}

function sourceMetadata(source) {
  let url;
  try {
    const parsed = new URL(source.url);
    if (['http:', 'https:'].includes(parsed.protocol)) url = parsed.href;
  } catch { /* Uploaded documents do not need a URL. */ }
  return {
    id: source.id, title: string(source.title, 240),
    detail: string(source.text, 800), kind: source.kind,
    ...(url ? { url } : {})
  };
}

async function readModelResponse(response) {
  const limit = 1024 * 1024;
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel();
    throw fail(502, 'The AI service returned an oversized response. Please try again.');
  }
  if (!response.body) throw fail(502, 'The AI service returned an empty response. Please try again.');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw fail(502, 'The AI service returned an oversized response. Please try again.');
      }
      chunks.push(Buffer.from(value));
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw fail(502, 'The AI service returned an invalid response. Please try again.'); }
  } finally { reader.releaseLock(); }
}

/** Strictly decode model JSON, filtering all citation metadata through retrieved evidence. */
export function normalizeAdvisorPayload(content, evidence) {
  let data;
  try { data = JSON.parse(content); } catch { throw fail(502, 'The AI service returned an invalid structured answer. Please try again.'); }
  if (!record(data) || typeof data.text !== 'string' || !data.text.trim()) {
    throw fail(502, 'The AI service returned an empty or invalid answer. Please try again.');
  }
  const allowed = new Map(evidence.map(source => [source.id, source]));
  const sourceIds = [...new Set(stringArray(data.sourceIds, 10, 200))].filter(id => allowed.has(id));
  const sourceList = sourceIds.map(id => sourceMetadata(allowed.get(id)));
  const knownCodes = new Set(evidence.flatMap(source => `${source.code || ''} ${source.text}`.match(/\b[A-Z]{2,6}\s?\d{3,5}[A-Z]?\b/gi) || []).map(code => code.replace(/\s/g, '').toUpperCase()));
  const courses = (Array.isArray(data.courses) ? data.courses : []).filter(item => record(item) && typeof item.code === 'string' && typeof item.title === 'string')
    .filter(item => knownCodes.has(item.code.replace(/\s/g, '').toUpperCase())).slice(0, 6).map(item => {
      const code = item.code.replace(/\s/g, '').toUpperCase();
      const courseSource = evidence.find(source => source.kind === 'course' && source.code === code);
      const verifiedCredits = courseSource?.text.match(/\b(\d+(?:\.\d+)?)\s+credits?\b/i);
      const title = courseSource && !courseSource.text.toLowerCase().includes(item.title.toLowerCase())
        ? courseSource.title.replace(/^.*?\s·\s/, '') : item.title;
      return {
        code, title: string(title, 180), tag: string(item.tag, 80),
        reason: string(item.reason, 1200), prerequisite: string(item.prerequisite, 1000),
        ...(verifiedCredits ? { credits: Number(verifiedCredits[1]) } : {})
      };
    });
  const checks = stringArray(data.checks);
  if (evidence.length && !sourceList.length) checks.push('The AI did not supply verifiable citations. Review the retrieved evidence and confirm details with your programme handbook.');
  return {
    text: string(data.text, 12_000), courses, checks, sources: sourceList,
    followUps: stringArray(data.followUps, 3, 300), evidence, mode: 'llm'
  };
}

async function callModel(input, env, { fetchImpl = fetch, timeoutMs = 30_000 } = {}) {
  const evidence = knownSources(retrieveKnowledge(input));
  const baseUrl = (env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
  try {
    const url = new URL(baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
  } catch { throw fail(503, 'The AI service endpoint is not configured correctly.'); }
  const payload = {
    model: env.DEEPSEEK_MODEL?.trim() || DEFAULT_MODEL,
    stream: false, thinking: { type: 'disabled' }, max_tokens: 3000,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...input.history.map(item => ({ role: item.role, content: item.text })),
      { role: 'user', content: JSON.stringify({
        question: input.message, student_profile: input.profile,
        retrieved_sources: evidence.map(({ id, title, text, kind, code, version }) => ({ id, title, text, kind, code, version })),
        document_warnings: input.warnings,
        instruction: 'Answer the question using the evidence. Return the required JSON object.'
      }) }
    ]
  };
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(fail(504, 'The AI service timed out. Please try again.'));
    }, timeoutMs);
  });
  const operation = async () => {
    let response;
    try {
      response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST', signal: controller.signal,
        headers: { Authorization: `Bearer ${env.DEEPSEEK_API_KEY.trim()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      if (controller.signal.aborted) throw fail(504, 'The AI service timed out. Please try again.');
      throw fail(502, 'The AI service could not be reached. Please try again.');
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw fail(502, `The AI service rejected the request (HTTP ${response.status}). Check the server configuration or try again later.`);
    }
    const completion = await readModelResponse(response);
    return normalizeAdvisorPayload(completion?.choices?.[0]?.message?.content, evidence);
  };
  try { return await Promise.race([operation(), timeout]); }
  finally { clearTimeout(timer); }
}

export async function handleAdvisorRequest(req, res, env = process.env, options) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return json(res, 405, { error: 'Use POST for this endpoint.' });
    }
    const guest = options?.access === 'guest';
    const input = await parseInput(req, { guest });
    // Uploading and document extraction can outlive a session; recheck immediately
    // before any retrieval or paid model work, without changing a member into a guest.
    if (!guest && options?.revalidateMember && !options.revalidateMember()) return;
    const answer = !guest && env.DEEPSEEK_API_KEY?.trim()
      ? await callModel(input, env, options)
      : answerFromKnowledge(input);
    json(res, 200, {
      ...answer,
      ...(options?.access ? { access: options.access } : {}),
      ...(guest ? { guestRemaining: options.guestRemaining } : {}),
      checks: [...(Array.isArray(answer.checks) ? answer.checks : []), ...input.warnings],
      warnings: input.warnings,
      documents: input.documents.map(document => ({ name: document.name, characters: document.text.length }))
    });
  } catch (error) {
    json(res, error.status || 500, { error: error.status ? error.message : 'The advisor could not process this message. Please try again.' });
  }
}
