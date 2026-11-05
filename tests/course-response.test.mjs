import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeCourseResponse, prerequisiteSections, courseRating, prerequisiteLevels, plainCourseSummary, recommendationContext } from '../server/course-response.mjs';
import { extractCourseCodes, retrieveCourses, formatCatalogue } from '../server/course-knowledge.mjs';
import { narrationFor } from '../src/speech.js';

const rows = JSON.parse(readFileSync(new URL('../data/courses.json', import.meta.url))).courses;
const dsai = rows.find(c => c.code === 'DSAI2201');

test('prerequisites live in the final section, with source data overriding model preparation', () => {
  const answer = normalizeCourseResponse({ text: '介绍', courses: [{ code: 'DSAI2201', summary: '先修：FAKE9999。', preparation: { levels: [{ level: 9, courses: ['FAKE9999'] }] } }] }, [dsai], 'DSAI2201需要什么先修基础？');
  const card = answer.courses[0];
  assert.ok(!card.summary.includes('先修'));
  assert.ok(!card.summary.includes('FAKE9999'));
  assert.equal(Object.keys(card).at(-1), 'preparation');
  assert.equal(card.preparation.sourceText, dsai.prerequisites);
  assert.deepEqual(card.preparation.levels, card.prerequisiteLevels);
});

test('exclusion subjects are never displayed as suggested preparation courses', () => {
  const row = rows.find(c => c.code === 'COMP2011');
  const card = normalizeCourseResponse({ text: '介绍' }, [row], 'COMP2011是什么课').courses[0];
  const codes = card.preparation.levels.flatMap(group => group.courses);
  assert.deepEqual(codes, ['COMP1011', 'COMP1012', 'ENG2002']);
  assert.ok(!codes.includes('COMP2013'));
  assert.ok(!codes.includes('DSAI2201'));
  assert.ok(card.preparation.sourceText.includes('排除课程'));
  const ama = rows.find(c => c.code === 'AMA1110');
  assert.deepEqual(normalizeCourseResponse({ text: '介绍' }, [ama], 'AMA1110是什么课').courses[0].preparation.levels, []);
});

test('recommendations enforce a three-course limit, reconcile overview and offer more only for grounded extras', () => {
  const sample = rows.slice(0, 7);
  const first = normalizeCourseResponse({ text: '推荐7门', overview: `推荐7门：${sample.map(c => c.code).join('、')}`, courses: sample.map(c => ({ code: c.code })) }, sample, '推荐一些课');
  assert.equal(first.courses.length, 3);
  assert.equal(first.moreCourses.available, true);
  assert.equal(first.recommendationContext.reserveCodes.length, 4);
  assert.ok(!first.overview.includes(sample[6].code));
  assert.match(first.overview, /3门/);
  const justThree = normalizeCourseResponse({ text: '推荐', courses: sample.slice(0, 3), moreCourseCodes: ['FAKE9999', sample[0].code] }, sample.slice(0, 3), '推荐课程');
  assert.equal(justThree.courses.length, 3);
  assert.equal(justThree.moreCourses, undefined);
  const extra = normalizeCourseResponse({ text: '推荐', courses: sample.slice(0, 3), moreCourseCodes: [sample[3].code] }, sample, '推荐课程');
  assert.equal(extra.moreCourses.available, true);
});

test('more-course requests retain the learning goal, avoid duplicates and end when reserves are exhausted', () => {
  const sample = rows.slice(0, 7);
  const initial = '我想学machine learning相关内容，给我推荐一些课';
  const first = normalizeCourseResponse({ text: '推荐', courses: sample.map(c => ({ code: c.code })) }, sample, initial);
  const history = [{ role: 'user', text: initial }, { ...first, role: 'assistant' }];
  const nextMessage = first.moreCourses.prompt;
  const next = normalizeCourseResponse({ text: '更多', courses: sample.slice(0, 3) }, sample, nextMessage, history);
  assert.deepEqual(next.courses.map(c => c.code), sample.slice(3, 6).map(c => c.code));
  assert.equal(next.moreCourses.available, true);
  assert.equal(next.recommendationContext.query, initial);
  history.push({ role: 'user', text: nextMessage }, { ...next, role: 'assistant' });
  const last = normalizeCourseResponse({ text: '更多' }, sample, '再来3门', history);
  assert.deepEqual(last.courses.map(c => c.code), [sample[6].code]);
  assert.equal(last.moreCourses, undefined);
  assert.equal(last.recommendationContext.seenCodes.length, 7);
  assert.equal(recommendationContext('推荐旅游相关课程', history).seenCodes.length, 0);
});

