// Splits the $TOTEM supply into named, on-chain allocations.
//
//   node scripts/allocate-supply.mjs              print the plan, move nothing
//   node scripts/allocate-supply.mjs --execute    register each account and transfer
//
// Every figure is tied to the mechanism rather than to a round percentage:
// a Totem holds 4 pieces of 25,000 $TOTEM, so a full Totem is 100,000, and the 1,000
// Totems claimable in this phase need exactly 100,000,000 to fill completely. That is the
// faucet. The rest is split by stated purpose so each one is a balance anyone can query
// with ft_balance_of rather than a number in a document.
//
// The signing key is read from the near-cli credential store at run time. This script never
// prints it and never takes it as an argument.
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { NearSigner } from '../backend/src/near-signer.js'

const args = process.argv.slice(2)
const execute = args.includes('--execute')
const flag = (name, fallback) => { const i = args.indexOf(`--${name}`); return i === -1 ? fallback : args[i + 1] }

const parent = flag('parent', 'totemtest.testnet')
const network = flag('network', 'testnet')
const token = flag('token', `token.${parent}`)
const rpcUrl = network === 'mainnet' ? 'https://rpc.mainnet.near.org' : 'https://rpc.testnet.near.org'

const DECIMALS = 18n
const units = whole => (BigInt(whole) * 10n ** DECIMALS).toString()

// 1,000 claimable Totems x 4 pieces x 25,000 $TOTEM = 100,000,000 exactly.
const PLAN = [
  { account: `faucet.${parent}`, whole: 100_000_000, why: 'fills all 1,000 claimable Totems, 4 pieces of 25,000 each' },
  { account: `treasury.${parent}`, whole: 400_000_000, why: 'DAO governed treasury, never spent by Totem itself' },
  { account: `prizes.${parent}`, whole: 200_000_000, why: 'Arena seasons and quest rewards' }
]

const credentials = () => {
  const file = resolve(homedir(), '.near-credentials', network, `${parent}.json`)
  const parsed = JSON.parse(readFileSync(file, 'utf8'))
  return { publicKey: parsed.public_key, secretKey: parsed.private_key ?? parsed.secret_key }
}

const view = async (contractId, methodName, methodArgs = {}) => {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: '1',
      method: 'query',
      params: { request_type: 'call_function', finality: 'final', account_id: contractId, method_name: methodName, args_base64: Buffer.from(JSON.stringify(methodArgs)).toString('base64') }
    })
  })
  const payload = await response.json()
  if (!payload.result) return null
  return JSON.parse(Buffer.from(payload.result.result).toString())
}

const show = raw => (BigInt(raw) / 10n ** DECIMALS).toLocaleString('en-US')

try {
  console.log('$TOTEM allocation')
  console.log(`  token    ${token}`)
  console.log(`  from     ${parent}`)
  const before = await view(token, 'ft_balance_of', { account_id: parent })
  console.log(`  holds    ${show(before ?? '0')} $TOTEM\n`)

  let moving = 0n
  for (const { account, whole, why } of PLAN) {
    console.log(`  ${account.padEnd(30)} ${whole.toLocaleString('en-US').padStart(13)} $TOTEM`)
    console.log(`  ${''.padEnd(30)} ${why}`)
    moving += BigInt(whole)
  }
  const remaining = BigInt(before ?? '0') / 10n ** DECIMALS - moving
  console.log(`\n  ${parent.padEnd(30)} ${remaining.toLocaleString('en-US').padStart(13)} $TOTEM retained`)
  console.log(`  ${''.padEnd(30)} the other 9,000 Totems and operations`)

  if (!execute) {
    console.log('\nPlan only. Pass --execute to register the accounts and transfer.')
    process.exit(0)
  }

  const { publicKey, secretKey } = credentials()
  const signer = new NearSigner({ rpcUrl, accountId: parent, publicKey, secretKey })

  for (const { account, whole } of PLAN) {
    // NEP-141 refuses a transfer to an account that has not paid for its own storage, so
    // each one registers before it can be funded. Registering twice is harmless.
    const registered = await view(token, 'storage_balance_of', { account_id: account })
    if (registered) console.log(`\n${account} is already registered`)
    else {
      const { transactionHash } = await signer.call({
        receiverId: token,
        methodName: 'storage_deposit',
        args: { account_id: account, registration_only: true },
        deposit: 1_250_000_000_000_000_000_000n
      })
      console.log(`\nregistered ${account}  ${transactionHash}`)
    }

    const held = await view(token, 'ft_balance_of', { account_id: account })
    if (held && BigInt(held) >= BigInt(units(whole))) {
      console.log(`  already holds ${show(held)} $TOTEM, left alone`)
      continue
    }
    const { transactionHash } = await signer.call({
      receiverId: token,
      methodName: 'ft_transfer',
      args: { receiver_id: account, amount: units(whole), memo: 'Totem supply allocation' },
      deposit: 1n
    })
    console.log(`  transferred ${whole.toLocaleString('en-US')} $TOTEM  ${transactionHash}`)
  }

  console.log('\nBalances now:')
  for (const { account } of PLAN) console.log(`  ${account.padEnd(30)} ${show((await view(token, 'ft_balance_of', { account_id: account })) ?? '0')}`)
  console.log(`  ${parent.padEnd(30)} ${show((await view(token, 'ft_balance_of', { account_id: parent })) ?? '0')}`)
} catch (error) {
  console.error(`\nAllocation stopped: ${error.message}`)
  process.exit(1)
}
