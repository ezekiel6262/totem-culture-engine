// Launches the Totem token and the Totem NFT collection on NEAR testnet.
//
// This runs AFTER the rest of the platform is deployed and working on testnet, since the
// intended route is to launch them through the launchpad rather than deploy them directly.
// Supply and collection size are decided at that point, so treat the defaults below as
// placeholders and pass the real figures.
//
//   npm run launch:testnet                    print the plan, change nothing
//   npm run launch:testnet -- --execute       create the accounts and deploy
//   npm run launch:testnet -- --only nft      launch one of them on its own
//
// A faucet funded parent may not cover both at once, so --only launches one and the other
// follows after a top up. --headroom trims the spare NEAR funded per account.
//
// Signing uses near-cli-rs and whatever key store it already has for the parent account,
// so this script never sees a key. Authorise the parent first:
//
//   near account import-account using-seed-phrase --network-id testnet
//
// Every step is idempotent to attempt: an account that already carries a contract is
// skipped, an account that exists without one is used as is, and only the rest are created.
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { flagReader, fundingFor, near, preflight, sha256Hex, viewAccount } from './lib/near-deploy.mjs'

const args = process.argv.slice(2)
const flag = flagReader(args)
const execute = args.includes('--execute')

const parent = flag('parent', 'totemtest.testnet')
const network = flag('network', 'testnet')
const tokenAccount = flag('token-account', `token.${parent}`)
const nftAccount = flag('nft-account', `nft.${parent}`)
const headroom = Number(flag('headroom', '0.5'))

const DECIMALS = Number(flag('decimals', '18'))
const SUPPLY = BigInt(flag('supply', '1000000000')) * 10n ** BigInt(DECIMALS)

const WASM = resolve('contracts/target/wasm32-unknown-unknown/release')
const everything = {
  token: resolve(WASM, 'totem_token.wasm'),
  nft: resolve(WASM, 'totem_nft.wasm')
}
// Launching both needs more NEAR than one faucet grant tends to give, so either can go first.
const only = String(flag('only', '')).split(',').map(name => name.trim()).filter(Boolean)
// This runs before the try block, so it reports itself rather than throwing a stack trace.
for (const name of only) {
  if (everything[name]) continue
  console.error(`Unknown contract "${name}". Choose from: ${Object.keys(everything).join(', ')}`)
  process.exit(1)
}
const artifacts = only.length ? Object.fromEntries(only.map(name => [name, everything[name]])) : everything

const run = near({ execute })

try {
  for (const [label, path] of Object.entries(artifacts)) {
    if (!existsSync(path)) throw new Error(`Missing ${path} (${label}). Run: npm run build:contracts`)
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
  console.log(`  nft max supply  ${nftArgs.max_supply}`)
  console.log('\n  Supply and collection size are placeholders. Pass --supply and --max-supply.')
  console.log('\nArtifact hashes, for TokenArtifactSha256 and NftArtifactSha256 on the stack:')
  for (const [label, path] of Object.entries(artifacts)) console.log(`  ${label.padEnd(6)} ${sha256Hex(path)}`)

  const accounts = { token: tokenAccount, nft: nftAccount }
  const initArgs = { token: tokenArgs, nft: nftArgs }
  const funding = Object.fromEntries(Object.entries(artifacts).map(([label, path]) => [label, fundingFor(path, headroom)]))
  const needed = Object.values(funding).reduce((total, amount) => total + amount, 0) + 0.5 // the parent keeps a little for gas

  console.log('\nFunding, sized from the artifacts:')
  for (const label of Object.keys(artifacts)) console.log(`  ${accounts[label].padEnd(26)} ${funding[label]} NEAR`)
  console.log(`  needed on ${parent}: about ${needed.toFixed(1)} NEAR`)

  // Which key store holds the key decides the signer, so it comes from the preflight
  // rather than being assumed. --signer overrides it.
  const { signer, saveTo } = await preflight({ network, parent, needed, execute, signer: flag('signer') })

  for (const [label, path] of Object.entries(artifacts)) {
    const account = accounts[label]
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
    run(['contract', 'deploy', account, 'use-file', path,
      'with-init-call', 'new', 'json-args', JSON.stringify(initArgs[label]),
      'prepaid-gas', '100.0 Tgas', 'attached-deposit', '0 NEAR',
      'network-config', network, signer, 'send'],
      `Deploy the ${label} to ${account}`)
  }


  console.log('\nAfterwards, point the stack at the deployed contracts:')
  if (artifacts.token) console.log(`  TotemTokenContractId=${tokenAccount}`)
  if (artifacts.nft) console.log(`  TotemNftContractId=${nftAccount}`)
  console.log(execute ? '\nLaunched.' : '\nPlan only. Nothing was created or deployed.')
} catch (error) {
  console.error(`\nLaunch stopped: ${error.message}`)
  if (error.detail) console.error(error.detail)
  process.exit(1)
}
