import { sha256 } from './dataset.mjs';
import { extractCourseCodes, courseCodeAliases, referencesOnlyCourses } from '../../server/course-codes.mjs';
import { coursePreparation, containsPreparationInfo } from '../../server/course-preparation.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const stringList = value => Array.isArray(value) && value.every(v => typeof v === 'string');

export function auditDataset(records, groups) {
  const errors = [], hashes = new Set(), ids = new Set(), groupIds = new Set(), codeSplits = new Map(), aliasSplits = new Map();
  if (!Array.isArray(records)) return { passed: false, samples: 0, errors: ['Records must be a list'], semanticReview: 'not performed' };
  if (!Array.isArray(groups)) { errors.push('Groups must be a list'); groups = []; }
  for (const group of groups) {
    if (!object(group) || !stringList(group.codes) || !['train', 'validation', 'test'].includes(group.split)) { errors.push('Invalid course group'); continue; }
    if (groupIds.has(group.groupId)) errors.push(`Duplicate group: ${group.groupId}`);
    groupIds.add(group.groupId);
    for (const code of group.codes) {
      if (codeSplits.has(code) && codeSplits.get(code) !== group.split) errors.push(`Course leakage: ${code}`);
      codeSplits.set(code, group.split);
      for (const alias of courseCodeAliases(code)) {
        if (aliasSplits.has(alias) && aliasSplits.get(alias) !== group.split) errors.push(`Course alias leakage: ${alias}`);
        aliasSplits.set(alias, group.split);
      }
    }
  }
  for (const item of records) {
    if (!object(item)) { errors.push('Invalid sample metadata'); continue; }
    const fail = message => errors.push(`${item.id || 'unknown'}: ${message}`);
    if (typeof item.id !== 'string' || ids.has(item.id)) fail('Missing or duplicate ID');
    ids.add(item.id);
    if (!stringList(item.sourceCodes) || !stringList(item.targetCodes) || !object(item.record)) { fail('Invalid sample metadata'); continue; }
    const hash = sha256(JSON.stringify(item.record));
    if (hash !== item.contentHash) fail('Content hash mismatch');
    if (hashes.has(hash)) fail('Duplicate complete conversation');
    hashes.add(hash);
    if (item.sourceCodes.some(code => codeSplits.get(code) !== item.split)) fail('Source course appears outside its assigned split');
    if (item.targetCodes.some(code => !item.sourceCodes.includes(code))) fail('Target course has no source');
    const messages = item.record.messages;
    if (!Array.isArray(messages) || messages.length !== 3 || messages.some(m => !object(m)) || messages.map(m => m.role).join(',') !== 'system,user,assistant') { fail('Invalid ChatML roles'); continue; }
    if (messages.some(m => typeof m.content !== 'string' || !m.content.trim())) { fail('Empty message content'); continue; }
    let answer;
    try { answer = JSON.parse(messages[2].content); } catch { fail('Assistant target is not JSON'); continue; }
    if (!object(answer)) { fail('Assistant target must be a JSON object'); continue; }
    if (typeof answer.text !== 'string' || !answer.text.trim()) fail('Missing text');
    const courses = answer.courses === undefined ? [] : answer.courses;
    if (!Array.isArray(courses)) { fail('Invalid courses'); continue; }
    if (courses.length > 3) fail('More than three introduced courses');
    const codes = courses.filter(object).map(c => c.code);
    if (new Set(codes).size !== codes.length) fail('Duplicate course card');
    if (JSON.stringify([...item.targetCodes].sort()) !== JSON.stringify([...codes].sort())) fail('Target metadata does not match course cards');
    for (const course of courses) {
      if (!object(course)) { fail('Invalid course card'); continue; }
      if (!item.sourceCodes.includes(course.code)) fail('Ungrounded course code');
      if (typeof course.summary !== 'string' || !course.summary.trim() || Array.from(course.summary).length > 500) fail('Invalid summary length');
      const outcomes = Array.isArray(course.learningOutcomes) ? course.learningOutcomes : [];
      if (!Array.isArray(course.learningOutcomes) || outcomes.length > 4 || outcomes.some(t => typeof t !== 'string' || !t.trim() || Array.from(t).length > 150)) fail('Invalid learning outcomes');
      if ('rating' in course || 'ratingSource' in course) fail('UI rating must not become a training target');
      if (containsPreparationInfo(course.summary) || outcomes.some(containsPreparationInfo)) fail('Preparation information must not appear in course overview or learning outcomes');
      if (Object.keys(course).at(-1) !== 'preparation') fail('Preparation must be the final course section');
      const prep = course.preparation;
      if (!object(prep) || !Array.isArray(prep.levels)) { fail('Missing final preparation section'); continue; }
      if (prep.levels.some(g => !object(g) || !Number.isInteger(g.level) || g.level < 1 || g.level > 9 || !stringList(g.courses))) fail('Invalid preparation groups');
      if (['description', 'note', 'sourceText'].some(key => typeof prep[key] !== 'string')) fail('Invalid preparation text');
      const raw = item.sourcePrerequisites?.[course.code];
      if (typeof raw !== 'string') fail('Missing prerequisite provenance');
      else if (JSON.stringify(prep) !== JSON.stringify(coursePreparation(raw))) fail('Preparation does not match source conditions/grouping');
    }
    if (answer.overview !== undefined) {
      if (typeof answer.overview !== 'string') fail('Overview must be text');
      else {
        if (!referencesOnlyCourses(answer.overview, codes)) fail('Overview references an undisplayed course');
        if (Array.from(answer.overview).length > 500) fail('Overview too long');
      }
    }
    const reserves = answer.moreCourseCodes === undefined ? [] : answer.moreCourseCodes;
    if (!stringList(reserves)) fail('Invalid additional course list');
    else if (reserves.length > 12 || new Set(reserves).size !== reserves.length || reserves.some(code => !item.sourceCodes.includes(code) || codes.includes(code))) fail('Invalid additional course');
    if (item.task === 'continue_recommendation') {
      const seen = messages[1].content.match(/Already introduced course codes \(do not repeat\): ([^\n]+)/)?.[1].split(', ') || [];
      const seenAliases = new Set(seen.flatMap(courseCodeAliases));
      if (codes.some(code => courseCodeAliases(code).some(alias => seenAliases.has(alias)))) fail('Continuation repeats a course');
    }
    if (courses.length && (!stringList(answer.followUps) || answer.followUps.length !== 3 || answer.followUps.some(q => !q.trim()) || new Set(answer.followUps).size !== 3)) fail('Course reply needs three distinct follow-ups');
    if (!courses.length && answer.followUps !== undefined && !stringList(answer.followUps)) fail('Invalid follow-up list');
  }
  return { passed: errors.length === 0, samples: records.length, errors, semanticReview: 'not performed by structural validator' };
}

export function approvedRecords(records, reviews, split, { allowAiPilot = false } = {}) {
  if (!Array.isArray(reviews)) throw new Error('Reviews must be a list');
  const byId = new Map();
  for (const review of reviews) {
    if (!object(review) || typeof review.id !== 'string') throw new Error('Invalid review entry');
    if (byId.has(review.id)) throw new Error(`Duplicate review ID: ${review.id}`);
    byId.set(review.id, review);
  }
  return records.filter(item => {
    const r = byId.get(item.id);
    const automatic = r?.reviewType?.startsWith('automated') || r?.status === 'rules_checked';
    return item.split === split && (r?.status === 'approved' || (allowAiPilot && r?.status === 'rules_checked')) && (!automatic || allowAiPilot);
  }).map(item => {
    const review = byId.get(item.id);
    if (review.contentHash !== sha256(JSON.stringify(item.record))) throw new Error(`Stale approval: ${item.id}`);
    if (typeof review.reviewer !== 'string' || !review.reviewer.trim() || typeof review.notes !== 'string' || !review.notes.trim()) throw new Error(`Reviewer and review notes required: ${item.id}`);
    return item;
  });
}
