import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const roots = ['src', 'server', 'tests', 'knowledge', 'prompts', 'evaluation', 'docs', 'examples', 'scripts'];
const top = ['README.md', 'package.json', 'package-lock.json', 'vite.config.js', 'index.html', '.env.example', '.gitignore'];
const files = [...top];
async function walk(folder) {
  for (const entry of await readdir(join(root, folder), { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) await walk(path);
    else if (/\.(m?js|jsx|css|json|md|txt|html|csv|sql)$/.test(entry.name)) files.push(path);
  }
}
for (const folder of roots) await walk(folder);
const table = Array.from({ length: 256 }, (_, n) => {
  let value = n;
  for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(buffer) { let crc = 0xffffffff; for (const byte of buffer) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
// Small, dependency-free ZIP writer (stored entries). Private data is excluded by the allowlist above.
const entries = [], directory = []; let offset = 0;
for (const file of files.sort()) {
  const name = Buffer.from(`PolyPath/${file.replaceAll('\\', '/')}`);
  const bytes = await readFile(join(root, file));
  const crc = crc32(bytes);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6);
  header.writeUInt16LE(33, 12); header.writeUInt32LE(crc, 14); header.writeUInt32LE(bytes.length, 18); header.writeUInt32LE(bytes.length, 22); header.writeUInt16LE(name.length, 26);
  entries.push(header, name, bytes);
  const record = Buffer.alloc(46);
  record.writeUInt32LE(0x02014b50); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6); record.writeUInt16LE(0x800, 8);
  record.writeUInt16LE(33, 14); record.writeUInt32LE(crc, 16); record.writeUInt32LE(bytes.length, 20); record.writeUInt32LE(bytes.length, 24); record.writeUInt16LE(name.length, 28); record.writeUInt32LE(offset, 42);
  directory.push(record, name); offset += header.length + name.length + bytes.length;
}
const central = Buffer.concat(directory), end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
await mkdir(join(root, 'deliverables'), { recursive: true });
const target = join(root, 'deliverables/PolyPath-source.zip');
await writeFile(target, Buffer.concat([...entries, central, end]));
console.log(`Packaged ${files.length} source files: ${relative(root, target)}. Fill in group details before submission.`);
