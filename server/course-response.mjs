import { randomInt } from 'node:crypto';
import { resolveResponseLanguage } from './response-language.mjs';
import { extractCourseCodes } from './course-knowledge.mjs';
import { courseCodeAliases, referencesOnlyCourses } from './course-codes.mjs';
import { coursePreparation, prerequisiteLevels, containsPreparationInfo, overviewWithoutPreparation } from './course-preparation.mjs';
export { prerequisiteLevels } from './course-preparation.mjs';

const simulatedRatings = new Map();
const codeKey = code => String(code || '').toUpperCase().replace(/\s+/g, '');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const field = value => typeof value === 'string' ? value.trim() : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
const strings = (value, limit = 100) => Array.isArray(value) ? value.filter(v => typeof v === 'string' && v.trim()).map(v => v.trim()).slice(0, limit) : [];
const bounded = value => {
  const chars = Array.from(String(value || '').trim());
  return chars.length > 500 ? `${chars.slice(0, 499).join('')}…` : chars.join('');
};

export function plainCourseSummary(value) {
  // Explain common catalogue jargon in the overview; official titles/conditions stay untouched.
  let text = String(value || '');
  const explanations = [
    ['链表、栈、队列、树、图等数据结构', '不同的数据组织方式'],
    ['排序、搜索、贪心、分治和动态规划等算法', '查找、整理数据，以及把复杂问题拆成小步骤来解决的方法'],
    ['智能代理', '能根据情况采取行动的程序'],
    ['启发式搜索', '优先尝试更有希望的解决方案'],
    ['遗传算法', '模仿生物进化来寻找更好方案的方法'],
    ['无监督学习', '从没有答案的数据中找规律'],
    ['监督学习', '从带答案的例子中学习'],
    ['强化学习', '通过尝试和反馈学习'],
    ['决策树', '通过一连串问题作判断的方法'],
    ['支持向量机', '根据数据特征区分类别的方法'],
    ['神经网络', '通过多层计算从例子中学习的模型'],
    ['渐近分析', '分析数据增多时程序耗时如何变化'],
    ['算法分析', '比较解决问题的方法有多快、占多少内存'],
    ['贪心算法', '每一步先选眼前最合适方案的方法'],
    ['动态规划', '保存已经算过的结果，避免重复计算的方法'],
    ['分治法', '把大问题拆成小问题分别解决的方法']
  ];
  const replacements = new Map(explanations.map(([term, explanation]) => [term,
    term.includes('、') ? explanation : `${term}（${explanation}）`]));
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp([...replacements.keys()].sort((a, b) => b.length - a.length).map(escape).join('|'), 'g');
  text = text.replace(pattern, term => replacements.get(term));
  return bounded(text);
}

export function prerequisiteSections(value, language = 'zh') {
  const unknown = language === 'zh' ? '资料未提供，需核实' : 'Not provided; verification needed';
  const raw = String(value || '').trim();
  if (!raw) return { required: unknown, recommended: unknown, raw };
  if (/^(无|無|none|nil|n\/?a|no prerequisites)[。.\s]*$/i.test(raw)) {
    return { required: language === 'zh' ? '无（课程库明确注明）' : 'None (catalogue)', recommended: unknown, raw };
  }
  const labels = /(?:建议先修(?:课程)?|建議先修(?:課程)?|推荐先修(?:课程)?|recommended\s+(?:prerequisites?|background)|必要先修(?:课程)?|先修课程|先修課程|先修|前置条件|pre-?requisites?)\s*[:：]/gi;
  const matches = [...raw.matchAll(labels)];
  if (!matches.length) return { required: raw, recommended: unknown, raw };
  const required = [], recommended = [];
  if (matches[0].index > 0 && raw.slice(0, matches[0].index).trim()) required.push(raw.slice(0, matches[0].index).trim());
  matches.forEach((match, index) => {
    const content = raw.slice(match.index + match[0].length, matches[index + 1]?.index ?? raw.length).trim();
    if (content) (/建议|建議|推荐|recommended/i.test(match[0]) ? recommended : required).push(content);
  });
  return { required: required.join('\n') || unknown, recommended: recommended.join('\n') || unknown, raw };
}

export function courseRating(course) {
  const value = course.rating;
  if (['number', 'string'].includes(typeof value) && String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 5) {
    return { rating: Number(Number(value).toFixed(1)), ratingSource: 'catalogue' };
  }
  const key = `${course.school_id || ''}:${course.id || codeKey(course.code)}`;
  // Stable within this server session; never persisted as a real student rating.
  if (!simulatedRatings.has(key)) simulatedRatings.set(key, randomInt(40, 51) / 10);
  return { rating: simulatedRatings.get(key), ratingSource: 'simulated' };
}

