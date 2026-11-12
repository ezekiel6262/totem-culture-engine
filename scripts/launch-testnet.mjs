// Launches the Totem token and the Totem NFT collection on NEAR testnet.
//
// This runs AFTER the rest of the platform is deployed and working on testnet, since the
// intended route is to launch them through the launchpad rather than deploy them directly.
// Supply and collection size are decided at that point, so treat the defaults below as
// placeholders and pass the real figures.
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
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { flagReader, fundingFor, near, preflight, sha256Hex } from './lib/near-deploy.mjs'

const args = process.argv.slice(2)
const flag = flagReader(args)
const execute = args.includes('--execute')

const parent = flag('parent', 'totemtest.testnet')
const network = flag('network', 'testnet')
const tokenAccount = flag('token-account', `token.${parent}`)
const nftAccount = flag('nft-account', `nft.${parent}`)

const DECIMALS = Number(flag('decimals', '18'))
const SUPPLY = BigInt(flag('supply', '1000000000')) * 10n ** BigInt(DECIMALS)

const WASM = resolve('contracts/target/wasm32-unknown-unknown/release')
const artifacts = {
  token: resolve(WASM, 'totem_token.wasm'),
  nft: resolve(WASM, 'totem_nft.wasm')
}

const run = near({ execute })

try {
  for (const [, path] of Object.entries(artifacts)) {
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
  console.log(`  nft max supply  ${nftArgs.max_supply}`)
  console.log('\n  Supply and collection size are placeholders. Pass --supply and --max-supply.')
  console.log('\nArtifact hashes, for TokenArtifactSha256 and NftArtifactSha256 on the stack:')
  console.log(`  token  ${sha256Hex(artifacts.token)}`)
  console.log(`  nft    ${sha256Hex(artifacts.nft)}`)

  const funding = { token: fundingFor(artifacts.token), nft: fundingFor(artifacts.nft) }
  const needed = funding.token + funding.nft + 0.5 // the parent keeps a little for gas

  console.log('\nFunding, sized from the artifacts:')
  console.log(`  ${tokenAccount}  ${funding.token} NEAR`)
  console.log(`  ${nftAccount}  ${funding.nft} NEAR`)
  console.log(`  needed on ${parent}: about ${needed.toFixed(1)} NEAR`)

  await preflight({ network, parent, needed, execute })

  for (const [account, label] of [[tokenAccount, 'token'], [nftAccount, 'nft']]) {
    run(['account', 'create-account', 'fund-myself', account, `${funding[label]} NEAR`,
      'autogenerate-new-keypair', 'save-to-keychain',
      'sign-as', parent, 'network-config', network, 'sign-with-keychain', 'send'],
      `Create ${label} account ${account}`)
  }

  run(['contract', 'deploy', tokenAccount, 'use-file', artifacts.token,
    'with-init-call', 'new', 'json-args', JSON.stringify(tokenArgs),
    'prepaid-gas', '100.0 Tgas', 'attached-deposit', '0 NEAR',
    'network-config', network, 'sign-with-keychain', 'send'],
    `Deploy the token to ${tokenAccount}`)

  run(['contract', 'deploy', nftAccount, 'use-file', artifacts.nft,
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
