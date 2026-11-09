import { readdir, readFile, access } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'

const root = resolve('dist')
const files = (await readdir(root)).filter(name => name.endsWith('.html'))
const missing = []
for (const name of files) {
  const source = await readFile(resolve(root, name), 'utf8')
  if (!source.includes('rel="icon"')) missing.push(`${name}: favicon`)
  if (!source.includes('platform.css')) missing.push(`${name}: platform.css`)
  for (const match of source.matchAll(/(?:href|src)=["']([^"'#?]+)["']/g)) {
    const ref = match[1]
    if (ref.includes('{{')) continue
    if (/^(?:https?:|data:|mailto:|javascript:)/.test(ref)) continue
    try { await access(resolve(dirname(resolve(root, name)), ref)) } catch { missing.push(`${name}: ${ref}`) }
  }
}
if (missing.length) {
  console.error(missing.join('\n'))
  process.exit(1)
}
console.log(`Static audit passed: ${files.length} pages, shared favicon and platform styles, no missing local references.`)
