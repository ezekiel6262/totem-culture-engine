// Puts every signing key back on the Lambda after a CloudFormation stack update.
//
//   node scripts/restore-signers.mjs            show what it would do
//   node scripts/restore-signers.mjs --execute  restore them
//
// Why this is needed. The SAM template owns the function's Environment.Variables, so any
// stack update rewrites the whole environment from the template and silently drops keys
// that were set directly on the function. The symptom is claim endpoints answering
// "not configured on this deployment" while nothing in the repository changed.
//
// What it restores:
//   signer  a new function call access key on the owner account, limited to
//           approve_eligibility on the NFT contract. The old one cannot be recovered
//           because its secret only ever existed in the function's environment, so a fresh
//           key is issued and the superseded one is deleted from the account.
//   faucet  and prize, read from the near-cli credential store. Both are full access keys
//           on accounts that hold one allocation each and nothing else.
//
// Run this after every stack update until the keys live somewhere CloudFormation manages,
// such as Secrets Manager with only the secret name in the template.
import { execFileSync } from 'node:child_process'

const args = process.argv.slice(2)
const execute = args.includes('--execute')
const pass = execute ? ['--execute'] : []

const run = (label, parameters) => {
  console.log(`\n== ${label}`)
  try {
    console.log(execFileSync('node', parameters, { encoding: 'utf8' }).trim())
  } catch (error) {
    const detail = (error.stdout || '') + (error.stderr || '')
    console.error(detail.trim() || error.message)
    throw new Error(`${label} failed`)
  }
}

try {
  // The restricted signer is reissued rather than restored, because its secret is gone.
  run('restricted eligibility signer', ['scripts/create-restricted-signer.mjs', ...pass])
  run('faucet key', ['scripts/set-signer-env.mjs', '--only', 'faucet', ...pass])
  run('prize key', ['scripts/set-signer-env.mjs', '--only', 'prize', ...pass])

  if (!execute) {
    console.log('\nShowing only. Pass --execute to apply all three.')
    process.exit(0)
  }
  console.log('\nAll three restored. Check with:')
  console.log('  curl -s -X POST https://mytotem.buzz/api/v1/claims/tokens -H "content-type: application/json" -d "{}"')
  console.log('  which should answer AUTH_REQUIRED, not FAUCET_NOT_CONFIGURED.')
  console.log('\nThen revoke any superseded eligibility keys:')
  console.log('  near account list-keys totemtest.testnet network-config testnet now')
} catch (error) {
  console.error(`\nRestore stopped: ${error.message}`)
  process.exit(1)
}
