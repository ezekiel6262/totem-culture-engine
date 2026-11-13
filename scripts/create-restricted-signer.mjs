// Creates a NEAR function call access key for the backend to grant mint permits with, and
// puts it straight into the Lambda environment.
//
//   node scripts/create-restricted-signer.mjs                 show what it would do
//   node scripts/create-restricted-signer.mjs --execute       create the key and apply it
//
// Why this exists. The account that owns the Totem contracts also holds the retained
// $TOTEM, so putting its full access key in a Lambda environment would mean a compromise of
// the function is a compromise of everything. A NEAR function call access key can be
// limited to named methods on one contract and given a small gas allowance, and it cannot
// attach a deposit at all. This one can call approve_eligibility on the NFT contract and
// nothing else. It cannot transfer tokens, deploy code, add keys, or delete the account.
//
// The secret never leaves this process: the key pair is generated here, the public half goes
// to near-cli to be authorised on chain, and the secret half goes to the Lambda through a
// file that is removed afterwards. It is never printed and never written to the repository.
import { execFileSync } from 'node:child_process'
import { generateKeyPairSync } from 'node:crypto'
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const execute = args.includes('--execute')
const flag = (name, fallback) => { const i = args.indexOf(`--${name}`); return i === -1 ? fallback : args[i + 1] }

const owner = flag('owner', 'totemtest.testnet')
const nftContract = flag('nft', 'nft.totemtest.testnet')
const allowance = flag('allowance', '0.25 NEAR')
const method = flag('method', 'approve_eligibility')
const functionName = flag('function', 'totemstart-TotemApi-FtendHVgZ1kx')
const region = flag('region', 'us-east-1')
const network = flag('network', 'testnet')

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const base58 = bytes => {
  let big = 0n
  for (const byte of bytes) big = (big << 8n) + BigInt(byte)
  let out = ''
  while (big > 0n) { out = BASE58[Number(big % 58n)] + out; big /= 58n }
  for (const byte of bytes) { if (byte !== 0) break; out = '1' + out }
  return out
}

// Node exports ed25519 keys in DER. The raw 32 byte halves are the tail of each encoding.
const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const rawPublic = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32)
const rawSeed = privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(-32)
const nearPublic = `ed25519:${base58(rawPublic)}`
const nearSecret = `ed25519:${base58(Buffer.concat([rawSeed, rawPublic]))}`

console.log('restricted signer key')
console.log(`  on account   ${owner}`)
console.log(`  may call     ${method} on ${nftContract}`)
console.log(`  allowance    ${allowance}, for gas only`)
console.log('  may NOT      transfer tokens, attach any deposit, deploy code, or add keys')
console.log(`  public key   ${nearPublic}`)
console.log('  secret key   generated in memory, never printed')

if (!execute) {
  console.log('\nShowing only. Pass --execute to authorise the key and set it on the function.')
  process.exit(0)
}

const run = (command, parameters) => execFileSync(command, parameters, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

console.log('\nauthorising the key on chain ...')
run('near', ['account', 'add-key', owner, 'grant-function-call-access',
  '--allowance', allowance, '--contract-account-id', nftContract, '--function-names', method,
  'use-manually-provided-public-key', nearPublic,
  'network-config', network, 'sign-with-legacy-keychain', 'send'])
console.log('  authorised')

const aws = parameters => run('aws', [...parameters, '--region', region])
const current = JSON.parse(aws(['lambda', 'get-function-configuration', '--function-name', functionName, '--output', 'json']))

const directory = mkdtempSync(join(tmpdir(), 'totem-key-'))
const payloadPath = join(directory, 'env.json')
try {
  writeFileSync(payloadPath, JSON.stringify({
    FunctionName: functionName,
    Environment: {
      Variables: {
        ...(current.Environment?.Variables ?? {}),
        TOTEM_SIGNER_ACCOUNT_ID: owner,
        TOTEM_SIGNER_PUBLIC_KEY: nearPublic,
        TOTEM_SIGNER_SECRET_KEY: nearSecret
      }
    }
  }), { mode: 0o600 })
  aws(['lambda', 'update-function-configuration', '--cli-input-json', `file://${payloadPath}`, '--output', 'json'])
  console.log('  set on the function')
} finally {
  rmSync(directory, { recursive: true, force: true })
}

console.log('\nDone. Revoke it at any time with:')
console.log(`  near account delete-keys ${owner} public-keys ${nearPublic} network-config ${network} sign-with-legacy-keychain send`)
