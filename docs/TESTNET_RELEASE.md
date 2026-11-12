# Totem testnet release checklist

## Ready now

- Static product, responsive layout, wallet selector, authenticated API, DynamoDB persistence, CloudFront, S3, Lambda, and custom domain.
- Launch quoting fails closed when factory deployment is unavailable.
- Culture Pair model, anti-snapshot eligibility, contributions, access decisions, Arena economy planning, agent spending policy, and market listing preparation.
- Token, NFT, agent, market, and launch contract source plus automated JavaScript tests.

## Launching on testnet

Testnet contracts deploy under **`totemtest.testnet`**, as `token.totemtest.testnet` and
`nft.totemtest.testnet`.

```
npm run build:contracts          # produces the wasm
npm run launch:testnet           # prints the plan, changes nothing
npm run launch:testnet -- --execute
```

The script sizes each sub-account's funding from its artifact, because NEAR stakes
1 NEAR per 100KB and a deployed contract stores its own code.

Two things are checked before anything is created, so a launch cannot stop half done with
one sub-account made and the other not:

- the parent's balance, refused with the exact shortfall;
- that one of near-cli-rs's key stores holds a key matching a full access key the parent
  actually has on chain. Without this, near-cli-rs prompts for the missing key and hangs,
  because the script runs with no stdin to answer it.

Signing goes through near-cli-rs and its existing key store, so the script never sees a
key. Authorise the parent once:

```
near account import-account using-seed-phrase --network-id testnet
```

Reproducible artifact hashes, which the backend's deployment gate already expects:

| Contract | SHA-256 |
| --- | --- |
| `totem_token.wasm` | `2A1E7AA0902619272226ACDEFB06D51FD3BDF0196FBCC94C3F45CA9FFCECED9E` |
| `totem_nft.wasm` | `9FBB3EF2F7E4E3682784035A466FF02CAAF766526516A6F4386DC72039587929` |

After the deploy, repoint the stack parameters `TotemTokenContractId` and
`TotemNftContractId` at the new accounts. They are CloudFormation parameters, so no code
changes.

Note: `npm run test:contracts` does not run on Windows. `near-sdk`'s `unit-testing`
feature pulls in `aws-lc-sys`, which needs NASM to build for the host. The wasm build is
unaffected and CI runs the tests on Ubuntu.

## Waiting for funded NEAR testnet accounts

1. Create and fund the factory, token, NFT, agent, market, treasury, quest, and liquidity accounts.
2. Build WASM artifacts in Linux CI and record SHA-256 hashes.
3. Deploy contracts and initialize owners, spending caps, approved actions, and treasury limits.
4. Set deployed contract IDs and hashes in the backend environment.
5. Run Token, NFT, and Twin launch smoke tests using disposable testnet communities.
6. Enable launch quotes only after those receipts pass review.

## Social treasury activation

1. Create or connect a Sputnik DAO controlled by the community.
2. Configure proposer and council roles, approval threshold, spending permissions, and proposal bond.
3. Fund the DAO with testnet NEAR and record its policy response.
4. Prepare one capped Arena reward proposal in Totem and submit it through Meteor Wallet or Trezu.
5. Approve and execute it with the required DAO members.
6. Record the proposal ID, proposal hash, transaction hash, and execution result.
7. Finalize the Totem receipt and verify that only an approved proposal becomes Arena-reward eligible.

## Explicitly later

- NEAR Intents cross-chain funding and origin proofs.
- Onchain Totem name registry.
- Mainnet deployment, security audit, and irreversible fee configuration.

## Operations

- Replace AWS root CLI credentials with a least-privilege deployment role before routine operations.
- Run `npm test` and `npm run test:static` before every publish.
- Confirm `/api/v1/health`, `/api/v1/readiness`, and `/api/v1/campaigns` after deployment.
