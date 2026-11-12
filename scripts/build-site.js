// Builds dist/index.html from the ordered frontend/site parts.
// The parts are the source of truth for the product UI; dist/index.html is generated.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, '..', 'frontend', 'site');
const out = path.resolve(here, '..', 'dist', 'index.html');

const parts = fs.readdirSync(source)
  .filter(name => /^p\d+\.html$/.test(name))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

if (!parts.length) throw new Error(`No p<n>.html parts found in ${source}`);

const html = parts.map(name => fs.readFileSync(path.join(source, name), 'utf8')).join('');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`Built dist/index.html from ${parts.length} parts (${html.length} bytes): ${parts.join(' ')}`);
