import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditDataset } from './finetuning/validation.mjs';
import { sha256 } from './finetuning/dataset.mjs';

export function resolveDatasetDirectory(argument) {
  if (argument) return resolve(argument);
  if (existsSync('finetuning/current.json')) return resolve(JSON.parse(readFileSync('finetuning/current.json')).directory);
  return resolve('finetuning/v1');
}

export function loadDataset(directory) {
  const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json')));
  const index = JSON.parse(readFileSync(join(directory, 'index.json')));
  const records = [];
  for (const split of ['train', 'validation', 'test']) {
    const text = readFileSync(join(directory, 'drafts', `${split}.jsonl`), 'utf8');
    if (sha256(text) !== manifest.stats[split].fileHash) throw new Error(`File changed without rebuilding manifest: ${split}`);
    const lines = text.trim().split('\n');
    const items = index.filter(row => row.split === split);
    if (lines.length !== items.length || lines.length !== manifest.stats[split].samples) throw new Error(`Line/index/manifest mismatch: ${split}`);
    lines.forEach((line, i) => records.push({ ...items[i], record: JSON.parse(line) }));
  }
  return { manifest, records };
}

export function validateDirectory(directory) {
  const { manifest, records } = loadDataset(directory);
  const report = { recordedAt: new Date().toISOString(), ...auditDataset(records, manifest.groupAssignments) };
  writeFileSync(join(directory, 'validation-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = validateDirectory(resolveDatasetDirectory(process.argv[2]));
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}
