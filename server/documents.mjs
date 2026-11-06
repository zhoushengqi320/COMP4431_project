import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

export const DOCUMENT_LIMITS = Object.freeze({
  requestBytes: 25 * 1024 * 1024,
  fileBytes: 10 * 1024 * 1024,
  files: 8,
  fileCharacters: 60_000,
  totalCharacters: 120_000,
  pdfPages: 40,
  parserTimeoutMs: 10_000
});
const TEXT_TYPES = {
  txt: ['text/plain'], csv: ['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel'],
  md: ['text/markdown', 'text/plain'], json: ['application/json', 'text/plain']
};
const BINARY_TYPES = {
  pdf: ['application/pdf'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document']
};

export function cleanText(value) {
  return String(value || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/\r\n?/g, '\n').trim();
}

function textFromBuffer(buffer) {
  let encoding = 'utf-8';
  if (buffer[0] === 0xff && buffer[1] === 0xfe) encoding = 'utf-16le';
  if (buffer[0] === 0xfe && buffer[1] === 0xff) encoding = 'utf-16be';
  const text = new TextDecoder(encoding, { fatal: true }).decode(buffer);
  if (text.includes('\0')) throw new Error('This file contains binary data. Export it as UTF-8 text.');
  return cleanText(text);
}

// Inspect ZIP metadata before Mammoth expands a DOCX; no archive files are written to disk.
function checkDocxArchive(buffer) {
  if (buffer.readUInt32LE(0) !== 0x04034b50) throw new Error('This is not a valid DOCX document.');
  let footer = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { footer = i; break; }
  }
  if (footer < 0) throw new Error('This DOCX archive is incomplete.');
  const entries = buffer.readUInt16LE(footer + 10);
  const directorySize = buffer.readUInt32LE(footer + 12);
  let cursor = buffer.readUInt32LE(footer + 16);
  if (entries > 2000 || cursor + directorySize > footer) throw new Error('This DOCX archive exceeds the parsing limits.');
  let expanded = 0;
  let documentFound = false;
  for (let i = 0; i < entries; i++) {
    if (cursor + 46 > footer || buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('This DOCX archive is invalid.');
    const flags = buffer.readUInt16LE(cursor + 8);
    const uncompressed = buffer.readUInt32LE(cursor + 24);
    const nameSize = buffer.readUInt16LE(cursor + 28);
    const extraSize = buffer.readUInt16LE(cursor + 30);
    const commentSize = buffer.readUInt16LE(cursor + 32);
    const next = cursor + 46 + nameSize + extraSize + commentSize;
    if (next > footer || (flags & 1)) throw new Error('Encrypted or invalid DOCX files are not supported.');
    expanded += uncompressed;
    if (uncompressed > 16 * 1024 * 1024 || expanded > 40 * 1024 * 1024) {
      throw new Error('This DOCX expands beyond the 40 MiB parsing limit.');
    }
    documentFound ||= buffer.subarray(cursor + 46, cursor + 46 + nameSize).toString() === 'word/document.xml';
    cursor = next;
  }
  if (!documentFound) throw new Error('This archive does not contain a Word document.');
}

async function parseBinary(extension, bytes) {
  const buffer = Buffer.from(bytes);
  const warnings = [];
  if (extension === 'docx') {
    checkDocxArchive(buffer);
    const mammoth = (await import('mammoth')).default;
    const result = await mammoth.extractRawText({ buffer });
    if (result.messages.length) warnings.push('Some Word document formatting or embedded elements could not be read.');
    return { text: cleanText(result.value), warnings };
  }
  if (!buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new Error('This is not a valid PDF document.');
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({
    data: new Uint8Array(buffer), isEvalSupported: false, useSystemFonts: false,
    disableFontFace: true, useWorkerFetch: false, verbosity: 0
  });
  try {
    const pdf = await task.promise;
    const pages = [];
    let characters = 0;
    let emptyPages = 0;
    if (pdf.numPages > DOCUMENT_LIMITS.pdfPages) warnings.push(`Only the first ${DOCUMENT_LIMITS.pdfPages} of ${pdf.numPages} PDF pages were read.`);
    for (let number = 1; number <= Math.min(pdf.numPages, DOCUMENT_LIMITS.pdfPages); number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const text = cleanText(content.items.map(item => typeof item.str === 'string' ? `${item.str}${item.hasEOL ? '\n' : ' '}` : '').join(''));
      page.cleanup();
      if (!text) { emptyPages++; continue; }
      pages.push(`[Page ${number}]\n${text}`);
      characters += text.length;
      if (characters > DOCUMENT_LIMITS.fileCharacters) {
        warnings.push(`PDF extraction stopped after ${number} pages because the text limit was reached.`);
        break;
      }
    }
    if (!pages.length) throw new Error('No readable text was found. This may be a scanned PDF; OCR is not supported.');
    if (emptyPages) warnings.push(`${emptyPages} PDF page(s) had no extractable text; scanned pages need OCR.`);
    return { text: pages.join('\n\n'), warnings };
  } finally {
    await task.destroy();
  }
}

function parseInWorker(extension, buffer) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), {
      workerData: { task: 'extract-document', extension, bytes: buffer },
      resourceLimits: { maxOldGenerationSizeMb: 192, maxYoungGenerationSizeMb: 32 }
    });
    let finished = false;
    const finish = (error, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      void worker.terminate();
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error('Parsing timed out. Try a smaller document or export it as text.')), DOCUMENT_LIMITS.parserTimeoutMs);
    worker.once('message', result => finish(result.error ? new Error(result.error) : null, result));
    worker.once('error', () => finish(new Error('The document could not be read within the parsing limits.')));
    worker.once('exit', code => {
      if (!finished) finish(new Error(`The document parser stopped before completing${code ? ' within its resource limits' : ''}.`));
    });
  });
}

