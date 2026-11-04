import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDataset, splitCourseGroups, sha256 } from '../scripts/finetuning/dataset.mjs';
import { auditDataset, approvedRecords } from '../scripts/finetuning/validation.mjs';
import { buildUserContent } from '../server/qwen-advisor.mjs';
import { scoreRawAnswer } from '../scripts/finetuning/metrics.mjs';
import { qualityIssues } from '../scripts/finetuning/quality.mjs';

const catalogue = Array.from({ length: 20 }, (_, i) => ({
  code: `COMP${1000 + i}`, name: `Subject ${i}`, department: 'comp', credits: 3, level: '1',
  description: `第${i}课程介绍。\n1. 专题${i}甲\n2. 专题${i}乙`, objectives: `掌握第${i}项能力`, prerequisites: '无'
}));

test('content triage rejects clipped text and source contradictions without claiming human review', () => {
  const item = generateDataset(catalogue, 'Test system').records.find(row => row.targetCodes.length);
  const source = new Map(catalogue.map(row => [row.code, row]));
  const bad = structuredClone(item), answer = JSON.parse(bad.record.messages[2].content);
  answer.courses[0].summary = '1. 第一项\n2. 第二项…';
  answer.courses[0].learningOutcomes = ['线性代数'];
  bad.record.messages[2].content = JSON.stringify(answer);
  const issues = qualityIssues(bad, source);
  for (const flag of ['truncated_summary', 'syllabus_dump', 'too_few_learning_outcomes', 'topic_fragment_in_outcome']) assert.ok(issues.includes(flag));
});

test('prerequisite training targets preserve complete raw conditions including exclusions', () => {
  const raw = 'COMP1011 或 COMP1012，以及 神经网络（COMP4001）；排除课程：DSAI2201';
  const rows = catalogue.map((c, i) => i ? c : { ...c, prerequisites: raw });
  const target = generateDataset(rows, 'Test system').records.find(r => r.task === 'prerequisite_explanation' && r.sourceCodes.includes('COMP1000'));
  const answer = JSON.parse(target.record.messages[2].content);
  assert.equal(answer.courses[0].preparation.sourceText, raw);
  assert.equal(Object.keys(answer.courses[0]).at(-1), 'preparation');
  assert.ok(!answer.courses[0].summary.includes(raw));
  assert.ok(!JSON.stringify(answer.courses[0].preparation.levels).includes('DSAI2201'));
});

test('recommendation samples do not present aliases of the same named course as distinct options', () => {
  const rows = catalogue.map(c => ({ ...c, name: 'Machine Learning' }));
  const data = generateDataset(rows, 'Test system');
  const recommendations = data.records.filter(r => r.task === 'recommendation');
  assert.ok(recommendations.length);
  assert.ok(recommendations.every(r => r.targetCodes.length === 1));
});

test('raw model metrics expose format and grounding failures before server correction', () => {
  const item = generateDataset(catalogue, 'Test system').records.find(row => row.targetCodes.length);
  assert.deepEqual(scoreRawAnswer('not json', item), { jsonValid: false });
  assert.equal(scoreRawAnswer(item.record.messages[2].content, item).sourceGrounding, true);
  const bad = { text: '推荐', courses: Array.from({ length: 4 }, () => ({ code: 'FAKE9999', summary: 'x'.repeat(501), rating: 4.8 })), overview: 'COMP9999', followUps: [] };
  const metrics = scoreRawAnswer(JSON.stringify(bad), item);
  for (const key of ['courseLimit', 'uniqueCards', 'sourceGrounding', 'summaryLength', 'overviewAlignment', 'followUps', 'noUiRatings']) assert.equal(metrics[key], false);
});

test('course-family split is reproducible and aliases stay in the same partition', () => {
  const source = [...catalogue, { ...catalogue[0], code: 'DSAI1000', department: 'dsai' }];
  const a = splitCourseGroups(source), b = splitCourseGroups([...source].reverse());
  assert.deepEqual(a.groupAssignments, b.groupAssignments);
  assert.ok(a.groupAssignments.some(group => group.codes.includes('COMP1000') && group.codes.includes('DSAI1000')));
  const assignment = a.groupAssignments.flatMap(group => group.codes.map(code => [code, group.split]));
  assert.equal(new Map(assignment).size, source.length);
});

test('drafts validate, have independent split sources, and never train random UI ratings', () => {
  const a = generateDataset(catalogue, 'Test system'), b = generateDataset(catalogue, 'Test system');
  assert.deepEqual(a.records, b.records);
  const report = auditDataset(a.records, a.groupAssignments);
  assert.deepEqual(report.errors, []);
  assert.equal(report.passed, true);
  const splitCodes = split => new Set(a.records.filter(row => row.split === split).flatMap(row => row.sourceCodes));
  assert.ok([...splitCodes('train')].every(code => !splitCodes('test').has(code)));
  assert.ok(a.records.some(row => row.task === 'unknown_rating'));
  assert.ok(a.records.every(row => !(JSON.parse(row.record.messages[2].content).courses || []).some(course => 'rating' in course)));
});

test('audit detects course leakage, stale content and more than three target cards', () => {
  const data = generateDataset(catalogue, 'Test system');
  const record = structuredClone(data.records.find(row => row.targetCodes.length));
  const answer = JSON.parse(record.record.messages[2].content);
  answer.courses = Array.from({ length: 4 }, () => answer.courses[0]);
  record.record.messages[2].content = JSON.stringify(answer);
  const report = auditDataset([record], [{ groupId: 'bad', split: 'test', codes: record.sourceCodes }]);
  assert.ok(report.errors.some(error => error.includes('hash mismatch')));
  assert.ok(report.errors.some(error => error.includes('More than three')));
  assert.ok(report.errors.some(error => error.includes('outside its assigned split')));
});

test('release selection refuses pending, stale and unsigned reviews', () => {
  const records = generateDataset(catalogue, 'Test system').records;
  const sample = records.find(row => row.split === 'train');
  assert.deepEqual(approvedRecords(records, [{ id: sample.id, status: 'pending' }], 'train'), []);
  assert.throws(() => approvedRecords(records, [{ id: sample.id, status: 'approved', contentHash: 'old', reviewer: 'test', notes: 'test' }], 'train'), /Stale approval/);
  const review = { id: sample.id, status: 'approved', contentHash: sha256(JSON.stringify(sample.record)), reviewer: '', notes: '' };
  assert.throws(() => approvedRecords(records, [review], 'train'), /Reviewer/);
  assert.equal(approvedRecords(records, [{ ...review, reviewer: 'Test fixture', notes: 'Synthetic approval used only in this unit test' }], 'train').length, 1);
});

test('runtime and training share continuation context input formatting', () => {
  const user = buildUserContent({ message: '继续推荐', catalogue: 'Only unseen records', recommendation: { more: true, query: '学习机器学习', seenCodes: ['COMP4432'] } });
  assert.match(user, /Original learning goal: 学习机器学习/);
  assert.match(user, /Already introduced course codes \(do not repeat\): COMP4432/);
  assert.match(user, /Reference documents: none uploaded/);
});
