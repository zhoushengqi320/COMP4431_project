import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv } from 'vite';
import { resolveDatasetDirectory } from './validate-finetuning.mjs';
import { loadVerifiedRelease } from './finetuning/release-guard.mjs';

const directory = resolveDatasetDirectory();
const { release, files: pendingFiles } = loadVerifiedRelease(directory, { allowAiPilot: process.argv.includes('--allow-ai-pilot') });
const destination = join(directory, 'cloud-upload-compatible.json');
if (existsSync(destination)) throw new Error('An upload record already exists; inspect it instead of duplicating remote files.');
if (!process.argv.includes('--upload')) {
  console.log(JSON.stringify({ mode: 'dry_run', files: release.files, trainingCreated: false, testSetUploaded: false }));
} else {
  const env = loadEnv('development', process.cwd(), '');
  const key = env.QWEN_API_KEY || env.DASHSCOPE_API_KEY;
  if (!key) throw new Error('Qwen API key required');
  if (new URL(env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').hostname !== 'dashscope.aliyuncs.com') throw new Error('Proposed Beijing region does not match current configuration');
  const report = {
    recordedAt: new Date().toISOString(), host: 'dashscope.aliyuncs.com', interface: 'compatible-mode/v1/files',
    uploadedFiles: [], failedFiles: [],
    releaseFiles: release.files, trainingCreated: false, paidTrainingAuthorized: false, testSetUploaded: false
  };
  // Persist uncertainty before network I/O so a timeout cannot silently cause duplicate reuploads.
  report.status = 'upload_attempt_started';
  writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`);
  for (const file of pendingFiles) {
    const form = new FormData();
    form.append('file', new Blob([file.content], { type: 'application/jsonl' }), file.name);
    form.append('purpose', 'fine-tune');
    const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/files', {
      method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(60000)
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.id) report.uploadedFiles.push({ file_id: result.id, name: result.filename || file.name, split: file.split, status: result.status, bytes: result.bytes });
    else report.failedFiles.push({ name: file.name, httpStatus: response.status, code: result.code || result.error?.code || 'Unknown' });
    writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`);
    if (report.failedFiles.length) break;
  }
  report.status = report.uploadedFiles.length === 2 && !report.failedFiles.length ? 'uploaded_not_trained' : 'incomplete_inspect_before_retry';
  writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ uploadedCount: report.uploadedFiles.length,
    failedCount: report.failedFiles.length, trainingCreated: false, testSetUploaded: false }));
  if (report.failedFiles.length || report.uploadedFiles.length !== 2) throw new Error('Upload not fully successful; inspect cloud-upload-compatible.json. No training task was created.');
}
