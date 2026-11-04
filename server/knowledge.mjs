import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const corpus = JSON.parse(readFileSync(new URL('../knowledge/courses.json', import.meta.url), 'utf8'));
const entries = corpus.entries;
const byCode = new Map(entries.filter(item => item.code).map(item => [item.code, item]));
export const KNOWLEDGE_COUNT = entries.length;

let remoteCourses = [];
let remoteByCode = new Map();

/** Extra catalogue courses. Curated local entries keep priority on the same code. */
export function setRemoteCourses(list = []) {
  const next = [];
  const map = new Map();
  for (const course of Array.isArray(list) ? list : []) {
    if (!course || course.kind !== 'course' || typeof course.code !== 'string') continue;
    const code = course.code.replace(/\s+/g, '').toUpperCase();
    if (byCode.has(code) || map.has(code)) continue;
    const entry = { ...course, code };
    next.push(entry);
    map.set(code, entry);
    for (const alias of course.aliasCodes || []) {
      const extra = String(alias || '').replace(/\s+/g, '').toUpperCase();
      if (extra && !byCode.has(extra) && !map.has(extra)) map.set(extra, entry);
    }
  }
  remoteCourses = next;
  remoteByCode = map;
}

export function findCourse(code) {
  const key = String(code || '').replace(/\s+/g, '').toUpperCase();
  return byCode.get(key) || remoteByCode.get(key);
}

