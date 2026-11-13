// Uploads the collection template into the launchpad factory and commits it.
//
//   node scripts/upload-template.mjs              print the plan
//   node scripts/upload-template.mjs --execute    upload and commit
//
// A transaction cannot carry a 390KB contract, so the template goes up in chunks and is
// committed in one call that concatenates and hashes it. The hash it returns is checked
// here against the artifact on disk, so a truncated or reordered upload is caught rather
// than deployed to somebody later.
//
// The factory stakes the bytes it stores. While the upload is staged the account briefly
// holds two copies, the staged chunks and then the committed blob, so it needs headroom
// beyond the template's own size.
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { NearSigner } from '../backend/src/near-signer.js'
import { sha256Hex, codeHash } from './lib/near-deploy.mjs'

const args = process.argv.slice(2)
const execute = args.includes('--execute')
const flag = (name, fallback) => { const i = args.indexOf(`--${name}`); return i === -1 ? fallback : args[i + 1] }

const owner = flag('owner', 'totemtest.testnet')
const factory = flag('factory', `launch.${owner}`)
const network = flag('network', 'testnet')
const rpcUrl = flag('rpc', 'https://test.rpc.fastnear.com')
const artifact = flag('artifact', 'contracts/target/wasm32-unknown-unknown/release/totem_nft.wasm')
const chunkSize = Number(flag('chunk', '50000'))

const code = readFileSync(artifact)
const chunks = []
for (let at = 0; at < code.length; at += chunkSize) chunks.push(code.subarray(at, at + chunkSize))

console.log('Collection template upload')
console.log(`  factory   ${factory}`)
console.log(`  artifact  ${artifact}`)
console.log(`  bytes     ${code.length.toLocaleString('en-US')} in ${chunks.length} chunks of up to ${chunkSize.toLocaleString('en-US')}`)
console.log(`  sha256    ${sha256Hex(artifact)}`)
console.log(`  base58    ${codeHash(artifact)}`)
console.log(`  storage   about ${(code.length / 1e5).toFixed(2)} NEAR staked on the factory`)

if (!execute) {
  console.log('\nPlan only. Pass --execute to upload and commit.')
  process.exit(0)
}

const credentials = () => {
  const parsed = JSON.parse(readFileSync(resolve(homedir(), '.near-credentials', network, `${owner}.json`), 'utf8'))
  return { publicKey: parsed.public_key, secretKey: parsed.private_key ?? parsed.secret_key }
}

try {
  const signer = new NearSigner({ rpcUrl, accountId: owner, ...credentials() })

  // Anything already staged from an interrupted run would be concatenated with this one.
  console.log('\nclearing anything staged from a previous run')
  await signer.call({ receiverId: factory, methodName: 'discard_staged_template', args: {}, gas: 30_000_000_000_000n })

  for (const [index, chunk] of chunks.entries()) {
    const { transactionHash } = await signer.call({
      receiverId: factory,
      methodName: 'append_template_chunk',
      args: { chunk: chunk.toString('base64') },
      gas: 120_000_000_000_000n
    })
    console.log(`  chunk ${index + 1}/${chunks.length}  ${chunk.length.toLocaleString('en-US')} bytes  ${transactionHash}`)
  }

  console.log('\ncommitting')
  const { transactionHash, outcome } = await signer.call({
    receiverId: factory,
    methodName: 'commit_template',
    args: {},
    gas: 300_000_000_000_000n
  })
  const returned = JSON.parse(Buffer.from(outcome.status.SuccessValue, 'base64').toString())
  console.log(`  committed  ${transactionHash}`)
  console.log(`  hash       ${returned}`)

  const expected = codeHash(artifact)
  if (returned !== expected) throw new Error(`The factory hashed ${returned} but the artifact is ${expected}. The upload did not land intact.`)
  console.log('\nThe committed template matches the artifact byte for byte.')
} catch (error) {
  console.error(`\nUpload stopped: ${error.message}`)
  process.exit(1)
}
