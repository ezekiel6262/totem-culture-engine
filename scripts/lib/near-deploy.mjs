// Shared pieces for the NEAR deployment scripts: artifact sizing, code hashes, RPC reads,
// and the preflight that refuses before anything is created.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

// NEAR stakes 1 NEAR per 100KB of storage, and a deployed contract stores its own code.
// Sizing the funding from the artifact avoids both a failed deploy and over funding.
export const STORAGE_NEAR_PER_BYTE = 1 / 100_000
// A global contract costs ten times that, and the amount is burnt rather than staked.
export const GLOBAL_NEAR_PER_BYTE = 10 / 100_000

export const flagReader = args => (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? fallback : args[index + 1]
}

// The headroom covers state growth and gas beyond the code itself. It is a parameter because
// on a faucet funded account the difference between 0.5 and 0.2 per account decides what fits.
export const fundingFor = (path, headroom = 0.5) => {
  const bytes = readFileSync(path).length
  return Math.max(0.1, Math.ceil((bytes * STORAGE_NEAR_PER_BYTE + headroom) * 10) / 10)
}

export const globalBurnFor = path => readFileSync(path).length * GLOBAL_NEAR_PER_BYTE

export const sha256Hex = path => createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase()

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
// A global contract is referenced by the base58 of its sha256, which is what the factory stores.
export const codeHash = path => {
  const digest = createHash('sha256').update(readFileSync(path)).digest()
  let value = 0n
  for (const byte of digest) value = (value << 8n) + BigInt(byte)
  let out = ''
  while (value > 0n) { out = BASE58[Number(value % 58n)] + out; value /= 58n }
  for (const byte of digest) { if (byte !== 0) break; out = '1' + out }
  return out
}

export const near = ({ execute }) => (parameters, label) => {
  console.log(`\n${label}`)
  console.log('  near ' + parameters.join(' '))
  if (!execute) return console.log('  (plan only, pass --execute to run)')
  try {
    // stdin is closed deliberately: near-cli-rs prompts when it cannot find a key, and a
    // prompt with nothing to read would hang here forever, possibly with work half done.
    console.log(execFileSync('near', parameters, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180_000 }))
  } catch (error) {
    const detail = (error.stderr || error.stdout || '').toString()
    if (/already exists|AccountAlreadyExists/i.test(detail)) return console.log('  already exists, left alone')
    throw Object.assign(new Error(`${label} failed`), { detail })
  }
}

export async function query(network, request) {
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

const EMPTY_CODE = '11111111111111111111111111111111'

export async function viewAccount(network, account) {
  const result = await query(network, { request_type: 'view_account', account_id: account })
  return result ? { balance: Number(result.amount) / 1e24, deployed: result.code_hash !== EMPTY_CODE } : null
}

export async function fullAccessKeys(network, account) {
  const result = await query(network, { request_type: 'view_access_key_list', account_id: account })
  if (!result) return []
  return result.keys.filter(key => key.access_key.permission === 'FullAccess').map(key => key.public_key)
}

// near-cli-rs keeps keys in two separate stores and never looks in the other one:
// "keychain" is the operating system credential store, and "legacy keychain" is
// ~/.near-credentials, the layout the old JS CLI used. Which store holds the key decides the
// signer flag, so this reports the store rather than only whether some key exists.
// A null store means it could not be read here, which is not the same as holding no key.
export function keyStores(network, account) {
  const legacy = new Set()
  const directory = resolve(homedir(), '.near-credentials', network)
  const readKey = path => {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8'))
      if (parsed.public_key) legacy.add(parsed.public_key)
    } catch (error) { /* absent or unreadable, which the caller treats as no key here */ }
  }
  readKey(resolve(directory, `${account}.json`))
  try {
    for (const file of readdirSync(resolve(directory, account))) if (file.endsWith('.json')) readKey(resolve(directory, account, file))
  } catch (error) { /* no per account directory */ }

  // Only Windows exposes the operating system store to a plain read. Elsewhere an absent
  // entry is not evidence of an absent key, so that store stays unknown rather than empty.
  let keychain = null
  if (process.platform === 'win32') {
    const suffix = `.near-${network}-${account}`
    keychain = new Set()
    try {
      const listed = execFileSync('cmdkey', ['/list'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      for (const [, target] of listed.matchAll(/target=(\S+)/g)) {
        if (!target.endsWith(suffix)) continue
        const key = target.slice(target.indexOf(':') + 1, target.length - suffix.length)
        if (key) keychain.add(key)
      }
    } catch (error) { keychain = null }
  }
  return { legacy, keychain }
}

// A new sub-account key belongs in the same store the parent signs from, so that one
// command authorises every account this run creates.
export const storeFlags = signer => ({
  signer,
  saveTo: signer === 'sign-with-legacy-keychain' ? 'save-to-legacy-keychain' : 'save-to-keychain'
})

// Balance and signing key are both checked before anything is created, so a run never stops
// half done. The signer is returned rather than assumed, because naming the store that does
// not hold the key fails at signing time, once accounts have been created and funded.
export async function preflight({ network, parent, needed, execute, signer }) {
  const summary = await viewAccount(network, parent)
  if (!summary) {
    throw new Error(`${parent} does not exist on ${network}. Create it, then authorise it with: near account import-account using-seed-phrase --network-id ${network}`)
  }
  console.log(`  ${parent} holds ${summary.balance.toFixed(2)} NEAR`)

  const blockers = []
  if (summary.balance < needed) {
    const short = (needed - summary.balance).toFixed(1)
    blockers.push(`${parent} holds ${summary.balance.toFixed(2)} NEAR but needs about ${needed.toFixed(1)}. Add roughly ${short} NEAR from https://near-faucet.io.`)
  }

  const onChain = await fullAccessKeys(network, parent)
  const stores = keyStores(network, parent)
  const holding = onChain.some(key => stores.keychain?.has(key))
    ? 'sign-with-keychain'
    : onChain.some(key => stores.legacy.has(key)) ? 'sign-with-legacy-keychain' : null
  const chosen = signer ?? holding ?? 'sign-with-keychain'
  const named = flag => flag.slice('sign-with-'.length)

  if (signer) console.log(`  signing key     using the ${named(chosen)} as asked`)
  else if (holding) console.log(`  signing key     found for ${parent} in the ${named(holding)}`)
  else if (!stores.keychain) console.log(`  signing key     on chain, but no key store here could be read, so trying the ${named(chosen)}`)
  else {
    blockers.push(`No signing key for ${parent} in either near-cli-rs key store. Its full access key on chain is ${onChain.join(', ') || 'none'}. Authorise it with: near account import-account using-seed-phrase --network-id ${network}`)
  }

  if (blockers.length) {
    for (const blocker of blockers) console.log(`\n  NOT READY: ${blocker}`)
    if (execute) throw new Error(blockers.join(' '))
  }
  return { ...summary, ...storeFlags(chosen) }
}