export function hasNoPrerequisite(course) {
  if (!course || course.kind !== 'course') return false;
  if ((course.prerequisiteAny || []).length) return false;
  const text = String(course.prerequisite || '').trim();
  const textZh = String(course.prerequisiteZh || '').trim();
  const combined = `${text} ${textZh}`;
  if (!text && !textZh) return false;
  if (/not stated in the catalogue|课程目录未写明/i.test(combined)) return false;
  if (/no formal pre-?req|lists no formal prerequisite/i.test(combined)) return true;
  if (/无先修|無先修|没有先修|沒有先修|无须先修|無需先修|不需要先修/i.test(combined)) return true;
  if (/先修\/合修\/排除课程\s*n\/a/i.test(combined)) return true;
  if (/^(?:无|無|nil|none|n\/a|n\.a\.?)(?:\s|[。.\[]|$)/i.test(text)) return true;
  return false;
}

export function getKnowledgeCount() { return entries.length + remoteCourses.length; }
export function inferTopics(value) { return topicsIn(value); }

const topicRules = [
  ['machine_learning', /\b(?:machine learning|ml|deep learning|neural networks?|regression|clustering)\b|机器学习|機器學習|深度学习|深度學習|神经网络|神經網絡|回归|聚类/iu],
  ['artificial_intelligence', /\b(?:artificial intelligence|ai|intelligent agents?|reasoning)\b|人工智能|人工智慧|智能体|智能體/iu],
  ['vision', /\b(?:computer vision|images?|object detection|cnn|image segmentation)\b|计算机视觉|電腦視覺|计算机視覺|图像|圖像/iu],
  ['database', /\b(?:databases?|sql|dbms|normalisation|normalization|transactions?)\b|数据库|資料庫/iu],
  ['web', /\b(?:web|website|frontend|front.end|backend|back.end|full.stack|react|javascript|typescript)\b|网页|網頁|网站|網站|前端|后端|後端|全栈|全端/iu],
  ['oop', /\b(?:oop|object.oriented|java|inheritance|polymorphism)\b|面向对象|面向對象|物件導向/iu],
  ['software', /\bsoftware(?: development| engineering)?\b|软件开发|軟件開發|软件工程/iu],
  ['data_structures', /\b(?:data structures?|hashing|linked lists?|binary trees?)\b|数据结构|資料結構/iu],
  ['algorithms', /\b(?:algorithms?|dynamic programming|complexity|sorting)\b|算法|演算法|动态规划|動態規劃|排序/iu],
  ['chemistry', /\bchem(?:istry|ical)?\b|化学|化學|化工/iu],
  ['physics', /\bphysics\b|物理/iu],
  ['biology', /\bbiolog(?:y|ical)\b|生物/iu],
  ['mathematics', /\b(?:mathematics|maths?|calculus|algebra|statistics)\b|数学|數學|微积分|微積分|统计|統計/iu],
  ['graduation', /\b(?:graduat\w*|degree|major|remaining credits?|credits? left)\b|毕业|畢業|主修|剩余学分|剩餘學分/iu],
  ['wie', /\b(?:wie|internship|work.integrated|working hours)\b|实习|實習|工作综合|工作綜合/iu],
  ['planning', /\b(?:plan\w*|semesters?|timetable|offerings?|schedule|enrol\w*|pathway)\b|学期|學期|规划|規劃|计划|計劃|开课|開課|排课|选课|選課/iu],
];
const stopWords = new Set('a an and are as at be been but by can could do does for from give have help how i in into is it its me my of on or our please should so some tell that the their them there these they this to us want what when where which who will with would you your course courses subject subjects study studying interested recommend recommendations about learn learning'.split(' '));
const queryFiller = /推荐|推薦|一下|什么|什麼|哪些|有没有|有沒有|相关|相關|课程|課程|[课課]|please|recommend(?:ations?)?|courses?|subjects?|about|some|any/gi;
const subjectGroups = [
  ['history', 'historical', '历史', '歷史', '史学', '史學'],
  ['chemistry', 'chemical', '化学', '化學', '化工'],
  ['physics', '物理'],
  ['biology', 'biological', '生物'],
  ['mathematics', 'math', 'maths', 'calculus', 'algebra', 'statistics', '数学', '數學', '微积分', '微積分', '统计', '統計'],
  ['literature', 'literary', '文学', '文學'],
  ['philosophy', 'philosophical', '哲学', '哲學'],
  ['economics', 'economic', 'economy', '经济', '經濟'],
  ['finance', 'financial', '金融'],
  ['accounting', 'accountancy', '会计', '會計'],
  ['management', '管理'],
  ['psychology', 'psychological', '心理'],
  ['sociology', 'social', '社会', '社會'],
  ['law', 'legal', '法律'],
  ['engineering', '工程'],
  ['nursing', '护理', '護理'],
  ['design', '设计', '設計'],
  ['music', '音乐', '音樂'],
  ['art', 'arts', '艺术', '藝術'],
  ['geography', 'geographic', '地理'],
  ['politics', 'political', '政治'],
  ['language', 'linguistics', '语言', '語言', '英语', '英語', '中文'],
];
const subjectAlias = new Map(subjectGroups.flatMap(group => group.map(word => [word, group])));
// Compact unknown codes remain recognisable; spaced forms need a real subject prefix
// so ordinary phrases such as "the 2022 World Cup" are not mistaken for codes.
const CODE = /\b(?:[A-Z]{2,6}[0-9][A-Z0-9]{2,5}|(?:COMP|DSAI|EIE|ENG|AMA|AF|AP|CBS|ELC|MM|ABCT|BME|CEE|CSE|EE|FSN|HTM|IC|ISE|LSGI|ME|SN|SO|SD|RS|ENGL|CHC|APSS)\s+\d{3,5}[A-Z]?)\b/gi;
const prerequisiteQuestion = /pre.?req|eligib|can i (?:take|enrol)|can i register|before (?:taking|studying)|先修|前置|选课资格|選課資格|可以选|可以修|能选|能修/i;
const noPrerequisiteRequest = /没有先修|沒有先修|无先修|無先修|零先修|不需要先修|无须先修|無需先修|\bno pre-?req|\bwithout (?:any )?pre-?req|\bno (?:formal )?prerequisite|\bprerequisites?\s+(?:not required|free)\b/i;
const documentQuestion = /\b(?:document|file|transcript|upload|attach|handbook|notes?)\w*\b|according to my|文档|文件|附件|成绩单|成績單|手册|手冊|笔记|筆記/i;
const followupQuestion = /\b(?:it|its|that|those|them|both|first|second|latter|former|what about|and the|prerequisites?|credits?)\b|这个|這個|它|这门|這門|那门|那門|两门|兩門|这些|這些|先修|学分|學分/i;
const academicQuestion = /\b(?:course|subject|academ\w*|student|stud\w*|universit\w*|polyu|polytechnic|computing|learn\w*|program\w*|credit\w*|electiv\w*|requir\w*|pre.?req\w*|eligib\w*|advisor|recommend\w*|direction|progress|documents?|files?|transcript)\b|课程|課程|[课課]|学业|學業|学习|學習|大学|大學|理大|专业|專業|学分|學分|先修|推荐|推薦|文件|文档|成绩|成績|方向/i;
const greeting = /^(?:hi|hello|hey|thanks?|thank you|你好|您好|谢谢|謝謝)[!.。！\s]*$/i;

function codesIn(value) {
  return [...new Set(Array.from(String(value || '').matchAll(CODE), match => match[0].replace(/\s+/g, '').toUpperCase()))];
}
function topicsIn(value) { return topicRules.filter(([, rule]) => rule.test(value)).map(([topic]) => topic); }
function clean(value, limit = 16000) { return String(value || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, limit).trim(); }

function interestTerms(value) {
  const remainder = String(value || '').replace(CODE, ' ').replace(queryFiller, ' ');
  const terms = new Set([
    ...(remainder.toLowerCase().match(/[a-z]{3,}/g) || []).filter(term => !stopWords.has(term)),
    ...(remainder.match(/[\u3400-\u9fff]{2,}/g) || [])
  ]);
  for (const term of [...terms]) for (const alias of subjectAlias.get(term) || []) terms.add(alias);
  return [...terms];
}

function textHasTerm(value, term) {
  const text = String(value || '');
  if (/[\u3400-\u9fff]/.test(term)) return text.includes(term);
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(term.length <= 3 ? `\\b${escaped}\\b` : escaped, 'i').test(text);
}

function recentContext(history) {
  for (const item of [...history].slice(-12).reverse()) {
    if (!item || !['user', 'assistant'].includes(item.role)) continue;
    const structured = Array.isArray(item.courses) ? item.courses.map(course => course?.code).filter(code => typeof code === 'string') : [];
    if (structured.length) return { codes: structured.map(code => code.toUpperCase()), text: String(item.text || '') };
    // User questions establish the referent; prerequisite codes in generated prose do not.
    if (item.role === 'user') {
      const codes = codesIn(item.text || item.content);
      if (codes.length) return { codes, text: String(item.text || item.content || '') };
      const topics = topicsIn(item.text || item.content || '');
      if (topics.length) return { codes: [], text: String(item.text || item.content || '') };
    }
  }
  return { codes: [], text: '' };
}

function analyse({ message, history = [], profile = {}, documents = [] }) {
  const question = clean(message, 5000);
  const historyList = Array.isArray(history) ? history : [];
  const explicitCodes = codesIn(question);
  let requestedCodes = explicitCodes;
  let topics = topicsIn(question);
  let contextText = '';
  let ambiguous = false;
  const wantsRecommendation = /recommend|interest|direction|match|suggest|推荐|推薦|兴趣|興趣|方向/i.test(question);
  const wantsNoPrerequisite = noPrerequisiteRequest.test(question);
  if (!wantsNoPrerequisite && !explicitCodes.length && !topics.some(topic => !['planning', 'graduation'].includes(topic)) && followupQuestion.test(question)) {
    const context = recentContext(historyList);
    const ordinal = /\b(?:first|former)\b|第一|前者/i.test(question) ? 0 : /\b(?:second|latter)\b|第二|后者|後者/i.test(question) ? 1 : null;
    const singular = /\b(?:it|its|that course|this course)\b|它的|这门|這門|那门|那門/i.test(question);
    if (ordinal !== null && context.codes[ordinal]) requestedCodes = [context.codes[ordinal]];
    else if (singular && context.codes.length > 1) ambiguous = true;
    else requestedCodes = context.codes;
    contextText = context.text;
    if (!requestedCodes.length && !ambiguous) topics = [...new Set([...topics, ...topicsIn(contextText)])];
  }
  if (!requestedCodes.length && !topics.length && wantsRecommendation && profile && typeof profile === 'object') {
    contextText = clean(profile.interests, 1000);
    topics = topicsIn(contextText);
  }
  const latestUser = [...historyList].reverse().find(item => item?.role === 'user');
  const language = /[\u3400-\u9fff]/.test(question) || (!/[a-z]{2,}/i.test(question.replace(CODE, '')) && /[\u3400-\u9fff]/.test(latestUser?.text || '')) ? 'zh' : 'en';
  const docs = Array.isArray(documents) ? documents : [];
  const interests = interestTerms(`${question} ${contextText}`);
  const inDomain = Boolean(requestedCodes.length || explicitCodes.length || topics.length || academicQuestion.test(question) || prerequisiteQuestion.test(question) || documentQuestion.test(question));
  return { question, explicitCodes, requestedCodes, topics, interestTerms: interests, contextText, language, ambiguous, wantsRecommendation, wantsNoPrerequisite, documents: docs, inDomain };
}

function tokens(value) {
  const normalized = String(value).toLowerCase().replace(CODE, match => match.replace(/\s+/g, ''));
  const result = (normalized.match(/[a-z][a-z0-9_]+|\d+/g) || []).filter(token => !stopWords.has(token));
  for (const segment of normalized.match(/[\u3400-\u9fff]+/g) || []) {
    for (let i = 0; i < segment.length - 1; i++) result.push(segment.slice(i, i + 2));
  }
  result.push(...topicsIn(normalized));
  return result;
}

function joinDistinct(left, right, separator = ' / ') {
  const first = String(left || '').trim();
  const second = String(right || '').trim();
  if (!second || first.toLowerCase() === second.toLowerCase()) return first || second;
  return `${first}${separator}${second}`;
}

function officialChunk(entry) {
  const titleZh = entry.titleZh || entry.title || '';
  const summary = entry.summary || '';
  const summaryZh = entry.summaryZh || summary;
  const prerequisite = entry.prerequisite || '';
  const prerequisiteZh = entry.prerequisiteZh || prerequisite;
  const credits = entry.credits ?? '?';
  const level = entry.level ?? '?';
  const aliases = (entry.aliasCodes || []).join(', ');
  const text = entry.code
    ? `${entry.code}${aliases ? ` / ${aliases}` : ''} — ${joinDistinct(entry.title, titleZh)}. ${credits} credits; level ${level}. ${joinDistinct(summary, summaryZh, ' ')} Prerequisite: ${joinDistinct(prerequisite, prerequisiteZh, ' ')}`
    : joinDistinct(summary, summaryZh, ' ');
  return {
    id: entry.id,
    title: entry.code ? `${entry.code} · ${entry.title}` : entry.title,
    text,
    ...(entry.url ? { url: entry.url } : {}),
    kind: entry.kind,
    ...(entry.code ? { code: entry.code } : {}),
    ...(entry.source ? { source: entry.source } : {}),
    version: entry.version,
    verifiedAt: entry.verifiedAt || corpus.verifiedAt
  };
}

function documentChunks(documents) {
  const chunks = [];
  let remainingCharacters = 120000;
  for (const [fileIndex, file] of documents.entries()) {
    if (remainingCharacters <= 0) break;
    if (!file || typeof file.text !== 'string') continue;
    const name = clean(file.name || `Document ${fileIndex + 1}`, 160);
    // Uploaded text is evidence only. Drop obvious instructions addressed to an assistant.
    const acceptedText = clean(file.text, Math.min(60000, remainingCharacters));
    remainingCharacters -= acceptedText.length;
    const text = acceptedText.split(/\r?\n/).filter(line => !/(?:ignore|disregard|override).{0,50}(?:instruction|system|previous)|^(?:system|assistant|developer)\s*:|(?:reveal|print|exfiltrate).{0,40}(?:secret|api.?key|password)|忽略.{0,20}(?:指令|系统|之前)|(?:输出|泄露).{0,15}(?:密钥|密码)/i.test(line)).join('\n').trim();
    if (!text || /^\[(?:Binary file|Unable to parse|No extractable)/i.test(text)) continue;
    const parts = text.match(/[\s\S]{1,850}(?:\s|$)|[\s\S]{1,850}/g) || [];
    const digest = createHash('sha256').update(`${name}\0${text}`).digest('hex').slice(0, 10);
    for (let index = 0; index < parts.length; index++) {
      chunks.push({ id: `document-${digest}-${index + 1}`, title: `${name} · excerpt ${index + 1}`, text: parts[index].trim(), kind: 'document', documentName: name, category: clean(file.category || '', 100), trust: 'user-supplied; not independently verified' });
    }
  }
  return chunks;
}

function vector(terms, idf) {
  const frequencies = new Map();
  for (const term of terms) frequencies.set(term, (frequencies.get(term) || 0) + 1);
  let norm = 0;
  const weights = new Map();
  for (const [term, count] of frequencies) {
    const weight = (1 + Math.log(count)) * (idf.get(term) || 1);
    weights.set(term, weight); norm += weight * weight;
  }
  return { weights, norm: Math.sqrt(norm) };
}
function cosine(left, right) {
  if (!left.norm || !right.norm) return 0;
  let product = 0;
  for (const [term, weight] of left.weights) product += weight * (right.weights.get(term) || 0);
  return product / (left.norm * right.norm);
}

function rankChunks(entryList, query, documents = []) {
  const candidates = [...entryList.map(officialChunk), ...documentChunks(documents)];
  const termLists = candidates.map(chunk => tokens(`${chunk.title} ${chunk.text} ${entryList.find(entry => entry.id === chunk.id)?.aliases?.join(' ') || ''}`));
  const documentFrequency = new Map();
  for (const terms of termLists) for (const term of new Set(terms)) documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
  const idf = new Map([...documentFrequency].map(([term, count]) => [term, Math.log((candidates.length + 1) / (count + 1)) + 1]));
  const queryVector = vector(tokens(`${query.question} ${query.contextText} ${query.requestedCodes.join(' ')} ${query.topics.join(' ')} ${(query.interestTerms || []).join(' ')}`), idf);
  const wantsDocuments = documentQuestion.test(query.question);
  return candidates.map((chunk, index) => {
    const entry = entryList.find(item => item.id === chunk.id);
    let score = cosine(queryVector, vector(termLists[index], idf));
    const matchingCode = query.requestedCodes.some(code => chunk.code === code || entry?.aliasCodes?.includes(code) || (chunk.kind === 'document' && codesIn(chunk.text).includes(code)));
    if (query.requestedCodes.length && !matchingCode) return null;
    if (matchingCode) score += chunk.kind === 'course' ? 8 : 5;
    if (entry) for (const topic of query.topics) if (entry.topics.includes(topic)) score += entry.topics[0] === topic ? 2 : 1;
    const entryText = entry ? `${entry.title || ''} ${entry.titleZh || ''} ${entry.summary || ''} ${entry.summaryZh || ''} ${(entry.aliases || []).join(' ')} ${entry.department || ''}` : `${chunk.title} ${chunk.text}`;
    const keywordHits = (query.interestTerms || []).filter(term => textHasTerm(entryText, term)).length;
    if (keywordHits) score += 1.1 + Math.min(keywordHits, 4) * 0.45;
    if (entry && (query.interestTerms || []).some(term => textHasTerm(`${entry.title || ''} ${entry.titleZh || ''}`, term))) score += 1.2;
    if (query.wantsNoPrerequisite && entry?.kind === 'course') {
      if (!hasNoPrerequisite(entry)) return null;
      score += 2.2;
      const level = Number(entry.level);
      if (level === 1 || /^[A-Z]{2,6}1/.test(entry.code || '')) score += 0.9;
    }
    if (wantsDocuments && chunk.kind === 'document') score += 1.5;
    if (chunk.code === 'COMP4432' && query.topics.includes('machine_learning')) score += .5;
    if (!query.requestedCodes.length && entry?.kind === 'course' && !query.topics.some(topic => entry.topics.includes(topic)) && !keywordHits && score < .13) return null;
    if (!query.requestedCodes.length && entry?.kind === 'policy' && !query.topics.some(topic => entry.topics.includes(topic)) && score < .19) return null;
    if (score < .075) return null;
    return { ...chunk, score: Number(score.toFixed(5)) };
  }).filter(Boolean).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id)).slice(0, 6);
}

