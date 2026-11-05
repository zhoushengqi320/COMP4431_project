import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadDataset, resolveDatasetDirectory } from './validate-finetuning.mjs';
import { auditDataset } from './finetuning/validation.mjs';
import { qualitySummary } from './finetuning/quality.mjs';
import { sha256 } from './finetuning/dataset.mjs';

const directory = resolveDatasetDirectory(process.argv[2]);
const { records, manifest } = loadDataset(directory);
const sourceText = readFileSync(manifest.source.path, 'utf8');
if (sha256(sourceText) !== manifest.source.sha256) throw new Error('Source snapshot changed; review against the recorded version');
const audit = auditDataset(records, manifest.groupAssignments);
if (!audit.passed) throw new Error('Structural checks failed');
const report = qualitySummary(records, JSON.parse(sourceText).courses);
const reviewer = 'Codex local source/rule audit (automated; not human semantic approval)';
const existing = JSON.parse(readFileSync(join(directory, 'review.json'), 'utf8'));
if (existing.some(row => row.status !== 'pending')) throw new Error('Reviews already exist; preserve them and use a new dataset version');
const reviews = report.details.map(row => ({
  id: row.id, contentHash: row.contentHash,
  status: row.issues.length ? 'rejected' : 'rules_checked',
  reviewType: 'automated_source_and_quality_check', reviewer,
  notes: row.issues.length ? `Excluded from pilot: ${row.issues.join(', ')}`
    : `Pilot candidate passed structural, source-version, course-code, length, task and readability rules. Source SHA256=${manifest.source.sha256}. Generated from local catalogue fields; no external fact verification or human semantic approval.`,
  issues: row.issues
}));
const summary = {
  recordedAt: new Date().toISOString(), reviewer, sourceHash: manifest.source.sha256,
  reviewScope: 'Automated source/rule review for a limited pilot, not full human semantic review',
  paidTrainingAuthorized: false, humanApprovals: 0,
  counts: Object.fromEntries(['train', 'validation', 'test'].map(split => [split, {
    total: report.details.filter(r => r.split === split).length,
    rulesCheckedCandidate: report.details.filter(r => r.split === split && !r.issues.length).length,
    excluded: report.details.filter(r => r.split === split && r.issues.length).length
  }])), issueCounts: report.issueCounts
};
writeFileSync(join(directory, 'review.json'), `${JSON.stringify(reviews, null, 2)}\n`);
writeFileSync(join(directory, 'quality-triage.json'), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(join(directory, 'review-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
const excluded = report.details.filter(row => row.issues.length);
writeFileSync(join(directory, 'EXCLUDED.md'), ['# 本轮隔离样本', '', '仅记录自动化规则发现的问题，不表示其他样本全部语义正确。', '',
  '| 样本 | 原因 |', '| --- | --- |', ...excluded.map(row => `| ${row.id} | ${row.issues.join(', ')} |`), ''].join('\n'));
console.log(JSON.stringify(summary, null, 2));