/** Parse selected files independently; a damaged file never discards valid neighbours. */
export async function extractDocuments(files) {
  if (files.length > DOCUMENT_LIMITS.files) {
    throw Object.assign(new Error(`Select no more than ${DOCUMENT_LIMITS.files} files per message.`), { status: 413 });
  }
  const documents = [];
  const warnings = [];
  let total = 0;
  for (const entry of files) {
    const file = entry.file || entry;
    const name = cleanText(file.name || 'Unnamed file').replace(/[\/\\]/g, '_').slice(0, 180);
    try {
      if (file.size > DOCUMENT_LIMITS.fileBytes) throw new Error('The file exceeds the 10 MiB limit.');
      if (!file.size) throw new Error('The file is empty.');
      const extension = name.split('.').pop().toLowerCase();
      const types = TEXT_TYPES[extension] || BINARY_TYPES[extension];
      if (!types) throw new Error('Unsupported file type. Use PDF, DOCX, TXT, CSV, Markdown or JSON.');
      const mime = (file.type || '').split(';')[0].toLowerCase();
      if (mime && mime !== 'application/octet-stream' && !types.includes(mime)) throw new Error('The file type does not match its extension.');
      const buffer = Buffer.from(await file.arrayBuffer());
      if (buffer.length > DOCUMENT_LIMITS.fileBytes) throw new Error('The file exceeds the 10 MiB limit.');
      const result = TEXT_TYPES[extension]
        ? { text: textFromBuffer(buffer), warnings: [] }
        : await parseInWorker(extension, buffer);
      const text = cleanText(result.text);
      if (!text) throw new Error('No readable text was found in this file.');
      const remaining = DOCUMENT_LIMITS.totalCharacters - total;
      if (remaining <= 0) throw new Error('The combined 120,000-character limit has been reached.');
      const limit = Math.min(remaining, DOCUMENT_LIMITS.fileCharacters);
      if (text.length > limit) warnings.push(`${name}: only the first ${limit.toLocaleString('en-US')} characters were used.`);
      warnings.push(...result.warnings.map(warning => `${name}: ${warning}`));
      const clipped = text.slice(0, limit);
      documents.push({ name, text: clipped, category: cleanText(entry.category || 'Reference document').slice(0, 80) });
      total += clipped.length;
    } catch (error) {
      const detail = error instanceof TypeError ? 'The file is not valid UTF-8 or UTF-16 text.' : error.message;
      warnings.push(`${name}: ${detail || 'The document could not be read.'}`);
    }
  }
  return { documents, warnings };
}

if (!isMainThread && workerData?.task === 'extract-document') {
  try {
    parentPort.postMessage(await parseBinary(workerData.extension, workerData.bytes));
  } catch (error) {
    const message = error.name === 'PasswordException'
      ? 'Password-protected PDFs are not supported. Export an unlocked copy.'
      : /PDF|DOCX|Word|archive|readable|OCR|encrypted|scanned|parsing/i.test(error.message)
        ? error.message.slice(0, 240)
        : 'The document is damaged or cannot be read. Try exporting it as text.';
    parentPort.postMessage({ error: message });
  }
}
