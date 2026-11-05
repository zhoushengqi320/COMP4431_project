import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join, basename, relative } from 'node:path';
import { SYSTEM_PROMPT } from '../server/qwen-advisor.mjs';
import { generateDataset, sha256 } from './finetuning/dataset.mjs';
import { auditDataset } from './finetuning/validation.mjs';
import { CURATED_EXAMPLES } from './finetuning/curated-examples.mjs';

const destination = resolve(process.argv[2] || 'finetuning/v1');
if (existsSync(destination)) throw new Error('Output already exists. Choose a new version directory; reviews will not be overwritten.');
const snapshot = readFileSync('data/courses.json', 'utf8');
const data = JSON.parse(snapshot);
const generated = generateDataset(data.courses, SYSTEM_PROMPT);
const audit = auditDataset(generated.records, generated.groupAssignments);
if (!audit.passed) throw new Error(`Draft construction failed validation: ${audit.errors.join('; ')}`);
mkdirSync(join(destination, 'drafts'), { recursive: true });
const write = (name, value) => writeFileSync(join(destination, name), `${JSON.stringify(value, null, 2)}\n`);
const index = generated.records.map(({ record, ...meta }) => meta);
const stats = {};
for (const split of ['train', 'validation', 'test']) {
  const rows = generated.records.filter(record => record.split === split);
  const text = rows.map(row => JSON.stringify(row.record)).join('\n') + '\n';
  writeFileSync(join(destination, 'drafts', `${split}.jsonl`), text);
  stats[split] = {
    samples: rows.length, courseCount: generated.partitions[split].length,
    utf8Bytes: Buffer.byteLength(text), fileHash: sha256(text),
    tasks: Object.fromEntries([...new Set(rows.map(row => row.task))].map(task => [task, rows.filter(row => row.task === task).length]))
  };
}
write('manifest.json', {
  version: basename(destination), createdAt: new Date().toISOString(), status: 'draft_pending_review',
  source: { path: 'data/courses.json', sha256: sha256(snapshot), origin: data.source, fetchedAt: data.fetched_at, totalRecords: data.courses.length },
  departments: ['comp', 'dsai', 'ama'], eligibleCourses: generated.eligibleCount,
  construction: 'Deterministic local templates/extracts; no paid teacher calls; NOT human-authored gold answers',
  aiAssistedRewrittenCourses: Object.keys(CURATED_EXAMPLES),
  systemPromptHash: sha256(SYSTEM_PROMPT),
  grouping: 'Shared course-code aliases OR same normalized title OR exact description OR >=0.85 character-trigram Jaccard; deterministic group split 80/10/10',
  stats, groupAssignments: generated.groupAssignments,
  warnings: ['All samples require semantic/factual review.', 'Chinese-only draft; not a multilingual benchmark.', 'Shared prompt templates across splits measure course generalization, not unseen task-template generalization.', 'Lexical grouping cannot rule out all semantic duplicates.', 'No training jobs, uploads, billing or model weights produced.']
});
write('index.json', index);
write('review.json', index.map(row => ({ id: row.id, contentHash: row.contentHash, status: 'pending', reviewer: '', notes: '' })));
write('validation-report.json', { recordedAt: new Date().toISOString(), ...audit });
mkdirSync('finetuning', { recursive: true });
writeFileSync('finetuning/current.json', JSON.stringify({ directory: relative(process.cwd(), destination).replaceAll('\\', '/'), status: 'draft_pending_review' }, null, 2));
const samples = ['course_introduction', 'learning_goals', 'prerequisite_explanation', 'recommendation', 'continue_recommendation', 'unknown_semester', 'unknown_rating', 'unknown_course', 'empty_retrieval', 'resist_fabrication', 'no_more_matches'];
const preview = ['# 微调样本复核预览', '', '全部为本地模板生成草稿；不是已审核答案。每条都应核对来源、回答事实、语言和现有 UI 格式。', ''];
for (const task of samples) {
  const row = generated.records.find(record => record.split === 'train' && record.task === task);
  if (!row) continue;
  const question = row.record.messages[1].content.split('\nStudent profile:')[0];
  preview.push(`## ${row.id}`, '', `来源课程：${row.sourceCodes.join('、') || '无（空检索场景）'}`, '', question, '', '```json', JSON.stringify(JSON.parse(row.record.messages[2].content), null, 2), '```', '');
}
for (const code of ['DSAI2201', 'COMP4431', 'COMP4432', 'DSAI4203', 'COMP5541', 'AMA4680']) {
  const row = generated.records.find(record => record.task === 'course_introduction' && record.targetCodes.includes(code));
  if (!row) continue;
  preview.push(`## 核心课程改写示例：${row.id}`, '', 'AI 辅助改写，仍待人工复核；来源仅为本地课程库。', '', '```json', JSON.stringify(JSON.parse(row.record.messages[2].content), null, 2), '```', '');
}
writeFileSync(join(destination, 'REVIEW_PREVIEW.md'), preview.join('\n'));
console.log(JSON.stringify({ destination, stats, status: 'draft_pending_review', networkCalls: 0 }, null, 2));
