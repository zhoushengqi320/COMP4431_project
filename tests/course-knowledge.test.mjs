import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCourseCodes, formatCatalogue, getCourses, hasNoPrerequisite, resetCourseCache, retrieveCourses, scoreCourse, searchCourses } from '../server/course-knowledge.mjs';
import { parseSearchPlan } from '../server/course-search.mjs';

const catalogue = [
  { code: 'COMP4431', name: 'Artificial Intelligence', department: 'comp', faculty: 'Faculty of Engineering', credits: 3, level: '4', description: 'Search, knowledge representation and machine learning.', objectives: 'Introduce AI methods.', prerequisites: 'COMP2021' },
  { code: 'COMP4423', name: 'Computer Vision', department: 'comp', faculty: 'Faculty of Engineering', credits: 3, level: '4', description: 'Image processing and visual recognition.', prerequisites: 'COMP2011' },
  { code: 'ABCT1741', name: 'General Chemistry I', department: 'abct', faculty: 'Faculty of Science', credits: 3, level: '1', description: 'Introductory chemistry for science students.', objectives: 'Cover atomic structure and chemical bonding.', prerequisites: '无' },
  { code: 'ABCT1001', name: 'Quantitative Skills for Chemical and Life Sciences', department: 'abct', faculty: 'Faculty of Science', credits: 3, level: '1', description: 'Numeracy for science students.', prerequisites: '无先修课程' },
  { code: 'FSN4421', name: 'Food Engineering and Processing II Laboratory', department: 'fsn', faculty: 'Faculty of Science', credits: 1, description: '脱水与热加工实验', prerequisites: 'FSN3202' }
];

test('extracts PolyU-style course codes from a question', () => {
  assert.deepEqual(extractCourseCodes('Can I take COMP 4431 after COMP2021?'), ['COMP4431', 'COMP2021']);
});

test('retrieves computing and machine-learning courses instead of unrelated subjects', () => {
  const hits = retrieveCourses(catalogue, {
    message: '我想学机器学习，有哪些课？',
    profile: { programme: 'BSc (Hons) in Computing', interests: 'machine learning' }
  });
  assert.equal(hits.some(course => course.code === 'COMP4431'), true);
  assert.equal(hits[0].department, 'comp');
  assert.equal(hits.some(course => course.code === 'FSN4421'), false);
});

test('an explicit course code outranks department bias', () => {
  const hits = retrieveCourses(catalogue, { message: 'Tell me about FSN4421' });
  assert.equal(hits[0].code, 'FSN4421');
});

test('catalogue formatting keeps codes that Qwen must copy', () => {
  const text = formatCatalogue(catalogue.slice(0, 1));
  assert.match(text, /COMP4431/);
  assert.match(text, /Artificial Intelligence/);
});

test('chinese subject words retrieve english-titled catalogue courses', () => {
  const hits = retrieveCourses(catalogue, { message: '给我推荐化学课' });
  assert.equal(hits.some(course => course.code === 'ABCT1741'), true);
  assert.equal(hits.some(course => course.code === 'COMP4431'), false);
});

test('Qwen search plans retrieve no-prerequisite courses without a local translation list', () => {
  assert.equal(hasNoPrerequisite({ prerequisites: '无' }), true);
  assert.equal(hasNoPrerequisite({ prerequisites: '无机化学I先修课程' }), false);
  assert.equal(hasNoPrerequisite({ prerequisites: 'COMP2021' }), false);
  const plan = parseSearchPlan('{"keywords":[],"courseCodes":[],"noPrerequisite":true,"department":""}');
  const hits = searchCourses(catalogue, plan);
  assert.equal(hits.every(course => hasNoPrerequisite(course)), true);
  assert.equal(hits.some(course => course.code === 'ABCT1741'), true);
  assert.equal(hits.some(course => course.code === 'COMP4431'), false);
  const chemistry = searchCourses(catalogue, parseSearchPlan('{"keywords":["chemistry","化学"],"noPrerequisite":true}'));
  assert.equal(chemistry.some(course => course.code === 'ABCT1741'), true);
  assert.equal(parseSearchPlan('{"text":"介绍","courses":[{"code":"DSAI2201"}]}'), null);
});

test('unrelated courses score zero against a computing query', () => {
  assert.equal(scoreCourse(catalogue[2], { queryText: 'machine learning', queryTokens: ['machine', 'learning'], codes: [], department: 'comp' }) <
    scoreCourse(catalogue[0], { queryText: 'machine learning', queryTokens: ['machine', 'learning'], codes: [], department: 'comp' }), true);
});

test('getCourses uses live Supabase rows and does not fall back to the local snapshot', async () => {
  resetCourseCache();
  const original = globalThis.fetch;
  const live = [{ code: 'LIVE1001', name: 'Live Database Course' }];
  globalThis.fetch = async () => ({ ok: true, json: async () => live });
  try {
    const courses = await getCourses({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'test-key' });
    assert.equal(courses.length, 1);
    assert.equal(courses[0].code, 'LIVE1001');
    globalThis.fetch = async () => { throw new Error('network down'); };
    resetCourseCache();
    await assert.rejects(
      () => getCourses({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'test-key' }),
      /network down|Supabase/
    );
  } finally {
    globalThis.fetch = original;
    resetCourseCache();
  }
});
