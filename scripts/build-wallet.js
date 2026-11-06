import {build} from 'esbuild'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('../',import.meta.url))
await build({absWorkingDir:root,entryPoints:['frontend/wallet.js'],bundle:true,format:'esm',minify:true,outfile:fileURLToPath(new URL('../dist/wallet.js',import.meta.url)),platform:'browser'})