/** Deterministic TF-IDF/cosine retrieval plus exact-code and bilingual domain signals. */
export function retrieveKnowledge(input = {}) {
  const query = analyse(input);
  if (!query.inDomain || query.ambiguous) return [];
  const curatedHits = rankChunks(entries, query, query.documents);
  if (!remoteCourses.length) return curatedHits;
  if (query.requestedCodes.length) {
    const missing = query.requestedCodes.filter(code => !byCode.has(code) && remoteByCode.has(code));
    if (!missing.length) return curatedHits;
    const remoteHits = rankChunks(remoteCourses, { ...query, requestedCodes: missing }, []);
    return [...curatedHits, ...remoteHits].sort((left, right) => right.score - left.score || left.id.localeCompare(right.id)).slice(0, 6);
  }
  const merged = [...curatedHits];
  for (const hit of rankChunks(remoteCourses, query, [])) {
    if (merged.length >= 6) break;
    if (!merged.some(item => item.id === hit.id || (hit.code && item.code === hit.code))) merged.push(hit);
  }
  return merged;
}

function sourceFor(chunk, chinese) {
  const catalogue = chunk.source === 'supabase';
  return {
    id: chunk.id, title: chunk.title, kind: chunk.kind, ...(chunk.url ? { url: chunk.url } : {}),
    detail: chunk.kind === 'document'
      ? (chinese ? '上传文件节选；未经独立核实' : 'Uploaded document excerpt; not independently verified')
      : catalogue
        ? (chinese ? 'PolyU 课程目录（Supabase 只读）' : 'PolyU course catalogue (Supabase, read-only)')
        : `${chunk.version} · ${chinese ? '核查日期' : 'Checked'} ${chunk.verifiedAt}`
  };
}

