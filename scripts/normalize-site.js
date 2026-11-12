// Applies the house copy rules to the UI source parts in frontend/site.
// Design rule: plain hyphens only, no em or en dashes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, '..', 'frontend', 'site');

let changed = 0;
for (const name of fs.readdirSync(source).filter(n => n.endsWith('.html'))) {
  const file = path.join(source, name);
  const before = fs.readFileSync(file, 'utf8');
  const after = before.replaceAll('—', '-').replaceAll('–', '-');
  if (after !== before) {
    fs.writeFileSync(file, after);
    changed += 1;
    console.log(`normalized ${name}`);
  }
}
console.log(changed ? `Normalized ${changed} part(s).` : 'Nothing to normalize.');
