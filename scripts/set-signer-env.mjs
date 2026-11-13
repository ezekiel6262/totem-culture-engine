// Puts the claim signer keys into the Lambda environment.
//
//   node scripts/set-signer-env.mjs --function <name>            show what would change
//   node scripts/set-signer-env.mjs --function <name> --execute  apply it
//
// Keys are read from the near-cli credential store and handed to the AWS CLI through a file
// that is deleted afterwards, so no secret is printed, logged, or passed as an argument
// where it would show up in a process list or a shell history.
//
// What these keys can do, so the blast radius is written down rather than assumed:
//   signer  totemtest.testnet  grants mint permits. Also the contracts' owner, so this is a
//           full access key. Prefer a function call access key limited to approve_eligibility
//           on the NFT contract once you are past the testing phase.
//   faucet  faucet.totemtest.testnet  holds only the 100,000,000 $TOTEM faucet allocation
//           and a little NEAR. Compromise costs that allocation and nothing else.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { resolve, join } from 'node:path'

const args = process.argv.slice(2)
const execute = args.includes('--execute')
const flag = (name, fallback) => { const i = args.indexOf(`--${name}`); return i === -1 ? fallback : args[i + 1] }

const functionName = flag('function', 'totemstart-TotemApi-FtendHVgZ1kx')
const region = flag('region', 'us-east-1')
const network = flag('network', 'testnet')
const signerAccount = flag('signer', 'totemtest.testnet')
const faucetAccount = flag('faucet', 'faucet.totemtest.testnet')

const aws = parameters => execFileSync('aws', [...parameters, '--region', region], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

const credentials = account => {
  const file = resolve(homedir(), '.near-credentials', network, `${account}.json`)
  const parsed = JSON.parse(readFileSync(file, 'utf8'))
  const secretKey = parsed.private_key ?? parsed.secret_key
  if (!parsed.public_key || !secretKey) throw new Error(`${file} has no key pair`)
  return { publicKey: parsed.public_key, secretKey }
}

// --only faucet leaves the signer variables alone. The signer should normally be the
// restricted function call key from create-restricted-signer.mjs, and setting it from the
// credential store here would replace that with the owner's full access key.
const only = flag('only', 'all')
const signer = only === 'faucet' ? null : credentials(signerAccount)
const faucet = only === 'signer' ? null : credentials(faucetAccount)

const current = JSON.parse(aws(['lambda', 'get-function-configuration', '--function-name', functionName, '--output', 'json']))
const existing = current.Environment?.Variables ?? {}

const additions = {
  ...(signer ? { TOTEM_SIGNER_ACCOUNT_ID: signerAccount, TOTEM_SIGNER_PUBLIC_KEY: signer.publicKey, TOTEM_SIGNER_SECRET_KEY: signer.secretKey } : {}),
  ...(faucet ? { TOTEM_FAUCET_ACCOUNT_ID: faucetAccount, TOTEM_FAUCET_PUBLIC_KEY: faucet.publicKey, TOTEM_FAUCET_SECRET_KEY: faucet.secretKey } : {})
}

console.log(`function ${functionName}`)
if (signer) console.log(`  signer  ${signerAccount}  ${signer.publicKey}`)
if (faucet) console.log(`  faucet  ${faucetAccount}  ${faucet.publicKey}`)
console.log('  secret keys are read from the credential store and never printed')
console.log(`\n  variables kept   ${Object.keys(existing).length}`)
console.log(`  variables set    ${Object.keys(additions).join(', ')}`)

if (!execute) {
  console.log('\nShowing only. Pass --execute to apply.')
  process.exit(0)
}

// The payload carries secrets, so it lives in a private temp directory for as long as the
// AWS CLI needs to read it and is removed in a finally block whatever happens.
const directory = mkdtempSync(join(tmpdir(), 'totem-env-'))
const payloadPath = join(directory, 'env.json')
try {
  writeFileSync(payloadPath, JSON.stringify({
    FunctionName: functionName,
    Environment: { Variables: { ...existing, ...additions } }
  }), { mode: 0o600 })
  aws(['lambda', 'update-function-configuration', '--cli-input-json', `file://${payloadPath}`, '--output', 'json'])
  console.log('\nApplied. The function updates in a few seconds.')
} finally {
  rmSync(directory, { recursive: true, force: true })
}