function learningOutcomes(generated, row) {
  const supplied = Array.isArray(generated) ? generated : [];
  const headings = [...String(row.description || '').matchAll(/^\d+[.、．]\s*([^\n]+)/gm)].map(match => match[1]);
  const fallback = headings.length ? headings : String(row.description || row.objectives || '').split(/[。\n]+/u);
  const valid = supplied.filter(value => typeof value === 'string' && value.trim() && !containsPreparationInfo(value));
  return [...new Set((valid.length ? valid : fallback).map(value => String(value).trim()).filter(value => value && !containsPreparationInfo(value)))]
    .slice(0, 4).map(value => Array.from(plainCourseSummary(value)).slice(0, 150).join(''));
}

function courseFollowUps(generated, course, language, allowedCodes) {
  const supplied = Array.isArray(generated) ? generated : [];
  const questions = [...new Set(supplied.filter(value => typeof value === 'string').map(value => value.trim()).filter(value => value && (!allowedCodes || extractCourseCodes(value).every(code => allowedCodes.has(code))))) ]
    .slice(0, 3).map(value => Array.from(value).slice(0, 150).join(''));
  const code = course.code;
  const contextual = questions.map(question => extractCourseCodes(question).length ? question : `${code}: ${question}`);
  const fallback = language === 'zh'
    ? [`${code}的先修课程分别学什么？`, `学习${code}前可以怎样预习？`, `${code}的课程内容有哪些实际用途？`]
    : [`What do the prerequisites for ${code} cover?`, `How can I prepare for ${code}?`, `How is the content of ${code} used in practice?`];
  return [...new Set([...contextual, ...fallback])].slice(0, 3);
}

export function recommendationContext(message, history = []) {
  const text = String(message || '');
  const continuation = !containsPreparationInfo(text) && /更多.*课|再.*推荐|继续推荐|其他.*课|再来.*[门课]|还有.*课|more\s+.*courses|recommend.*more/i.test(text);
  const newGoal = /(?:其他|更多|继续推荐|再推荐)\s*([^，。！？,?!]*?)(?:课程|课)/i.exec(text)?.[1]
    ?.replace(/相关|类似|同类|合适|可选|已经介绍过的|之前介绍过的|最多|再|几|一些|更多|另外|的|\d|门|\s/g, '');
  const englishGoal = /(?:more|other|additional)\s+(.+?)\s+courses/i.exec(text)?.[1]?.replace(/related|similar|suitable|available/gi, '').trim();
  const prior = (Array.isArray(history) ? [...history] : []).reverse().find(item => object(item) && item.role === 'assistant' && object(item.recommendationContext))?.recommendationContext;
  const goal = newGoal || englishGoal;
  const matchesOldGoal = typeof prior?.query === 'string' && goal && prior.query.replace(/\s/g, '').toLowerCase().includes(goal.replace(/\s/g, '').toLowerCase());
  const more = continuation && (!goal || matchesOldGoal) && !/换个?方向|换成|改为|改成|switch|instead/i.test(text);
  const previous = more ? prior : null;
  return {
    active: continuation || /推荐|推介|选什么课|有哪些.*课|学哪些|recommend|suggest|which courses|what courses/i.test(text),
    more, hasPrevious: !!previous, query: typeof previous?.query === 'string' ? previous.query.slice(0, 6000) : text,
    seenCodes: strings(previous?.seenCodes, 500).map(codeKey),
    reserveCodes: strings(previous?.reserveCodes, 100).map(codeKey)
  };
}

