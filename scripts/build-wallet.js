// Bundles the NEAR wallet module for the browser.
// Some dependencies still reach for Node globals, so they are mapped to browser ones.
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

await build({
  entryPoints: [fileURLToPath(new URL('../frontend/wallet.js', import.meta.url))],
  bundle: true,
  format: 'esm',
  minify: true,
  outfile: fileURLToPath(new URL('../dist/wallet.js', import.meta.url)),
  platform: 'browser',
  define: {
    global: 'globalThis',
    'process.env.NODE_ENV': '"production"'
  },
  banner: {
    js: 'var process = globalThis.process || { env: {}, browser: true, version: "", versions: {}, platform: "browser", nextTick: function (fn) { var rest = Array.prototype.slice.call(arguments, 1); setTimeout(function () { fn.apply(null, rest) }, 0) } };'
  }
})
console.log('Built dist/wallet.js')
