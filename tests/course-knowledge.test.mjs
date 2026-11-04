import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCourseCodes, formatCatalogue, retrieveCourses, scoreCourse } from '../server/course-knowledge.mjs';

const catalogue = [
  { code: 'COMP4431', name: 'Artificial Intelligence', department: 'comp', faculty: 'Faculty of Engineering', credits: 3, level: '4', description: 'Search, knowledge representation and machine learning.', objectives: 'Introduce AI methods.', prerequisites: 'COMP2021' },
  { code: 'COMP4423', name: 'Computer Vision', department: 'comp', faculty: 'Faculty of Engineering', credits: 3, level: '4', description: 'Image processing and visual recognition.', prerequisites: 'COMP2011' },
  { code: 'FSN4421', name: 'Food Engineering and Processing II Laboratory', department: 'fsn', faculty: 'Faculty of Science', credits: 1, description: '脱水与热加工实验' }
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

test('unrelated courses score zero against a computing query', () => {
  assert.equal(scoreCourse(catalogue[2], { queryText: 'machine learning', queryTokens: ['machine', 'learning'], codes: [], department: 'comp' }) <
    scoreCourse(catalogue[0], { queryText: 'machine learning', queryTokens: ['machine', 'learning'], codes: [], department: 'comp' }), true);
});
