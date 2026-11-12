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

export const fundingFor = path => {
  const bytes = readFileSync(path).length
  return Math.max(1, Math.ceil((bytes * STORAGE_NEAR_PER_BYTE + 0.5) * 10) / 10) // headroom for state and gas
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

// near-cli-rs signs from its own key stores. Checking up front that one of them actually holds
// a key for the parent turns a mid-run hang into a clear refusal before anything is created.
// Returns null when the store cannot be read here, which is not the same as holding no key.
export function localPublicKeys(network, account) {
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

// Both checks run before anything is created, so a run never stops half done.
export async function preflight({ network, parent, needed, execute }) {
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
  const available = localPublicKeys(network, parent)
  if (!available) console.log('  signing key     on chain, but the key store here could not be read')
  else if (!onChain.some(key => available.has(key))) {
    blockers.push(`No signing key for ${parent} in the near-cli-rs key stores. Its full access key on chain is ${onChain.join(', ') || 'none'}. Authorise it with: near account import-account using-seed-phrase --network-id ${network}`)
  } else console.log(`  signing key     found for ${parent}`)

  if (blockers.length) {
    for (const blocker of blockers) console.log(`\n  NOT READY: ${blocker}`)
    if (execute) throw new Error(blockers.join(' '))
  }
  return summary
}
