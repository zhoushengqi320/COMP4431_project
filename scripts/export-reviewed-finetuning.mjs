import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { loadDataset, resolveDatasetDirectory } from './validate-finetuning.mjs';
import { auditDataset, approvedRecords } from './finetuning/validation.mjs';
import { sha256 } from './finetuning/dataset.mjs';

const allowAiPilot = process.argv.includes('--allow-ai-pilot');
const directory = resolveDatasetDirectory(process.argv.slice(2).find(arg => !arg.startsWith('--')));
const { manifest, records } = loadDataset(directory);
const audit = auditDataset(records, manifest.groupAssignments);
if (!audit.passed) throw new Error(`Draft validation failed: ${audit.errors.join('; ')}`);
const reviews = JSON.parse(readFileSync(join(directory, 'review.json'), 'utf8'));
const train = approvedRecords(records, reviews, 'train', { allowAiPilot }), validation = approvedRecords(records, reviews, 'validation', { allowAiPilot });
if (!train.length || !validation.length) throw new Error('No reviewed training/validation release. Review examples first; nothing was exported or uploaded.');
const destination = join(directory, 'reviewed-release');
if (existsSync(destination)) throw new Error('Release already exists. Create a new dataset version instead of overwriting it.');
mkdirSync(destination);
const files = {};
for (const [split, rows] of [['train', train], ['validation', validation]]) {
  const text = rows.map(row => JSON.stringify(row.record)).join('\n') + '\n';
  writeFileSync(join(destination, `${split}.jsonl`), text);
  files[split] = { samples: rows.length, sha256: sha256(text), bytes: Buffer.byteLength(text) };
}
writeFileSync(join(destination, 'release.json'), JSON.stringify({
  createdAt: new Date().toISOString(), status: allowAiPilot ? 'ai_rule_checked_pilot_not_approved_for_training' : 'reviewed_local_release_not_uploaded',
  files, sourceHash: manifest.source.sha256, approvalIds: [...train, ...validation].map(row => row.id),
  systemPromptHash: manifest.systemPromptHash,
  reviewTypes: [...new Set(reviews.filter(r => [...train, ...validation].some(item => item.id === r.id)).map(r => r.reviewType || 'unspecified'))],
  allowAiPilot, dataAcceptedForTraining: false,
  reviewScope: 'See review.json and review-summary.json; approval may be automated and does not imply human semantic review',
  testSetExported: false, paidTrainingAuthorized: false
}, null, 2));
console.log(JSON.stringify({ destination, files, networkCalls: 0, testSetExported: false }, null, 2));
