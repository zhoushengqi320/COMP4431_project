import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeCourseResponse, recommendationContext, courseRating, plainCourseSummary } from '../server/course-response.mjs';
import { extractCourseCodes, retrieveCourses } from '../server/course-knowledge.mjs';
import { coursePreparation } from '../server/course-preparation.mjs';
import { generateDataset, splitCourseGroups } from '../scripts/finetuning/dataset.mjs';
import { auditDataset, approvedRecords } from '../scripts/finetuning/validation.mjs';
import { scoreRawAnswer } from '../scripts/finetuning/metrics.mjs';
import { assertReleasePolicy } from '../scripts/finetuning/release-guard.mjs';

const rows = JSON.parse(readFileSync(new URL('../data/courses.json', import.meta.url))).courses;
const dsai = rows.find(row => row.code === 'DSAI2201');

test('unknown lookups never get replaced by a different retrieved course', () => {
  const answer = normalizeCourseResponse({ text: '介绍另一门课', courses: [{ code: 'DSAI2201' }] }, [dsai], 'COMP9999是什么课');
  assert.equal(answer.courses.length, 0);
  assert.match(answer.text, /COMP9999/);
});

test('completed courses do not become recommended cards or extra candidates', () => {
  const previous = rows.find(row => row.code === 'COMP1011');
  const raw = { text: '推荐', courses: [{ code: 'COMP1011' }, { code: 'DSAI2201' }], moreCourseCodes: ['COMP1011'] };
  const answer = normalizeCourseResponse(raw, [previous, dsai], '我已经修过COMP1011，推荐一些数据结构课程');
  assert.deepEqual(answer.courses.map(c => c.code), ['DSAI2201']);
  assert.equal(answer.moreCourses, undefined);
  const notCompleted = normalizeCourseResponse(raw, [previous, dsai], '我没有修过COMP1011，推荐一些入门课');
  assert.ok(notCompleted.courses.some(c => c.code === 'COMP1011'));
});

test('topic switches reset state while the same explicit topic continues it', () => {
  const prior = { role: 'assistant', text: '推荐', recommendationContext: { query: '我想学机器学习，推荐一些课', seenCodes: ['COMP4432'], reserveCodes: ['AMA4680'] } };
  const switched = recommendationContext('还有其他金融课程吗', [prior]);
  assert.equal(switched.more, false);
  assert.equal(switched.query, '还有其他金融课程吗');
  assert.deepEqual(switched.seenCodes, []);
  assert.equal(recommendationContext('继续推荐机器学习课程', [prior]).more, true);
  assert.equal(recommendationContext('这门课还有先修课吗', [prior]).more, false);
  assert.doesNotThrow(() => recommendationContext('再来3门', {}));
});

test('mixed course codes, five-digit subjects and catalogue aliases are recognized', () => {
  assert.deepEqual(extractCourseCodes('介绍COMP1D04、AP40012与COMP3911:COMP3S03'), ['COMP1D04', 'AP40012', 'COMP3911', 'COMP3S03']);
  const composite = rows.find(row => row.code === 'COMP3911:COMP3S03');
  assert.ok(composite);
  const answer = normalizeCourseResponse({ text: '介绍', courses: [{ code: 'COMP3911' }, { code: 'COMP3S03' }] }, [composite], '介绍COMP3S03');
  assert.equal(answer.courses.length, 1);
  assert.equal(answer.courses[0].code, composite.code);
  assert.deepEqual(retrieveCourses([composite], { message: 'COMP3911', excludeCodes: ['COMP3S03'] }), []);
});

test('concurrent and exclusion courses are not presented as advance preparation', () => {
  const prep = coursePreparation('先修：COMP1011\n同修课程：COMP2011\n排除课程：DSAI2201\n建议先修：AMA1110');
  assert.deepEqual(prep.levels.flatMap(group => group.courses), ['COMP1011', 'AMA1110']);
  const english = coursePreparation('Pre-requisites: COMP1011; Co-requisites: COMP2011; Anti-requisites: DSAI2201; Recommended background: AMA1110', 'en');
  assert.deepEqual(english.levels.flatMap(group => group.courses), ['COMP1011', 'AMA1110']);
  assert.ok(prep.sourceText.includes('同修'));
});

test('malformed model structures do not crash response rendering data', () => {
  const values = [null, false, 0, '', 'bad', [], {}, { length: 3 }];
  for (const value of values) {
    const answer = normalizeCourseResponse({ text: '介绍', courses: value, semesters: [null, value], checks: value, followUps: value, sources: [null, value] }, [dsai], '你好');
    assert.equal(typeof answer.text, 'string');
    for (const key of ['courses', 'semesters', 'sources', 'checks', 'followUps']) if (key in answer) assert.ok(Array.isArray(answer[key]));
  }
  const malformed = normalizeCourseResponse({ text: '介绍', courses: [{ code: dsai.code }] }, [{ ...dsai, name: {}, objectives: [], credits: false }], '介绍DSAI2201').courses[0];
  assert.equal(typeof malformed.title, 'string');
  assert.equal(malformed.credits, null);
  assert.equal(courseRating({ code: 'AUDIT1000', rating: false }).ratingSource, 'simulated');
  assert.equal(courseRating({ code: 'AUDIT1001', rating: [4] }).ratingSource, 'simulated');
});