test('retrieval excludes prior recommendations before limiting the new batch', () => {
  const sample = rows.slice(0, 7).map(c => ({ ...c, name: 'Machine learning' }));
  const hits = retrieveCourses(sample, { message: 'machine learning', limit: 3, excludeCodes: sample.slice(0, 3).map(c => c.code) });
  assert.equal(hits.length, 3);
  assert.ok(hits.every(c => !sample.slice(0, 3).some(old => old.code === c.code)));
});

test('recommendation replies start with an overview and keep per-course details and questions', () => {
  const answer = normalizeCourseResponse({ text: '好的', overview: '先学习数据的组织和处理，再了解人工智能如何解决问题。', courses: [{ code: 'DSAI2201' }, { code: 'COMP4431' }] }, rows, '我想学machine learning相关内容，给我推荐一些课');
  assert.equal(answer.overview, '先学习数据的组织和处理，再了解人工智能如何解决问题。');
  assert.equal(answer.courses.length, 2);
  assert.equal(answer.followUps.length, 3);
  const fallback = normalizeCourseResponse({ text: '好的', courses: [{ code: 'DSAI2201' }] }, [dsai], '推荐一些课');
  assert.match(fallback.overview, /DSAI2201/);
  assert.equal('overview' in normalizeCourseResponse({ text: '介绍', overview: '不应显示' }, [dsai], '请问DSAI2201是什么课'), false);
  const noExtraPlanCourses = normalizeCourseResponse({ text: '推荐', courses: [{ code: 'DSAI2201' }], semesters: [{ courses: ['COMP4431'] }] }, rows, '推荐一些课');
  assert.deepEqual(noExtraPlanCourses.courses.map(course => course.code), ['DSAI2201']);
});

test('overview explains common jargon without changing official course fields', () => {
  const summary = plainCourseSummary('学习链表、栈、队列、树、图等数据结构，以及动态规划。');
  assert.match(summary, /不同的数据组织方式/);
  assert.match(summary, /避免重复计算/);
  assert.equal(plainCourseSummary('课程'.repeat(300)).length, 500);
});

test('preparation courses are grouped by the first digit of the course code', () => {
  assert.deepEqual(prerequisiteLevels(dsai.prerequisites), [
    { level: 1, courses: ['COMP1011', 'COMP1012', 'AMA1110', 'AMA1501', 'AMA1751'] },
    { level: 2, courses: ['ENG2002', 'AMA2634', 'AMA2111'] },
    { level: 3, courses: ['LGT3109'] }
  ]);
  assert.deepEqual(prerequisiteLevels('无'), []);
  assert.deepEqual(prerequisiteLevels('COMP1011/COMP1011'), [{ level: 1, courses: ['COMP1011'] }]);
});

test('course replies omit auxiliary panels while non-course replies keep them', () => {
  const raw = { text: '介绍', courses: [{ code: 'DSAI2201' }], checks: ['Check'], sources: [{ title: 'Catalogue' }], followUps: ['More?'], semesters: [{ courses: ['DSAI2201'] }] };
  assert.deepEqual(Object.keys(normalizeCourseResponse(raw, [dsai], '介绍DSAI2201')).sort(), ['courses', 'followUps', 'text']);
  assert.deepEqual(normalizeCourseResponse({ text: '请提供资料', checks: ['Check'] }, [], '毕业需要什么资料').checks, ['Check']);
});

test('course replies preserve follow-up questions and provide safe defaults when omitted', () => {
  const answer = normalizeCourseResponse({ text: '介绍', followUps: ['怎样预习？', '怎样预习？', null, ''] }, [dsai], '介绍DSAI2201');
  assert.equal(answer.followUps.length, 3);
  assert.equal(answer.followUps[0], 'DSAI2201: 怎样预习？');
  assert.match(answer.followUps[1], /DSAI2201/);
  assert.equal(normalizeCourseResponse({ text: 'About' }, [dsai], 'Tell me about DSAI2201').followUps.length, 3);
});

test('learning outcomes are bounded, deduplicated and fall back to catalogue content', () => {
  const a = normalizeCourseResponse({ text: '介绍', courses: [{ code: 'DSAI2201', learningOutcomes: ['比较程序处理数据的速度。', '比较程序处理数据的速度。', null, '', '选择合适的方法组织数据。'] }] }, [dsai], '介绍DSAI2201').courses[0];
  assert.deepEqual(a.learningOutcomes, ['比较程序处理数据的速度。', '选择合适的方法组织数据。']);
  const fallback = normalizeCourseResponse({ text: '介绍' }, [dsai], '介绍DSAI2201').courses[0].learningOutcomes;
  assert.equal(fallback.length, 4);
  assert.ok(fallback.every(item => item.length <= 150));
});

