// Verifies the built product in dist: head requirements, house copy rules,
// no missing local references, and that dist/index.html matches its source parts.
import { readdir, readFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

const root = resolve('dist');
const source = resolve('frontend', 'site');
const problems = [];

const pages = (await readdir(root)).filter(name => name.endsWith('.html'));
if (!pages.length) problems.push('dist: no HTML pages found');

for (const name of pages) {
  const html = await readFile(resolve(root, name), 'utf8');
  if (!html.includes('rel="icon"')) problems.push(`${name}: missing favicon link`);
  if (!/<title>[^<]+<\/title>/.test(html)) problems.push(`${name}: missing title`);
  if (!html.includes('name="viewport"')) problems.push(`${name}: missing viewport meta`);
  if (/[—–]/.test(html)) problems.push(`${name}: contains an em or en dash (plain hyphens only)`);

  for (const match of html.matchAll(/(?:href|src)=["']([^"'#?]+)["']/g)) {
    const ref = match[1];
    if (!ref || ref.includes('{{') || ref.includes("' +")) continue;
    if (/^(?:https?:|data:|mailto:|javascript:)/.test(ref)) continue;
    try {
      await access(resolve(dirname(resolve(root, name)), ref));
    } catch {
      problems.push(`${name}: missing local reference ${ref}`);
    }
  }
}

// dist/index.html must be the concatenation of the ordered source parts.
const parts = (await readdir(source))
  .filter(name => /^p\d+\.html$/.test(name))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
const expected = (await Promise.all(parts.map(name => readFile(resolve(source, name), 'utf8')))).join('');
const built = await readFile(resolve(root, 'index.html'), 'utf8');
if (built !== expected) problems.push('index.html: out of sync with frontend/site parts (run npm run build:site)');

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`Static audit passed: ${pages.length} page(s), ${parts.length} source parts in sync, favicon and title present, no missing local references.`);
