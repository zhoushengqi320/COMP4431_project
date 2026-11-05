import test from 'node:test';
import assert from 'node:assert/strict';
import { extractDocuments, DOCUMENT_LIMITS } from '../server/documents.mjs';

function pdf(text) {
  const content = text ? `BT /F1 12 Tf 40 750 Td (${text.replace(/[()\\]/g, '\\$&')}) Tj ET` : '';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`
  ];
  let result = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(result));
    result += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(result);
  result += `xref\n0 6\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
  result += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(result);
}

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
  }
  return (value ^ 0xffffffff) >>> 0;
}

function docx(text) {
  const files = {
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`
  };
  const entries = [];
  const directory = [];
  let offset = 0;
  for (const [path, value] of Object.entries(files)) {
    const name = Buffer.from(path);
    const data = Buffer.from(value);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc32(data), 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc32(data), 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    entries.push(local, name, data); directory.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const central = Buffer.concat(directory);
  const footer = Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50, 0); footer.writeUInt16LE(3, 8); footer.writeUInt16LE(3, 10);
  footer.writeUInt32LE(central.length, 12); footer.writeUInt32LE(offset, 16);
  return Buffer.concat([...entries, central, footer]);
}

test('plain text, CSV and UTF-16 documents preserve content and remove control characters', async () => {
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('毕业要求：120学分', 'utf16le')]);
  const result = await extractDocuments([
    new File(['COMP4431\u0001 Artificial Intelligence\r\n3 credits'], 'courses.txt', { type: 'text/plain' }),
    new File(['code,title\nCOMP4432,Machine Learning'], 'courses.csv', { type: 'text/csv' }),
    new File([utf16], 'requirements.txt')
  ]);
  assert.equal(result.documents.length, 3);
  assert.match(result.documents[0].text, /COMP4431 Artificial Intelligence\n3 credits/);
  assert.match(result.documents[1].text, /COMP4432/);
  assert.match(result.documents[2].text, /毕业要求/);
  assert.deepEqual(result.warnings, []);
});

test('PDF and DOCX text is actually extracted with PDF page evidence', async () => {
  const result = await extractDocuments([
    new File([pdf('COMP4431 Artificial Intelligence: prerequisite COMP2011.')], 'syllabus.pdf', { type: 'application/pdf' }),
    new File([docx('COMP4432 Machine Learning requires linear algebra preparation.')], 'requirements.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
  ]);
  assert.equal(result.documents.length, 2, result.warnings.join('\n'));
  assert.match(result.documents[0].text, /\[Page 1\]/);
  assert.match(result.documents[0].text, /prerequisite COMP2011/);
  assert.match(result.documents[1].text, /linear algebra preparation/);
});

test('scanned, corrupt, unsupported and mismatched files produce per-file warnings without dropping valid text', async () => {
  const result = await extractDocuments([
    new File([pdf('')], 'scanned.pdf', { type: 'application/pdf' }),
    new File(['not a PDF'], 'broken.pdf', { type: 'application/pdf' }),
    new File(['not a workbook'], 'grades.xlsx'),
    new File(['text'], 'bad.txt', { type: 'image/png' }),
    new File(['COMP4431: 3 credits'], 'valid.md', { type: 'text/markdown' })
  ]);
  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0].name, 'valid.md');
  assert.equal(result.warnings.length, 4);
  assert.match(result.warnings.join('\n'), /OCR is not supported/);
  assert.match(result.warnings.join('\n'), /Unsupported file type/);
  assert.match(result.warnings.join('\n'), /does not match/);
});

test('file count, size, extraction and expanded DOCX limits are enforced', async () => {
  await assert.rejects(extractDocuments(Array.from({ length: 9 }, () => new File(['a'], 'file.txt'))), error => error.status === 413);
  const oversized = { name: 'large.txt', size: DOCUMENT_LIMITS.fileBytes + 1, type: 'text/plain', arrayBuffer() { throw new Error('Must reject before reading'); } };
  const large = await extractDocuments([oversized, new File(['x'.repeat(70_000)], 'long.txt')]);
  assert.equal(large.documents[0].text.length, DOCUMENT_LIMITS.fileCharacters);
  assert.match(large.warnings.join('\n'), /10 MiB/);
  assert.match(large.warnings.join('\n'), /60,000/);
  const archive = docx('hello');
  const directory = archive.readUInt32LE(archive.length - 6);
  archive.writeUInt32LE(100 * 1024 * 1024, directory + 24);
  const bomb = await extractDocuments([new File([archive], 'expansion.docx')]);
  assert.equal(bomb.documents.length, 0);
  assert.match(bomb.warnings.join('\n'), /expands beyond/);
});

test('invalid UTF-8 and binary disguised as text are not silently interpreted', async () => {
  const result = await extractDocuments([
    new File([new Uint8Array([0xff, 0x00, 0x90])], 'invalid.txt'),
    new File(['hello\0binary'], 'binary.csv'),
    new File([], 'empty.txt')
  ]);
  assert.equal(result.documents.length, 0);
  assert.equal(result.warnings.length, 3);
  assert.match(result.warnings.join('\n'), /UTF-8|binary|empty/);
});
