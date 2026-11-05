import { extractCourseCodes, courseCodeAliases, referencesOnlyCourses } from '../../server/course-codes.mjs';
import { containsPreparationInfo } from '../../server/course-preparation.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const stringList = value => Array.isArray(value) && value.every(v => typeof v === 'string');
const failShape = () => Object.fromEntries(['schemaValid','courseLimit','uniqueCards','sourceGrounding','summaryLength','overviewAlignment','followUps','noRepeatedContinuation','noUiRatings','preparationPlacement','taskCompletionShape'].map(key => [key, false]));

// These are raw-model structural/source-code metrics, not semantic factual accuracy.
export function scoreRawAnswer(content, item) {
  let answer;
  try { answer = JSON.parse(content); } catch { return { jsonValid: false }; }
  if (!object(answer)) return { jsonValid: false };
  const cards = answer.courses === undefined ? [] : answer.courses;
  const reserves = answer.moreCourseCodes === undefined ? [] : answer.moreCourseCodes;
  if (!Array.isArray(cards) || cards.some(c => !object(c) || typeof c.code !== 'string' || (c.learningOutcomes !== undefined && !stringList(c.learningOutcomes))) || !stringList(reserves)) {
    return { jsonValid: true, nonemptyText: typeof answer.text === 'string' && !!answer.text.trim(), ...failShape() };
  }
  const sources = Array.isArray(item?.sourceCodes) ? item.sourceCodes : [];
  const canonical = new Map(sources.flatMap(code => courseCodeAliases(code).map(alias => [alias, code])));
  const cardKeys = cards.map(c => canonical.get(c.code) || c.code);
  const shown = new Set(cardKeys);
  const seenText = String(item?.record?.messages?.[1]?.content || '').match(/Already introduced course codes \(do not repeat\): ([^\n]+)/)?.[1] || '';
  const seen = new Set(extractCourseCodes(seenText));
  const task = typeof item?.task === 'string' ? item.task : '';
  return {
    jsonValid: true, schemaValid: true,
    nonemptyText: typeof answer.text === 'string' && !!answer.text.trim(),
    courseLimit: cards.length <= 3,
    uniqueCards: shown.size === cards.length,
    sourceGrounding: [...cards.map(c => c.code), ...reserves].every(code => canonical.has(code)),
    summaryLength: cards.every(c => typeof c.summary === 'string' && !!c.summary.trim() && Array.from(c.summary).length <= 500),
    overviewAlignment: !answer.overview || (typeof answer.overview === 'string' && Array.from(answer.overview).length <= 500 && referencesOnlyCourses(answer.overview, cards.map(c => c.code))),
    followUps: !cards.length || (stringList(answer.followUps) && answer.followUps.length === 3 && new Set(answer.followUps).size === 3 && answer.followUps.every(q => !!q.trim())),
    noRepeatedContinuation: cards.every(c => courseCodeAliases(c.code).every(alias => !seen.has(alias))),
    noUiRatings: cards.every(c => !('rating' in c) && !('ratingSource' in c)),
    preparationPlacement: cards.every(c => object(c.preparation) && Array.isArray(c.preparation.levels) && Object.keys(c).at(-1) === 'preparation' && !containsPreparationInfo(c.summary) && !(c.learningOutcomes || []).some(containsPreparationInfo)),
    taskCompletionShape: !(item?.targetCodes?.length) || cards.length > 0,
    ...(task.startsWith('unknown_') || ['empty_retrieval', 'no_more_matches', 'resist_fabrication'].includes(task) ? { abstentionShape: cards.length === 0 } : {}),
    ...(['course_introduction', 'learning_goals', 'prerequisite_explanation', 'compare_courses'].includes(task)
      ? { requestedCoursesPresent: (item.targetCodes || []).every(code => courseCodeAliases(code).some(alias => cards.some(c => courseCodeAliases(c.code).includes(alias)))) } : {})
  };
}
