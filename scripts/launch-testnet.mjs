// Launches the Totem token and the Totem NFT collection on NEAR testnet.
//
//   npm run launch:testnet                 print the plan, change nothing
//   npm run launch:testnet -- --execute    create the accounts and deploy
//
// Signing uses near-cli-rs and whatever key store it already has for the parent account,
// so this script never sees a key. Authorise the parent first:
//
//   near account import-account using-seed-phrase --network-id testnet
//
// Every step is idempotent to attempt: an account that exists is left alone, and a
// contract that is already deployed is reported rather than redeployed.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? fallback : args[index + 1]
}
const execute = args.includes('--execute')

const parent = flag('parent', 'totemtest.testnet')
const network = flag('network', 'testnet')
const tokenAccount = flag('token-account', `token.${parent}`)
const nftAccount = flag('nft-account', `nft.${parent}`)
// NEAR stakes 1 NEAR per 100KB of storage, and a deployed contract stores its own code.
// Sizing the funding from the artifact avoids both a failed deploy and over funding.
const STORAGE_NEAR_PER_BYTE = 1 / 100_000
const fundingFor = path => {
  const bytes = readFileSync(path).length
  const storage = bytes * STORAGE_NEAR_PER_BYTE
  return Math.max(1, Math.ceil((storage + 0.5) * 10) / 10) // headroom for state and gas
}

const DECIMALS = Number(flag('decimals', '18'))
const SUPPLY = BigInt(flag('supply', '1000000000')) * 10n ** BigInt(DECIMALS)

const WASM = resolve('contracts/target/wasm32-unknown-unknown/release')
const artifacts = {
  token: resolve(WASM, 'totem_token.wasm'),
  nft: resolve(WASM, 'totem_nft.wasm')
}

const sha256 = path => createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase()

const near = (parameters, label) => {
  console.log(`\n${label}`)
  console.log('  near ' + parameters.join(' '))
  if (!execute) return console.log('  (plan only, pass --execute to run)')
  try {
    console.log(execFileSync('near', parameters, { encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] }))
  } catch (error) {
    const detail = (error.stderr || error.stdout || '').toString()
    if (/already exists|AccountAlreadyExists/i.test(detail)) return console.log('  already exists, left alone')
    throw Object.assign(new Error(`${label} failed`), { detail })
  }
}

async function viewAccount(account) {
  const rpc = network === 'mainnet' ? 'https://rpc.mainnet.near.org' : 'https://rpc.testnet.near.org'
  const response = await fetch(rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: '1', method: 'query', params: { request_type: 'view_account', finality: 'final', account_id: account } })
  })
  const payload = await response.json()
  if (payload.error || !payload.result) return null
  return { balance: Number(payload.result.amount) / 1e24 }
}

try {
  for (const [name, path] of Object.entries(artifacts)) {
    if (!existsSync(path)) throw new Error(`Missing ${path}. Run: npm run build:contracts`)
  }

  const tokenArgs = {
    owner_id: parent,
    total_supply: SUPPLY.toString(),
    name: flag('token-name', 'Totem'),
    symbol: flag('token-symbol', 'TOTEM'),
    decimals: DECIMALS,
    // Allocations must sum to the total supply, so the whole supply starts with the owner
    // and is distributed from there under the rules the product enforces.
    allocations: [{ account_id: parent, amount: SUPPLY.toString(), unlock_at_ms: null }]
  }

  const nftArgs = {
    owner_id: parent,
    name: flag('nft-name', 'Totem'),
    symbol: flag('nft-symbol', 'TOTEM'),
    base_uri: flag('base-uri', 'https://mytotem.buzz'),
    max_supply: Number(flag('max-supply', '10000')),
    mint_price: flag('mint-price', '0'),
    primary_sale_receiver_id: flag('sale-receiver', parent),
    creator_royalty_bps: Number(flag('creator-bps', '500')),
    creator_royalty_receiver_id: flag('creator-receiver', parent),
    treasury_royalty_bps: Number(flag('treasury-bps', '250')),
    treasury_royalty_receiver_id: flag('treasury-receiver', parent)
  }

  console.log('Totem testnet launch')
  console.log(`  parent account  ${parent}`)
  console.log(`  network         ${network}`)
  console.log(`  token           ${tokenAccount}`)
  console.log(`  nft             ${nftAccount}`)
  console.log(`  supply          ${SUPPLY} (${flag('supply', '1000000000')} at ${DECIMALS} decimals)`)
  console.log('\nArtifact hashes, for TokenArtifactSha256 and NftArtifactSha256 on the stack:')
  console.log(`  token  ${sha256(artifacts.token)}`)
  console.log(`  nft    ${sha256(artifacts.nft)}`)

  const funding = { token: fundingFor(artifacts.token), nft: fundingFor(artifacts.nft) }
  const needed = funding.token + funding.nft + 0.5 // the parent keeps a little for gas

  console.log('\nFunding, sized from the artifacts:')
  console.log(`  ${tokenAccount}  ${funding.token} NEAR`)
  console.log(`  ${nftAccount}  ${funding.nft} NEAR`)
  console.log(`  needed on ${parent}: about ${needed.toFixed(1)} NEAR`)

  const summary = await viewAccount(parent)
  if (!summary) {
    throw new Error(`${parent} does not exist on ${network}. Create it, then authorise it with: near account import-account using-seed-phrase --network-id ${network}`)
  }
  console.log(`  ${parent} holds ${summary.balance.toFixed(2)} NEAR`)
  if (summary.balance < needed) {
    const short = (needed - summary.balance).toFixed(1)
    const message = `${parent} holds ${summary.balance.toFixed(2)} NEAR but needs about ${needed.toFixed(1)}. Add roughly ${short} NEAR from https://near-faucet.io before launching.`
    if (execute) throw new Error(message)
    console.log(`\n  NOT ENOUGH: ${message}`)
  }

  for (const [account, label] of [[tokenAccount, 'token'], [nftAccount, 'nft']]) {
    near(['account', 'create-account', 'fund-myself', account, `${funding[label]} NEAR`,
      'autogenerate-new-keypair', 'save-to-keychain',
      'sign-as', parent, 'network-config', network, 'sign-with-keychain', 'send'],
      `Create ${label} account ${account}`)
  }

  near(['contract', 'deploy', tokenAccount, 'use-file', artifacts.token,
    'with-init-call', 'new', 'json-args', JSON.stringify(tokenArgs),
    'prepaid-gas', '100.0 Tgas', 'attached-deposit', '0 NEAR',
    'network-config', network, 'sign-with-keychain', 'send'],
    `Deploy the token to ${tokenAccount}`)

  near(['contract', 'deploy', nftAccount, 'use-file', artifacts.nft,
    'with-init-call', 'new', 'json-args', JSON.stringify(nftArgs),
    'prepaid-gas', '100.0 Tgas', 'attached-deposit', '0 NEAR',
    'network-config', network, 'sign-with-keychain', 'send'],
    `Deploy the NFT collection to ${nftAccount}`)

  console.log('\nAfterwards, point the stack at the deployed contracts:')
  console.log(`  TotemTokenContractId=${tokenAccount}`)
  console.log(`  TotemNftContractId=${nftAccount}`)
  console.log(execute ? '\nLaunched.' : '\nPlan only. Nothing was created or deployed.')
} catch (error) {
  console.error(`\nLaunch stopped: ${error.message}`)
  if (error.detail) console.error(error.detail)
  process.exit(1)
}
