// Deploys the Totem platform to NEAR testnet: the launchpad factory, the player owned
// market, and the Arena agent. The Totem token and the Totem NFT collection are NOT here
// on purpose: those are launched afterwards, through the launchpad, once the platform is up
// and the supply figures are decided.
//
//   npm run deploy:platform                 print the plan, change nothing
//   npm run deploy:platform -- --execute    create the accounts and deploy
//
// Signing uses near-cli-rs and whatever key store it already has for the parent account,
// so this script never sees a key. Authorise the parent first:
//
//   near account import-account using-seed-phrase --network-id testnet
//
// Every step is idempotent to attempt: an account that exists is left alone, and an account
// that already carries a contract is reported rather than redeployed.
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { codeHash, flagReader, fundingFor, globalBurnFor, near, preflight, sha256Hex, viewAccount } from './lib/near-deploy.mjs'

const args = process.argv.slice(2)
const flag = flagReader(args)
const execute = args.includes('--execute')

// totemtest.testnet is the account that is actually owned here, and the stack parameters
// default to its sub-accounts to match.
const parent = flag('parent', 'totemtest.testnet')
const network = flag('network', 'testnet')
const treasury = flag('treasury', parent)
const headroom = Number(flag('headroom', '0.5'))
// A faucet funded parent may not cover all three at once, so a subset can be deployed first.
const only = String(flag('only', '')).split(',').map(name => name.trim()).filter(Boolean)
const operator = flag('operator', parent)

const WASM = resolve('contracts/target/wasm32-unknown-unknown/release')
const everything = {
  factory: resolve(WASM, 'totem_factory.wasm'),
  market: resolve(WASM, 'totem_market.wasm'),
  agent: resolve(WASM, 'totem_agent.wasm')
}
// This runs before the try block, so it reports itself rather than throwing a stack trace.
for (const name of only) {
  if (everything[name]) continue
  console.error(`Unknown contract "${name}". Choose from: ${Object.keys(everything).join(', ')}`)
  process.exit(1)
}
const artifacts = only.length ? Object.fromEntries(only.map(name => [name, everything[name]])) : everything
// Referenced by the factory, not deployed here.
const templates = {
  token: resolve(WASM, 'totem_token.wasm'),
  nft: resolve(WASM, 'totem_nft.wasm')
}

const yocto = near_ => (BigInt(Math.round(Number(near_) * 1000)) * 10n ** 21n).toString()

const allAccounts = {
  // A launch derives <slug>.<factory account>, so the factory sits on its own name.
  factory: flag('factory-account', `launch.${parent}`),
  market: flag('market-account', `market.${parent}`),
  agent: flag('agent-account', `agent.${parent}`)
}
// Keep the accounts in step with whatever --only selected.
const accounts = Object.fromEntries(Object.keys(artifacts).map(name => [name, allAccounts[name]]))

const run = near({ execute })