test('raw metrics and dataset validation report malformed output without throwing', () => {
  const fixture = { code: 'COMP1000', name: 'Subject', department: 'comp', objectives: '掌握知识。', description: '课程内容。', prerequisites: '无' };
  const data = generateDataset([fixture], 'Test');
  const source = data.records.find(item => item.targetCodes.length);
  for (const bad of [null, [], 4, { text: 'x', courses: [null] }, { text: 'x', courses: [{ code: 'COMP1000', learningOutcomes: {} }] }, { text: 'x', courses: {}, moreCourseCodes: 'COMP1000' }]) {
    const item = structuredClone(source);
    item.record.messages[2].content = JSON.stringify(bad);
    assert.doesNotThrow(() => scoreRawAnswer(JSON.stringify(bad), item));
    const report = auditDataset([item], data.groupAssignments);
    assert.equal(report.passed, false);
    assert.ok(report.errors.length);
  }
});

test('automatic checks cannot silently count as human-approved samples', () => {
  const data = generateDataset([{ code: 'COMP1000', name: 'Subject', department: 'comp', objectives: '目标', description: '内容' }], 'Test');
  const item = data.records[0];
  const review = { id: item.id, contentHash: item.contentHash, status: 'rules_checked', reviewType: 'automated_source_and_quality_check', reviewer: 'Automated audit', notes: 'Not human approval' };
  assert.deepEqual(approvedRecords(data.records, [review], item.split), []);
  assert.equal(approvedRecords(data.records, [review], item.split, { allowAiPilot: true }).length, 1);
  assert.deepEqual(approvedRecords(data.records, [{ ...review, status: 'approved' }], item.split), []);
});

test('obsolete sources/prompts and automated releases are blocked before upload', () => {
  const state = { manifest: { status: 'draft_pending_review', source: { sha256: 'source' }, systemPromptHash: 'prompt' },
    release: { status: 'reviewed_local_release_not_uploaded', sourceHash: 'source', systemPromptHash: 'prompt', reviewTypes: [] },
    sourceHash: 'source', promptHash: 'prompt', isCurrent: true, allowAiPilot: false };
  assert.doesNotThrow(() => assertReleasePolicy(state));
  assert.throws(() => assertReleasePolicy({ ...state, isCurrent: false }), /current/);
  assert.throws(() => assertReleasePolicy({ ...state, release: { ...state.release, trainingJobId: 'ft-existing' } }), /already submitted/);
  assert.throws(() => assertReleasePolicy({ ...state, promptHash: 'new' }), /stale/);
  assert.throws(() => assertReleasePolicy({ ...state, sourceHash: 'new' }), /stale/);
  assert.throws(() => assertReleasePolicy({ ...state, manifest: { ...state.manifest, status: 'superseded' } }), /superseded/);
  assert.throws(() => assertReleasePolicy({ ...state, release: { ...state.release, reviewTypes: ['automated_source_and_quality_check'] } }), /automated/);
});

test('shared aliases stay in the same dataset partition even if titles differ', () => {
  const base = Array.from({ length: 12 }, (_, i) => ({ code: `COMP${1000 + i}`, name: `Topic${i}`, description: `Description ${i}` }));
  const groups = splitCourseGroups([...base, { code: 'COMP1000:COMP1D01', name: 'Different title', description: 'Completely different description' }]).groupAssignments;
  assert.ok(groups.some(group => group.codes.includes('COMP1000') && group.codes.includes('COMP1000:COMP1D01')));
});

test('eligibility and offering answers remain visible rather than forcing a course card', () => {
  const raw = { text: '课程库未提供开课学期，无法确认。', courses: [] };
  const offering = normalizeCourseResponse(raw, [dsai], 'DSAI2201下学期会开吗？');
  assert.deepEqual(offering.courses, []);
  assert.equal(offering.text, raw.text);
  const eligibility = normalizeCourseResponse({ text: '尚未核验资格。', courses: [] }, [dsai], '我能直接选DSAI2201吗？');
  assert.deepEqual(eligibility.courses, []);
  for (const question of ['DSAI2201下学期会开吗？', '我能直接选DSAI2201吗？']) {
    const card = normalizeCourseResponse({ text: '隐藏的说明', courses: [{ code: 'DSAI2201' }] }, [dsai], question);
    assert.ok(card.decisionNotice);
    assert.equal(card.courses.length, 1);
  }
});

test('technical explanations preserve unsupervised learning without recursive replacements', () => {
  const text = plainCourseSummary('人工智能包括无监督学习和监督学习。');
  assert.match(text, /人工智能/);
  assert.match(text, /无监督学习（从没有答案的数据中找规律）/);
  assert.match(text, /监督学习（从带答案的例子中学习）/);
  assert.ok(!text.includes('无监督学习（从带答案'));
});

test('comparisons acknowledge unavailable courses without fabricating their cards', () => {
  const answer = normalizeCourseResponse({ text: '比较', courses: [{ code: 'DSAI2201' }, { code: 'COMP9999' }] }, [dsai], '比较DSAI2201和COMP9999');
  assert.deepEqual(answer.courses.map(c => c.code), ['DSAI2201']);
  assert.deepEqual(answer.unavailableCourses, ['COMP9999']);
});