/** Grounded extractive advisor. No external model or secret is needed for this path. */
export function answerFromKnowledge(input = {}) {
  const query = analyse(input);
  const zh = query.language === 'zh';
  const evidence = retrieveKnowledge(input);
  const result = { text: '', mode: 'knowledge', language: query.language, evidence, sources: evidence.map(chunk => sourceFor(chunk, zh)), followUps: [], retrieval: { method: 'tfidf-cosine+domain-signals', knowledgeCount: getKnowledgeCount(), matchedSources: evidence.length } };
  const ask = zh ? ['COMP4431 的先修课程是什么？', '推荐机器学习相关课程', 'WIE 要完成多少小时？'] : ['What are the prerequisites for COMP4431?', 'Recommend courses for machine learning', 'How many hours of WIE are required?'];
  if (!query.inDomain) {
    result.text = greeting.test(query.question)
      ? (zh ? '你好！我可以根据 PolyU Computing 课程资料，帮你查课程内容、先修条件、学分和规划方向，也能检索你上传的学习文件。你想先了解哪门课？' : 'Hello! I can help with PolyU Computing course content, prerequisites, credits and study planning, using official subject references and your uploaded documents. Which course or area would you like to explore?')
      : (zh ? '我的范围是 PolyU Computing 学业规划，当前资料无法回答这个领域之外的问题。可以问我课程、先修条件、学习方向或上传的学习文件。' : 'My reference set covers PolyU Computing academic planning, so I cannot support that question from these sources. Ask about courses, prerequisites, study interests or an academic document.');
    result.followUps = ask; return result;
  }
  if (query.ambiguous) {
    result.text = zh ? '上一轮提到了多门课程。请写出你想继续了解的课程代码，或说明要比较哪两门课。' : 'We discussed more than one course. Please name the course code you mean, or say which two courses you want to compare.';
    return result;
  }
  const courseEntries = evidence.filter(chunk => chunk.kind === 'course').map(chunk => findCourse(chunk.code)).filter(Boolean);
  const uploaded = evidence.filter(chunk => chunk.kind === 'document');
  const missingCodes = query.requestedCodes.filter(code => !findCourse(code));
  const paragraphs = [];
  if (missingCodes.length) paragraphs.push(zh ? `当前已核实课程库没有 ${missingCodes.join('、')} 的课程说明。我不能确认其名称、学分或先修要求；请提供该课程的官方说明。` : `The verified course set does not contain a description for ${missingCodes.join(', ')}. I cannot confirm its title, credits or prerequisites; please provide the official subject description.`);

  const isPrerequisite = !query.wantsNoPrerequisite && prerequisiteQuestion.test(query.question);
  const isPlanning = query.topics.includes('planning');
  const isGraduation = query.topics.includes('graduation');
  const isWie = query.topics.includes('wie');
  const wantsDocuments = documentQuestion.test(query.question);
  const unsupportedDetail = /\b(?:exam|assessment|grading|grade distribution|lecturer|professor|classroom|deadline|tuition|fee|salary|difficulty|easiest|easy|hardest)\b|考试|考試|评分|評分|老师|老師|教授|教室|截止|学费|學費|工资|薪资|难度|難度|容易/i.test(query.question);
  const liveOffering = /\b(?:offered|available|taught|offering|timetable|schedule|which semester|next semester)\b|开设|開設|开课|開課|课表|課表|下学期|下學期/i.test(query.question);

  if (courseEntries.length && (!wantsDocuments || query.requestedCodes.length || !uploaded.length)) {
    if (unsupportedDetail) paragraphs.push(zh ? '当前索引只涵盖课程内容、学分与先修要求，不能据此确认你问到的考核、授课安排或难度等细节。请核对适用学期的课程说明或上传相关文件。' : 'This index covers content, credits and prerequisites; it does not establish assessment, teaching arrangements or difficulty. Check the description for your semester or upload the relevant information.');
    if (liveOffering) paragraphs.push(zh ? '课程目录不能证明下学期的开课情况；当前资料没有实时课表或名额信息。以下是已核实的课程背景，不能视为开课确认。' : 'A directory entry does not confirm next-semester availability. These sources contain no live timetable or seat information; the course facts below are not confirmation of an offering.');
    if (query.wantsNoPrerequisite) paragraphs.push(zh ? '根据课程目录记录，以下课程未列出先修课程。目录没写明的情况不能当成确认没有要求；选课前仍须核对官方说明。' : 'According to the catalogue records below, these subjects do not list a prerequisite. A missing statement is not proof that none exists; confirm the official description before enrolling.');
    else if (isPlanning) paragraphs.push(zh ? '可以先按先修依赖安排学习顺序。下面是课程资料支持的依赖关系，不是已确认的学期课表：' : 'Start with the prerequisite dependencies below. These describe a study order supported by subject documents, not a confirmed semester timetable:');
    else if (!isPrerequisite && !query.requestedCodes.length) paragraphs.push(zh ? '根据你提到的学习方向，以下课程与其内容相符。匹配依据是课程简介，不代表你已符合选课资格。' : 'These subjects match the area you described through their published content. This is a content match, not a determination of your enrolment eligibility.');
    for (const course of courseEntries.slice(0, query.requestedCodes.length || 3)) {
      const title = `${course.code} · ${zh ? (course.titleZh || course.title) : course.title}`;
      paragraphs.push(isPrerequisite ? `${title}：${zh ? course.prerequisiteZh : course.prerequisite}` : `${title} — ${course.credits} ${zh ? '学分' : 'credits'}. ${zh ? course.summaryZh : course.summary}${isPlanning ? ` ${zh ? course.prerequisiteZh : course.prerequisite}` : ''}`);
      if (isPlanning) {
        const knownFoundation = (course.prerequisiteAny || []).map(code => findCourse(code)).find(Boolean);
        if (knownFoundation) {
          paragraphs.push(zh ? `其中 ${knownFoundation.code} 的先修条件为：${knownFoundation.prerequisiteZh} 这只是可行依赖链之一；同等课程仍须由学校认可。` : `For the ${knownFoundation.code} route, its own requirement is: ${knownFoundation.prerequisite} This is one dependency route; equivalence still needs institutional approval.`);
          if (!evidence.some(chunk => chunk.id === knownFoundation.id)) {
            const supporting = { ...officialChunk(knownFoundation), score: 0, relationship: 'prerequisite-context' };
            evidence.push(supporting); result.sources.push(sourceFor(supporting, zh));
          }
        }
      }
    }
    result.courses = courseEntries.slice(0, query.requestedCodes.length || 3).map(course => ({ code: course.code, title: zh ? joinDistinct(course.titleZh || course.title, course.title) : (course.title || course.titleZh), credits: course.credits, tag: zh ? '官方课程资料' : 'Official subject reference', reason: zh ? (course.summaryZh || course.summary) : course.summary, prerequisite: zh ? (course.prerequisiteZh || course.prerequisite) : course.prerequisite }));
    result.checks = [zh ? '先修要求来自课程说明；尚未核实你的通过记录、课程等效认可或排斥条件。' : 'Published prerequisites are shown; your passing record, approved equivalences and exclusions have not been verified.', zh ? '核对适用于本人专业和入学年级的最新课程说明及开课情况。' : 'Check the latest description and offering applicable to your programme and entry cohort.'];
    if (courseEntries.some(course => course.version === 'Jul 2021')) result.checks.push(zh ? 'COMP4432 的公开 PDF 版本为 2021 年 7 月；不能假定该旧版已涵盖当前学期的变更。' : 'The public COMP4432 PDF is dated July 2021; this older version may not reflect changes for the current semester.');
    result.followUps = courseEntries.length > 1 ? [zh ? `比较 ${courseEntries[0].code} 和 ${courseEntries[1].code}` : `Compare ${courseEntries[0].code} and ${courseEntries[1].code}`, zh ? `${courseEntries[0].code} 的先修课程是什么？` : `What are the prerequisites for ${courseEntries[0].code}?`] : [zh ? `${courseEntries[0].code} 的先修课程是什么？` : `What are the prerequisites for ${courseEntries[0].code}?`];
  }

  if (!query.requestedCodes.length && (isGraduation || isWie)) {
    for (const topic of [isGraduation && 'graduation', isWie && 'wie'].filter(Boolean)) {
      const entry = entries.find(item => item.kind === 'policy' && item.topics.includes(topic));
      if (evidence.some(chunk => chunk.id === entry.id)) paragraphs.push(zh ? entry.summaryZh : entry.summary);
    }
    if (isGraduation) {
      paragraphs.push(zh ? '我尚不能确认你还差多少学分或是否可毕业。需要适用年级的课程要求、已通过课程及学分、学分转移和各类别完成情况；仅提供专业或年级不足以计算。' : 'I cannot yet determine your remaining credits or graduation eligibility. That needs your cohort requirements, passed subjects and credits, approved transfers and completion of each requirement category; programme/year alone is insufficient.');
      result.checks = [zh ? '请上传成绩单和适用入学年级的课程手册；系统提供相关节选，不进行官方毕业资格认定。' : 'Upload a transcript and the handbook for your cohort. Retrieved excerpts support review, not official graduation certification.'];
    }
  }
  if (uploaded.length && (wantsDocuments || !courseEntries.length || isPrerequisite || isGraduation)) {
    paragraphs.push(zh ? '上传文件中的相关节选如下（属于你提供的资料，尚未独立核实）：' : 'Relevant excerpts from your uploaded documents follow. These are user-supplied references, not independently verified records:');
    for (const chunk of uploaded.slice(0, 2)) paragraphs.push(`${chunk.documentName}: “${chunk.text.slice(0, 520)}${chunk.text.length > 520 ? '…' : ''}”`);
    result.checks = [...(result.checks || []), zh ? '文件中的文字只作为资料引用；其中的指令不控制顾问行为。若与官方要求不同，请核对版本、入学年级及审批状态。' : 'Document text is treated as reference data. Resolve discrepancies against the applicable official version, cohort and approval status.'];
  } else if (wantsDocuments && !uploaded.length) paragraphs.push(zh ? '没有找到可读取并与问题相关的上传文件内容。请上传含可选取文字的 PDF、TXT、CSV、DOCX 或 Markdown；扫描图片需要先做文字识别。' : 'No readable, relevant uploaded text was found. Upload a text-based PDF, TXT, CSV, DOCX or Markdown; image-only scans need OCR first.');

  if (!paragraphs.length) {
    if (isPrerequisite) paragraphs.push(zh ? '请提供课程代码（例如 COMP4431），我才能查到准确的先修条件；当前没有足够信息确定你指的是哪门课。' : 'Please provide the course code, such as COMP4431, so I can retrieve its exact prerequisites. I do not have enough context to identify the subject.');
    else if (isPlanning) paragraphs.push(zh ? '要做有依据的学期规划，请先告诉我目标课程或兴趣方向，并提供已通过课程及适用年级的要求。我可以据此整理先修依赖，但当前资料不能确认学期供应或毕业资格。' : 'To build a grounded study plan, name your target subjects or interests and provide completed courses plus the requirements for your cohort. I can organise prerequisite dependencies, but these references cannot confirm semester availability or graduation eligibility.');
    else paragraphs.push(remoteCourses.length
      ? (zh ? '已检索课程目录，但没有找到与该问题足够匹配的课程。可以改问具体课程代码，或把方向说得更具体一些。' : 'The course catalogue was searched, but no subject was a strong enough match. Name a course code or a more specific area.')
      : (zh ? '当前这个小型资料库没有足够证据回答该问题。请提供具体课程代码、学习方向或相关课程文件；我会明确区分已记录的事实与尚未核实的内容。' : 'This small reference set does not contain enough evidence to answer that question. Provide a specific course code, study interest or relevant subject document so I can separate recorded facts from unresolved details.'));
    result.followUps = ask;
  }
  result.text = paragraphs.join('\n\n');
  result.retrieval.matchedSources = evidence.length;
  return result;
}