try {
  for (const [name, path] of Object.entries({ ...artifacts, ...templates })) {
    if (!existsSync(path)) throw new Error(`Missing ${path} (${name}). Run: npm run build:contracts`)
  }

  const initArgs = {
    factory: {
      owner_id: parent,
      treasury_id: treasury,
      // The launchpad instantiates from globally registered contract code, referenced by the
      // base58 of each template's sha256. Registering that code is a separate, paid step.
      token_code_hash: codeHash(templates.token),
      nft_code_hash: codeHash(templates.nft),
      token_fee: yocto(flag('token-fee', '1')),
      nft_fee: yocto(flag('nft-fee', '2'))
    },
    market: {
      owner_id: parent,
      fee_receiver_id: treasury,
      fee_bps: Number(flag('market-fee-bps', '250'))
    },
    agent: {
      owner_id: parent,
      operator_id: operator,
      community_id: flag('community', 'totem'),
      max_payment: yocto(flag('max-payment', '1')),
      daily_cap: yocto(flag('daily-cap', '5')),
      approved_actions: ['quest_reward', 'creator_reward', 'market_sponsorship', 'season_bounty']
    }
  }

  console.log('Totem platform deployment')
  console.log(`  parent account  ${parent}`)
  console.log(`  network         ${network}`)
  for (const [label, account] of Object.entries(accounts)) console.log(`  ${label.padEnd(14)}  ${account}`)
  console.log('\n  The Totem token and Totem NFT are deliberately not deployed here. They are')
  console.log('  launched later, through the launchpad, once supply figures are decided.')

  console.log('\nArtifact hashes:')
  for (const [label, path] of Object.entries(artifacts)) console.log(`  ${label.padEnd(8)} ${sha256Hex(path)}`)

  const funding = Object.fromEntries(Object.entries(artifacts).map(([label, path]) => [label, fundingFor(path, headroom)]))
  const needed = Object.values(funding).reduce((total, amount) => total + amount, 0) + 0.5 // the parent keeps a little for gas

  console.log('\nFunding, sized from the artifacts:')
  for (const [label, account] of Object.entries(accounts)) console.log(`  ${account.padEnd(26)} ${funding[label]} NEAR`)
  console.log(`  needed on ${parent}: about ${needed.toFixed(1)} NEAR`)

  // Which key store holds the key decides the signer, so it comes from the preflight
  // rather than being assumed. --signer overrides it.
  const { signer, saveTo } = await preflight({ network, parent, needed, execute, signer: flag('signer') })

  // Say plainly what the launchpad can and cannot do once this lands, because the cost of
  // enabling it is large, burnt, and easy to be surprised by.
  const burn = { token: globalBurnFor(templates.token), nft: globalBurnFor(templates.nft) }
  console.log('\nLaunchpad templates, which this script does NOT register:')
  console.log(`  token  ${initArgs.factory.token_code_hash}  ${burn.token.toFixed(1)} NEAR to register`)
  console.log(`  nft    ${initArgs.factory.nft_code_hash}  ${burn.nft.toFixed(1)} NEAR to register`)
  console.log(`  A global contract costs 10 NEAR per 100KB and the amount is burnt, not staked,`)
  console.log(`  so registering both costs about ${(burn.token + burn.nft).toFixed(1)} NEAR and is not recoverable.`)
  console.log('  Until they are registered, the factory quotes and records launches, but a launch')
  console.log('  call fails and leaves its instance deposit pending reconciliation. Do not call')
  console.log('  launch on a factory whose templates are unregistered.')

  for (const [label, account] of Object.entries(accounts)) {
    const existing = await viewAccount(network, account)
    if (existing?.deployed) {
      console.log(`\nSkip ${label}: ${account} already carries a contract`)
      continue
    }
    if (!existing) {
      run(['account', 'create-account', 'fund-myself', account, `${funding[label]} NEAR`,
        'autogenerate-new-keypair', saveTo,
        'sign-as', parent, 'network-config', network, signer, 'send'],
        `Create the ${label} account ${account}`)
    } else {
      console.log(`\n${account} exists with ${existing.balance.toFixed(2)} NEAR and no contract, so it is used as is`)
    }
    run(['contract', 'deploy', account, 'use-file', artifacts[label],
      'with-init-call', 'new', 'json-args', JSON.stringify(initArgs[label]),
      'prepaid-gas', '100.0 Tgas', 'attached-deposit', '0 NEAR',
      'network-config', network, signer, 'send'],
      `Deploy the ${label} to ${account}`)
  }

  console.log('\nAfterwards, point the stack at the deployed contracts:')
  console.log(`  ArenaMarketContractId=${accounts.market}`)
  console.log(`  ArenaAgentContractId=${accounts.agent}`)
  console.log(`  TotemFactoryContractId=${accounts.factory}`)
  console.log(`  TotemAccountSuffix=${parent}`)
  console.log(`  Launch quoting stays closed regardless: it is gated on the audit and the`)
  console.log(`  mainnet flags, not on these parameters.`)
  console.log(execute ? '\nPlatform deployed.' : '\nPlan only. Nothing was created or deployed.')
} catch (error) {
  console.error(`\nDeployment stopped: ${error.message}`)
  if (error.detail) console.error(error.detail)
  process.exit(1)
}