test('Chinese-adjacent and mixed-case codes retrieve the exact course', () => {
  assert.deepEqual(extractCourseCodes('请问Comp4431是什么课，对比DSAI2201如何'), ['COMP4431', 'DSAI2201']);
  assert.equal(retrieveCourses(rows, { message: '请问Comp4431是什么课' })[0].code, 'COMP4431');
});

test('catalogue data overrides invented model facts and missing id stays unknown', () => {
  const answer = normalizeCourseResponse({ text: '介绍', courses: [{ code: 'dsai2201', title: 'Wrong', credits: 99, id: 'invented', rating: 1, summary: '数据结构与算法。', prerequisite: 'NONE' }] }, [dsai], '介绍DSAI2201');
  const c = answer.courses[0];
  assert.equal(c.title, dsai.name);
  assert.equal(c.credits, 3);
  assert.equal(c.id, '资料未提供');
  assert.equal(c.summary, '数据结构与算法。');
  assert.equal(c.requiredPrerequisites, dsai.prerequisites.replace(/^先修：/, ''));
  assert.equal(c.recommendedPrerequisites, '资料未提供，需核实');
});

test('keeps every alternative and conjunction in DSAI2201 prerequisites', () => {
  const c = normalizeCourseResponse({ text: '介绍' }, [dsai], '介绍DSAI2201').courses[0];
  for (const code of ['COMP1011', 'COMP1012', 'ENG2002', 'LGT3109', 'AMA1110', 'AMA1501', 'AMA2634', 'AMA1751', 'AMA2111']) assert.ok(c.requiredPrerequisites.includes(code));
  assert.equal(c.requiredPrerequisites.match(/以及/g).length, 2);
});

test('separates explicit recommended background without inventing requirements', () => {
  assert.deepEqual(prerequisiteSections('必要先修：COMP1011 或 COMP1012\n建议先修：AMA1110'), {
    required: 'COMP1011 或 COMP1012', recommended: 'AMA1110', raw: '必要先修：COMP1011 或 COMP1012\n建议先修：AMA1110'
  });
  assert.equal(prerequisiteSections('建议先修：AMA1110').required, '资料未提供，需核实');
  assert.equal(prerequisiteSections('').required, '资料未提供，需核实');
  assert.match(prerequisiteSections('无').required, /^无/);
});

test('simulated ratings stay in range, have one-decimal precision and remain stable', () => {
  for (let i = 0; i < 150; i++) {
    const row = { code: `TEST${i}` }, a = courseRating(row), b = courseRating(row);
    assert.deepEqual(a, b);
    assert.ok(a.rating >= 4 && a.rating <= 5);
    assert.equal(a.rating, Number(a.rating.toFixed(1)));
    assert.equal(a.ratingSource, 'simulated');
  }
  assert.deepEqual(courseRating({ rating: 3.2 }), { rating: 3.2, ratingSource: 'catalogue' });
  assert.equal(courseRating({ rating: 0 }).ratingSource, 'catalogue');
  assert.equal(courseRating({ rating: '' }).ratingSource, 'simulated');
});

test('limits summaries to 500 Unicode characters and rejects ungrounded cards', () => {
  const c = normalizeCourseResponse({ text: '介绍', courses: [{ code: 'DSAI2201', summary: '课'.repeat(501) }, { code: 'FAKE9999' }] }, [dsai], '介绍课程').courses;
  assert.equal(c.length, 1);
  assert.equal(Array.from(c[0].summary).length, 500);
});

test('explicit questions and semester plans receive the same format even if model omits cards', () => {
  const a = normalizeCourseResponse({ text: '介绍', semesters: [{ courses: ['DSAI2201 · Data Structures and Algorithms'] }] }, [dsai], '帮我规划');
  assert.equal(a.courses[0].format, 'course-introduction-v1');
  assert.equal(normalizeCourseResponse({ text: '你好' }, [], '你好').courses.length, 0);
  assert.equal(normalizeCourseResponse({ text: '未找到' }, [dsai], 'FAKE9999是什么').courses.length, 0);
});

test('knowledge excerpts do not truncate prerequisite logic', () => {
  const raw = 'COMP1011 或 COMP1012，以及 '.repeat(30) + 'AMA2111';
  assert.ok(formatCatalogue([{ ...dsai, prerequisites: raw }]).includes(raw));
});

test('read aloud includes objectives, simulated label and both prerequisite sections', () => {
  const answer = normalizeCourseResponse({ text: '介绍' }, [dsai], '介绍DSAI2201');
  const text = narrationFor(answer);
  assert.ok(text.includes(dsai.objectives));
  assert.match(text, /模拟评分，非真实学生评价/);
  assert.match(text, /必要先修/);
  assert.match(text, /建议先修/);
});
