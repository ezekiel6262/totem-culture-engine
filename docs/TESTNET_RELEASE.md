# Totem testnet release checklist

## Ready now

- Static product, responsive layout, wallet selector, authenticated API, DynamoDB persistence, CloudFront, S3, Lambda, and custom domain.
- Launch quoting fails closed when factory deployment is unavailable.
- Culture Pair model, anti-snapshot eligibility, contributions, access decisions, Arena economy planning, agent spending policy, and market listing preparation.
- Token, NFT, agent, market, and launch contract source plus automated JavaScript tests.

## Deployment order

The platform goes up first, the Totem token and Totem NFT last. The launchpad instantiates
a launched token or collection from globally registered contract code, so the flagship Totem
token and Totem NFT are meant to be launched *through* the launchpad rather than deployed
directly beside it. Their supply and collection size are decided at that point.

1. Platform: launchpad factory, player owned market, Arena agent (`npm run deploy:platform`).
2. Register the token and NFT templates as global contracts. See the cost below.
3. Totem token and Totem NFT, launched through the launchpad (`npm run launch:testnet`
   remains the direct fallback).

## Deploying the platform

Platform contracts deploy under **`totemtest.testnet`**, as `launch.totemtest.testnet`,
`market.totemtest.testnet` and `agent.totemtest.testnet`. Note that `totem.testnet` is **not**
ours: it is a different owner's account, so nothing may be deployed under it.

```
npm run build:contracts          # produces the wasm
npm run deploy:platform          # prints the plan, changes nothing
npm run deploy:platform -- --execute
```

All three need about 7.2 NEAR on the parent, staked as storage on the sub-accounts and
recoverable by deleting them.

### Fitting a faucet funded parent

`--only` deploys a subset and `--headroom` tunes the per-account margin above the code size,
because on a faucet funded account that margin decides what fits.

| Command | Needs |
| --- | --- |
| `--only factory` | 2.8 NEAR |
| `--only factory,agent` | 4.9 NEAR |
| `--only factory,market` | 5.1 NEAR |
| all three, `--headroom 0.1` | 6.0 NEAR |
| all three, default headroom | 7.2 NEAR |

Deploying a subset is safe to repeat: an account that already carries a contract is skipped,
so a later run completes the rest.

Afterwards set the stack parameters it prints:

| Parameter | Value |
| --- | --- |
| `ArenaMarketContractId` | `market.totemtest.testnet` |
| `ArenaAgentContractId` | `agent.totemtest.testnet` |
| `TotemFactoryContractId` | `launch.totemtest.testnet` |
| `TotemAccountSuffix` | `totemtest.testnet` |

`TotemAccountSuffix` matters beyond the launchpad: every account the backend names in a call
plan is derived from it, so without it a testnet deployment shows `token.totem.near` and the
other mainnet names in the UI.

### What the launchpad cannot do yet

`totem-factory` launches instances with the `UseGlobalContract` action, which requires the
template code to be registered on chain as a global contract first. The script prints the
two template hashes but does not register them, because a global contract costs **10 NEAR
per 100KB and the amount is burnt, not staked**:

| Template | Size | To register globally |
| --- | --- | --- |
| `totem_token.wasm` | 205,419 bytes | ~20.5 NEAR, burnt |
| `totem_nft.wasm` | 350,858 bytes | ~35.1 NEAR, burnt |

That is about **55.6 NEAR, non-refundable**, which is far beyond what the testnet faucet
supplies. Until the templates are registered, the factory still quotes and records a launch,
but the launch call fails and `finish_launch` marks it `failed_recovery_pending`, refunding
the service fee while the instance deposit waits on reconciliation. So do not call `launch`
on a factory whose templates are unregistered. The backend already fails closed here:
`launch-quotes.js` returns `executable: false` with an explicit reason.

Global registration pays for itself only across many launches, since each instance then
costs well under 0.001 NEAR for the code reference instead of staking its own copy. For a
testnet proving run, registering a deliberately small stub template is the cheap way to
exercise the launch path end to end.

## Launching the Totem token and NFT

These come last, after the platform is up. The collection size is decided at **10,000
Totems**, which is the script default. The token total supply is not decided yet, so
`--supply` must be passed when the token is launched.

```
npm run launch:testnet                     # prints the plan, changes nothing
npm run launch:testnet -- --execute --supply <n> --max-supply <n>
npm run launch:testnet -- --only nft --execute --max-supply <n>
```

Both together need about 7.2 NEAR on the parent. `--only` launches one at a time, which is
what a single faucet grant covers, and the other follows after a top up:

| Selection | Needed on the parent |
| --- | --- |
| `--only token` | 3.1 NEAR |
| `--only nft` | 4.6 NEAR |
| both, default headroom | 7.2 NEAR |

Re-running is safe: an account that already carries a contract is skipped, and an account
that exists without one is deployed to as is.

Both scripts size each sub-account's funding from its artifact, because NEAR stakes
1 NEAR per 100KB and a deployed contract stores its own code.

Two things are checked before anything is created, so a launch cannot stop half done with
one sub-account made and the other not:

- the parent's balance, refused with the exact shortfall;
- that one of near-cli-rs's key stores holds a key matching a full access key the parent
  actually has on chain. Without this, near-cli-rs prompts for the missing key and hangs,
  because the script runs with no stdin to answer it.

near-cli-rs keeps keys in two stores and never looks in the other one: `keychain` is the
operating system credential store, and `legacy-keychain` is `~/.near-credentials`, the
layout the old JS CLI used. `near account import-account` writes to the legacy store, so
the preflight reports which store holds the key and signs with that one. Naming the wrong
store fails at signing time, after sub-accounts have already been created and funded.
Override it with `--signer sign-with-keychain` or `--signer sign-with-legacy-keychain`.

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