function completedCourseCodes(message) {
  const completed = new Set();
  for (const match of String(message || '').matchAll(/已经修过|已修过|修过|已完成|completed|passed/gi)) {
    if (/没|未|不曾|not|n't/i.test(String(message).slice(Math.max(0, match.index - 8), match.index))) continue;
    const clause = String(message).slice(match.index + match[0].length).split(/但|想|希望|能否|能不能|可以|推荐|需要|but|want|[。；;!?！？]/i)[0];
    for (const code of extractCourseCodes(clause)) completed.add(code);
  }
  return completed;
}

function safeExtras(answer) {
  const semesters = (Array.isArray(answer.semesters) ? answer.semesters : []).filter(object)
    .filter(s => typeof s.title === 'string').slice(0, 12)
    .map(s => ({ title: s.title.slice(0, 160), credits: typeof s.credits === 'number' && Number.isFinite(s.credits) ? s.credits : 0, courses: strings(s.courses, 20) }));
  const sources = (Array.isArray(answer.sources) ? answer.sources : []).filter(object).slice(0, 12)
    .map(s => ({ title: typeof s.title === 'string' ? s.title.slice(0, 200) : 'Course information', detail: typeof s.detail === 'string' ? s.detail.slice(0, 1500) : '',
      ...(typeof s.url === 'string' && /^https?:\/\//i.test(s.url) ? { url: s.url } : {}) }));
  return { ...(semesters.length ? { semesters } : {}), ...(sources.length ? { sources } : {}),
    ...(strings(answer.checks, 10).length ? { checks: strings(answer.checks, 10) } : {}),
    ...(strings(answer.followUps, 3).length ? { followUps: strings(answer.followUps, 3) } : {}) };
}

export function normalizeCourseResponse(answer, rows, message, history = []) {
  answer = object(answer) ? answer : {};
  rows = (Array.isArray(rows) ? rows : []).filter(row => object(row) && typeof row.code === 'string' && row.code);
  message = String(message || '');
  const language = resolveResponseLanguage(message, history).code.startsWith('zh') ? 'zh' : 'en';
  const missing = language === 'zh' ? '资料未提供' : 'Not provided';
  const byCode = new Map(rows.map(row => [codeKey(row.code), row]));
  for (const row of rows) for (const alias of courseCodeAliases(row.code)) if (!byCode.has(alias)) byCode.set(alias, row);
  const canonicalCode = code => byCode.has(codeKey(code)) ? codeKey(byCode.get(codeKey(code)).code) : codeKey(code);
  const context = recommendationContext(message, history);
  const seen = new Set(context.seenCodes.map(canonicalCode));
  const seenAliases = new Set([...seen].flatMap(courseCodeAliases));
  const isSeen = code => courseCodeAliases(code).some(alias => seenAliases.has(alias));
  const completed = new Set([...completedCourseCodes(message), ...completedCourseCodes(context.query)].map(canonicalCode));
  const proposed = new Map((Array.isArray(answer.courses) ? answer.courses : []).filter(c => c && typeof c.code === 'string').map(c => [canonicalCode(c.code), c]));
  const mentioned = extractCourseCodes(message).map(codeKey);
  const directLookup = !context.active && /是什么课|介绍|介紹|比较|对比|区别|分别|tell me about|describe|what.*course|compare|explain/i.test(message);
  const singleSubject = !context.active && mentioned.length === 1 && !/修过|已修|已完成|passed|completed/i.test(message);
  const unavailableCourses = directLookup ? [...new Set(mentioned.filter(code => !byCode.has(code)))] : [];
  if ((directLookup || singleSubject) && mentioned.length === 1 && !byCode.has(mentioned[0])) {
    return { text: language === 'zh' ? `没有检索到${mentioned[0]}的课程资料，请核对课程编号。` : `No catalogue record was found for ${mentioned[0]}. Please check the course code.`, courses: [] };
  }
  const eligibilityTarget = /(?:能(?:不能|否)?(?:直接)?(?:选|修|上)|可(?:以|否)(?:选|修|上)|(?:想|打算)(?:选|修|上)|(?:can|may) i (?:take|study))\s*([A-Z]{2,6}\s*(?:\d{3,5}[A-Z]{0,2}|\d[A-Z]{1,2}\d{2,3}[A-Z]{0,2}))(?![A-Z0-9])/i.exec(message)?.[1];
  const eligibilityQuestion = !context.active && /能(?:不能|否)?.*(?:选|修|上)|可(?:以|否).*(?:选|修|上)|资格|符合.*条件|(?:can|may) i (?:take|study)|\beligib/i.test(message);
  const offeringQuestion = !context.active && /开课|开设|会开|学期.*(?:有|开)|(?:下|本|这|哪|每).*学期|semester|when.*offer|offered/i.test(message);
  const decisionQuestion = eligibilityQuestion || offeringQuestion;
  const requested = (context.active || decisionQuestion && !proposed.size ? [] : eligibilityTarget ? [codeKey(eligibilityTarget)] : directLookup || singleSubject ? mentioned : [])
    .filter(code => byCode.has(code)).map(canonicalCode);
  const validProposed = [...proposed.keys()].filter(code => byCode.has(code));
  const planned = (Array.isArray(answer.semesters) ? answer.semesters : []).filter(object).flatMap(s => strings(s.courses, 20).flatMap(extractCourseCodes));
  const chosen = requested.length ? requested : validProposed.length ? validProposed : planned.map(codeKey);
  let candidates = [...new Set(chosen.map(canonicalCode))]
    .filter(code => byCode.has(code) && (!context.more || !isSeen(code)) && (!context.active || !completed.has(code)));
  if (!candidates.length && context.more) candidates = [...new Set(context.reserveCodes.map(canonicalCode))].filter(code => byCode.has(code) && !isSeen(code) && !completed.has(code));
  const batched = context.active || candidates.length > 3;
  const codes = candidates.slice(0, 3);
  const courses = codes.map(code => {
    const record = byCode.get(code), generated = proposed.get(code) || {};
    const row = { ...record, name: field(record.name), description: field(record.description), objectives: field(record.objectives),
      teaching_pattern: field(record.teaching_pattern), prerequisites: typeof record.prerequisites === 'string' ? record.prerequisites : '',
      department: field(record.department), faculty: field(record.faculty), school_id: field(record.school_id), id: field(record.id), level: field(record.level) };
    const prerequisites = prerequisiteSections(row.prerequisites, language);
    const candidate = typeof generated.summary === 'string' && !containsPreparationInfo(generated.summary) ? generated.summary : '';
    const summary = plainCourseSummary(candidate || overviewWithoutPreparation(row.description || row.objectives || row.teaching_pattern) || missing);
    return {
      format: 'course-introduction-v1', language, code: row.code, title: row.name || missing,
      department: row.department || missing, level: row.level || missing, credits: ['number', 'string'].includes(typeof row.credits) && String(row.credits).trim() && Number.isFinite(Number(row.credits)) && Number(row.credits) >= 0 ? Number(row.credits) : null,
      faculty: row.faculty || missing, schoolId: row.school_id || missing, id: row.id || missing,
      objectives: row.objectives || missing, ...courseRating(row), summary,
      learningOutcomes: learningOutcomes(generated.learningOutcomes, row),
      requiredPrerequisites: prerequisites.required, recommendedPrerequisites: prerequisites.recommended,
      prerequisiteLevels: prerequisiteLevels(prerequisites.raw),
      prerequisite: prerequisites.raw || missing, reason: summary,
      preparation: coursePreparation(row.prerequisites, language)
    };
  });
  const text = typeof answer.text === 'string' && answer.text.trim() ? answer.text.trim().slice(0, 12000)
    : language === 'zh' ? '目前没有足够的课程资料可供介绍，请补充或核对查询信息。' : 'There is insufficient course information. Please clarify your question.';
  if (!courses.length) return { text, courses, ...safeExtras(answer) };
  const summarize = courses.length > 1 || context.active;
  const decisionNotice = eligibilityQuestion
    ? language === 'zh' ? '当前尚未完成官方选课资格核验；课程介绍和建议先修不能代表你已符合选课条件。请结合已修课程、所属专业及官方要求确认。' : 'Enrolment eligibility has not been verified. Course introductions and preparation suggestions do not establish eligibility; check completed courses, programme rules and official requirements.'
    : offeringQuestion ? courses.map(course => {
      const offering = field(byCode.get(course.code)?.semester_offered);
      return language === 'zh' ? offering ? `${course.code}的课程库开课信息：${offering}；实际安排请核对最新课表。` : `${course.code}的课程库未提供开课学期，无法确认是否开设，请核对最新课表。`
        : offering ? `${course.code}: catalogue offering information: ${offering}; confirm against the latest timetable.` : `${course.code}: no semester offering is recorded; check the latest timetable.`;
    }).join(' ') : '';
  const fallbackOverview = language === 'zh'
    ? `结合你的学习方向，本次推荐${courses.length}门课程：${courses.map(course => `${course.code}（${course.title}）`).join('、')}。下面逐门介绍课程内容与学习收获，方便你比较选择。`
    : `For your learning interests, consider these ${courses.length} courses: ${courses.map(course => `${course.code} (${course.title})`).join(', ')}. Below are their learning goals, content and suggested preparation to help you compare.`;
  const overviewMatches = typeof answer.overview === 'string' && answer.overview.trim()
    && !containsPreparationInfo(answer.overview)
    && candidates.length <= codes.length && referencesOnlyCourses(answer.overview, codes);
  const overview = overviewMatches ? answer.overview : fallbackOverview;
  const additional = Array.isArray(answer.moreCourseCodes) ? answer.moreCourseCodes.filter(code => typeof code === 'string').map(canonicalCode) : [];
  const reserveCodes = [...new Set([...candidates.slice(codes.length), ...additional, ...context.reserveCodes.map(canonicalCode)])]
    .filter(code => byCode.has(code) && !isSeen(code) && !completed.has(code) && !codes.includes(code));
  const allowedFollowUps = new Set([...rows.flatMap(row => courseCodeAliases(row.code)), ...courses.flatMap(course => extractCourseCodes(course.preparation.sourceText))]);
  return {
    text, courses,
    ...(decisionNotice ? { decisionNotice } : {}),
    ...(unavailableCourses.length ? { unavailableCourses } : {}),
    ...(summarize ? { overview: bounded(overview) } : {}),
    followUps: courseFollowUps(answer.followUps, courses[0], language, allowedFollowUps),
    ...(batched ? {
      recommendationContext: { query: context.query, seenCodes: [...new Set([...seen, ...codes])], reserveCodes },
      ...(reserveCodes.length ? { moreCourses: {
        available: true,
        prompt: language === 'zh' ? '请继续推荐更多相关课程，避开之前介绍过的课程。' : 'Recommend more related courses, excluding those already introduced.'
      } } : {})
    } : {})
  };
}
