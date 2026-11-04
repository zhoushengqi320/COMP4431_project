import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Inline the production bundle so the UI demo opens directly from a local HTML file.
// Run after a demo-mode Vite build. No model/backend is bundled.
const root = resolve('dist');
let html = await readFile(resolve(root, 'index.html'), 'utf8');
const script = html.match(/<script[^>]*src="([^"]+)"[^>]*><\/script>/);
const style = html.match(/<link[^>]*href="([^"]+\.css)"[^>]*>/);
if (!script || !style) throw new Error('Expected one Vite JavaScript and CSS entry.');
const javascript = (await readFile(resolve(root, script[1].replace(/^\//, '')), 'utf8')).replace(/<\/script/gi, '<\\/script');
const css = await readFile(resolve(root, style[1].replace(/^\//, '')), 'utf8');
html = html.replace(script[0], () => `<script type="module">${javascript}</script>`);
html = html.replace(style[0], () => `<style>${css}</style>`);
await writeFile(resolve(root, 'PolyPath-preview.html'), html);
console.log('Created dist/PolyPath-preview.html — open in a modern browser.');
