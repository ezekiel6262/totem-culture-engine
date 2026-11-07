import {build} from 'esbuild'
import {fileURLToPath} from 'node:url'
await build({entryPoints:[fileURLToPath(new URL('../frontend/wallet.js',import.meta.url))],bundle:true,format:'esm',minify:true,outfile:fileURLToPath(new URL('../dist/wallet.js',import.meta.url)),platform:'browser'})
