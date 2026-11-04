import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { loadDataset, resolveDatasetDirectory } from '../validate-finetuning.mjs';
import { SYSTEM_PROMPT } from '../../server/qwen-advisor.mjs';
import { approvedRecords, auditDataset } from './validation.mjs';
import { sha256 } from './dataset.mjs';

export function assertReleasePolicy({ manifest, release, sourceHash, promptHash, isCurrent, allowAiPilot }) {
  if (!isCurrent) throw new Error('Only the current dataset version may be uploaded.');
  if (release?.trainingJobId) throw new Error('Training was already submitted for this release. Inspect the recorded job instead of reuploading or submitting again.');
  if (!manifest || !release || /^superseded|invalid|obsolete/i.test(manifest.status || '') || /^superseded|invalid|obsolete/i.test(release.status || '')) throw new Error('This dataset/release is superseded or invalid.');
  if (!['reviewed_local_release_not_uploaded', 'ai_rule_checked_pilot_not_approved_for_training'].includes(release.status)) throw new Error('Unrecognized release state.');
  if (manifest.source?.sha256 !== sourceHash || release.sourceHash !== sourceHash) throw new Error('Release source snapshot is stale.');
  if (manifest.systemPromptHash !== promptHash || release.systemPromptHash !== promptHash) throw new Error('Release prompt/schema is stale; rebuild and review a new version.');
  const automatic = (release.reviewTypes || []).some(type => type.startsWith('automated')) || release.allowAiPilot;
  if (automatic && !allowAiPilot) throw new Error('This is an automated-rule pilot, not human approval. Use --allow-ai-pilot explicitly for local candidate workflows.');
}

export function loadVerifiedRelease(directory, { allowAiPilot = false } = {}) {
  const { manifest, records } = loadDataset(directory);
  const releasePath = join(directory, 'reviewed-release');
  const release = JSON.parse(readFileSync(join(releasePath, 'release.json'), 'utf8'));
  assertReleasePolicy({ manifest, release,
    sourceHash: sha256(readFileSync(manifest.source.path, 'utf8')), promptHash: sha256(SYSTEM_PROMPT),
    isCurrent: resolve(directory) === resolve(resolveDatasetDirectory()), allowAiPilot });
  const audit = auditDataset(records, manifest.groupAssignments);
  if (!audit.passed) throw new Error('Current dataset failed structural checks.');
  const reviews = JSON.parse(readFileSync(join(directory, 'review.json'), 'utf8'));
  const files = [];
  const expectedIds = [];
  for (const split of ['train', 'validation']) {
    const selected = approvedRecords(records, reviews, split, { allowAiPilot });
    if (!selected.length || selected.length !== release.files?.[split]?.samples) throw new Error(`Review/release sample count mismatch: ${split}`);
    const content = readFileSync(join(releasePath, `${split}.jsonl`));
    const expectedContent = selected.map(row => JSON.stringify(row.record)).join('\n') + '\n';
    if (sha256(content) !== release.files[split].sha256 || sha256(expectedContent) !== release.files[split].sha256) throw new Error(`Review/release content mismatch: ${split}`);
    expectedIds.push(...selected.map(row => row.id));
    files.push({ split, content, name: `polypath-${manifest.version}-${split}.jsonl` });
  }
  if (JSON.stringify(expectedIds) !== JSON.stringify(release.approvalIds)) throw new Error('Release approval IDs do not match the current reviews.');
  return { manifest, release, files };
}
