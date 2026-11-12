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
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
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
    // stdin is closed deliberately: near-cli-rs prompts when it cannot find a key, and a
    // prompt with nothing to read would hang here forever, possibly with one account already made.
    console.log(execFileSync('near', parameters, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180_000 }))
  } catch (error) {
    const detail = (error.stderr || error.stdout || '').toString()
    if (/already exists|AccountAlreadyExists/i.test(detail)) return console.log('  already exists, left alone')
    throw Object.assign(new Error(`${label} failed`), { detail })
  }
}

async function query(request) {
  const url = network === 'mainnet' ? 'https://rpc.mainnet.near.org' : 'https://rpc.testnet.near.org'
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: '1', method: 'query', params: Object.assign({ finality: 'final' }, request) })
  })
  const payload = await response.json()
  if (payload.error || !payload.result) return null
  return payload.result
}

async function viewAccount(account) {
  const result = await query({ request_type: 'view_account', account_id: account })
  return result ? { balance: Number(result.amount) / 1e24 } : null
}

async function fullAccessKeys(account) {
  const result = await query({ request_type: 'view_access_key_list', account_id: account })
  if (!result) return []
  return result.keys.filter(key => key.access_key.permission === 'FullAccess').map(key => key.public_key)
}

// near-cli-rs signs from its own key stores. Checking up front that one of them actually holds
// a key for the parent turns a mid-launch hang into a clear refusal before anything is created.
// Returns null when the store cannot be read here, which is not the same as holding no key.
function localPublicKeys(account) {
  const keys = new Set()
  const suffix = `.near-${network}-${account}`
  const directory = resolve(homedir(), '.near-credentials', network)
  const readKey = path => {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8'))
      if (parsed.public_key) keys.add(parsed.public_key)
    } catch (error) { /* absent or unreadable, which the caller treats as no key here */ }
  }
  readKey(resolve(directory, `${account}.json`))
  try {
    for (const file of readdirSync(resolve(directory, account))) if (file.endsWith('.json')) readKey(resolve(directory, account, file))
  } catch (error) { /* no per account directory */ }

  if (process.platform === 'win32') {
    try {
      const listed = execFileSync('cmdkey', ['/list'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      for (const [, target] of listed.matchAll(/target=(\S+)/g)) {
        if (!target.endsWith(suffix)) continue
        const key = target.slice(target.indexOf(':') + 1, target.length - suffix.length)
        if (key) keys.add(key)
      }
      return keys
    } catch (error) { return keys.size ? keys : null }
  }
  // Other platforms keep keychain entries in stores this cannot read, so only a hit is conclusive.
  return keys.size ? keys : null
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
  // Both checks run before anything is created, so a launch never stops half done with one
  // sub-account made and the other not.
  const blockers = []
  if (summary.balance < needed) {
    const short = (needed - summary.balance).toFixed(1)
    blockers.push(`${parent} holds ${summary.balance.toFixed(2)} NEAR but needs about ${needed.toFixed(1)}. Add roughly ${short} NEAR from https://near-faucet.io.`)
  }

  const onChain = await fullAccessKeys(parent)
  const available = localPublicKeys(parent)
  if (!available) console.log('  signing key     on chain, but the key store here could not be read')
  else if (!onChain.some(key => available.has(key))) {
    blockers.push(`No signing key for ${parent} in near-cli-rs's key stores. Its full access key on chain is ${onChain.join(', ') || 'none'}. Authorise it with: near account import-account using-seed-phrase --network-id ${network}`)
  } else console.log(`  signing key     found for ${parent}`)

  if (blockers.length) {
    for (const blocker of blockers) console.log(`
  NOT READY: ${blocker}`)
    if (execute) throw new Error(blockers.join(' '))
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
