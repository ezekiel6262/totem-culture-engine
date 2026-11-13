# Totem judge guide

The shortest reproducible path through Totem, with implemented evidence kept separate from
what is not deployed yet.

## What to evaluate

Totem is a culture platform on NEAR where an NFT is an account that holds money. A Totem is a
NEAR sub-account that locks `$TOTEM` inside itself, piece by piece, and that locked value is
what buys standing: entry to Arena rooms, a price on the player-owned market, rental income.
The claim is reciprocal — the token gains mechanics, and the NFT gains economic behaviour.

## Five-minute verification

```sh
npm ci
npm run judge:verify
npm start
```

Expected results:

1. `npm test` — **114 tests pass**: the domain model, claim rate limiting, wallet
   authentication, the Dynamo repository, Intents quoting, the Arena economy, agent spending
   caps, the social treasury boundary and launch planning.
2. The static audit reports **1 page, 14 source parts in sync**, and no missing local
   references. The page is built by concatenating `frontend/site/p1.html` … `p14.html`.
3. The submission audit reports **11 judge files**, the dual-project disclosure and the
   testnet boundary.
4. `http://127.0.0.1:4210` serves the same product as https://mytotem.buzz.

`npm run test:contracts` is deliberately not in `judge:verify`: `near-sdk`'s `unit-testing`
feature pulls in `aws-lc-sys`, which needs NASM to build for the host, so it does not run on
Windows. It runs in CI on Ubuntu, and the wasm build is unaffected.

## Verify the deployed contract, end to end

The Totem NFT contract is on NEAR testnet at `nft.totemtest.testnet`. Three commands prove
the deployed bytes are the artifact in this repository, with nothing taken on trust:

```sh
# 1. The artifact this project publishes, hashed.
curl -s https://mytotem.buzz/contracts/totem_nft.wasm | sha256sum
# bce70a87cc289aa60c5de3099b9c89ffb0f6d330638a37bc75713fe4b6997667
#    the same value infrastructure/template.yaml pins as NftArtifactSha256

# 2. What the chain says is deployed there.
curl -s https://rpc.testnet.near.org -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":"1","method":"query","params":{"request_type":"view_account","account_id":"nft.totemtest.testnet","finality":"final"}}'
# "code_hash": "DiPyuXCQAdmx32xVWMQ4zU9RHkBKFNAW2SPLcwwmdXJv"
#    which is the base58 of that same sha256

# 3. The collection terms, read from the contract itself.
near contract call-function as-read-only nft.totemtest.testnet launch_config \
  json-args {} network-config testnet now
# max_supply 10000, creator_royalty_bps 500, treasury_royalty_bps 250

# 4. The same for the token, at token.totemtest.testnet.
near contract call-function as-read-only token.totemtest.testnet ft_total_supply \
  json-args {} network-config testnet now
# "1000000000000000000000000000"  -> 1,000,000,000 at 18 decimals
#    deployed code_hash 3qR5b6C3wVcgQ1iiJBwPkdp24hFEUFARytTUzWMe9a1j
#    base58 of sha256 2A1E7AA0902619272226ACDEFB06D51FD3BDF0196FBCC94C3F45CA9FFCECED9E
```

`nft_total_supply` is `0`: the contract is deployed and initialised, and nothing has been
minted. The four other contracts are not deployed; each needs its own funded sub-account.

## The flow has already been run on chain

These are not instructions to try, they are transactions that happened. Every one is on
NEAR testnet and signed by `totemtest.testnet`. Read any of them back with the RPC query
below, or open `https://explorer.testnet.near.org/transactions/<hash>`.

| Step | Contract call | Transaction |
| --- | --- | --- |
| 1. Gate the mint | `nft.approve_eligibility` for branch `meme-commander` | `5sXi3Twz9ZMy8DEWtx3YEwkGxzrHiUHJC46eH9jTDCQm` |
| 2. Mint a Totem | `nft.mint` — emitted a NEP-171 `nft_mint` event for token `1` | `EYvswUA3SLXRoPj17sXugimRt7JGLdRc1BcyT6NmttEc` |
| 3. Register for the token | `token.storage_deposit` for the recipient (NEP-145) | `J1vMv2pAY58LjUREqUBPLpaSWZjKcE74MNkEeZSYxsdu` |
| 4. Move one piece | `token.ft_transfer` of 25,000 `$TOTEM`, NEP-141 `ft_transfer` event | `zLVnT2SxTWKSr5HgV9vgkm9BZ8GoN5xmvWLnqWbnZ8F` |
| 5. Approve the market | `nft.nft_approve` for `market.totemtest.testnet`, approval id 1 | `gnM7e6Ey5TpADpCYNq2RyXsV5Ze5ArGKsrYPx5GcyQK` |
| 6. List it | `market.list` at 1 NEAR, listing `nft.totemtest.testnet:1` | `4Sh7itV2MjxcxGtFPygKgJjibRRPnnUDYHE3KZHDHfHF` |
| 7. Pay a quest reward | `agent.pay_reward` 0.05 NEAR, action `quest_reward` | `FejmQ8Zv3cJ4RdVck59bJgL6kEsisxfJAeDcMvybURYo` |
| 8. **Refused** over the cap | `agent.pay_reward` for 2 NEAR against a 1 NEAR cap — aborted, nothing paid | `Gwue4hLvfNyobKPVxdYpNsporJes4nBptzB4G1ZUf9Kq` |

The resulting state, which anyone can query now:

```sh
near contract call-function as-read-only token.totemtest.testnet ft_balance_of \
  json-args '{"account_id":"totemtest.testnet"}' network-config testnet now
# "999975000000000000000000000"   and the recipient holds "25000000000000000000000"
#   the two sum to exactly 1,000,000,000 at 18 decimals

near contract call-function as-read-only market.totemtest.testnet listings \
  json-args '{"limit":5}' network-config testnet now
# one listing: nft.totemtest.testnet:1, seller totemtest.testnet, price 1 NEAR

near contract call-function as-read-only agent.totemtest.testnet get_reward \
  json-args '{"quest_id":"demo-quest-1"}' network-config testnet now
# the paid receipt: 0.05 NEAR, action quest_reward, with the day it counted against
```

### How to check the spending caps yourself

The caps are the security claim, so check them by state rather than by error text. Ask the
agent for a quest it refused and for one it paid:

```sh
near contract call-function as-read-only agent.totemtest.testnet get_reward \
  json-args '{"quest_id":"demo-quest-overcap"}' network-config testnet now
# null  -- the 2 NEAR attempt wrote no receipt and transferred nothing
```

Step 8 above is that attempt. It consumed gas and changed nothing: no receipt, no transfer,
and `available_budget` moved only by the 0.05 NEAR that step 7 legitimately paid.

**One rough edge, stated plainly.** These contracts are built with `panic = "abort"` and
`strip = true`, so a rejected call surfaces as a generic WebAssembly trap rather than the
`require!` message behind it. The guard holds either way — the state proves it — but a
caller sees `unreachable` instead of `Payment exceeds per-payment cap`. Rebuilding for
readable messages would change every code hash and need all four contracts redeployed, so
the deployed build is kept and the receipt query above is the verification path instead.

## Evidence by track

Product proof is a route on the live site. The page is one document with hash routes.

| Track | Product proof | Primary code | Test proof |
| --- | --- | --- | --- |
| `nfts` NFTs That Do Something | `#profile` — a Totem is a sub-account holding `$TOTEM`; lock and unlock pieces against the live API | `contracts/totem-nft`, `backend/src/totem-product.js`, `backend/src/evolution.js` | `backend/test/totem-product.test.js`, `backend/test/service.test.js` |
| `memecoins` Memecoins With Mechanics | `#rules`, `#claim` — 25,000 `$TOTEM` per piece, 4 pieces per Totem, locked to count | `contracts/totem-token`, `backend/src/rhea-launch.js` | `backend/test/deploy-plan.test.js`, `backend/test/rhea-launch.test.js` |
| `games` Games With Real Economies | `#arenas`, `#season` — entry gated on locked pieces, settled standings | `backend/src/arena-economy.js`, `contracts/totem-market` | `backend/test/arena-economy.test.js` |
| `security` AI Security & Defense | agent caps published in the Arena rules | `contracts/totem-agent` — per-payment cap, daily cap, action allowlist | `contracts/totem-agent/src/lib.rs` tests, `backend/test/arena-economy.test.js` |
| `agents` Agent Economy | quest rewards paid inside those bounds | `contracts/totem-agent` | as above |
| `social` Social Money | capped Sputnik or Trezu proposals, never executed by Totem | `backend/src/social-treasury.js` | `backend/test/social-treasury.test.js` |
| `defi` Unstoppable DeFi | `#market` — 222 live solver assets across 12 chains routed to wNEAR | `backend/src/intents.js` | `backend/test/intents.test.js` |

## One complete product moment

No wallet needed for steps 1–3.

1. Open https://mytotem.buzz/#market and find "Bring funds from another chain". The asset list
   is the live solver inventory — confirm with
   `curl -s https://mytotem.buzz/api/v1/intents/routes`, which returns 222 origin assets each
   carrying a price and a recent `priceUpdatedAt`. Press "Get a price" for a live quote.
2. Open `#claim`. It says a wallet is needed. Confirm there is no anonymous write path:
   `curl -s -X POST https://mytotem.buzz/api/v1/claims/starter -H 'content-type: application/json' -d '{}'`
   returns `AUTH_REQUIRED`.
3. Open `#arenas`. Each Arena shows its entry rule in pieces and the server's own decision for
   the current account, read from the live API.
4. Open `#profile`, press "Connect NEAR wallet", and sign. The signature is a gas-free NEP-413
   message, not a transaction. The account is then registered and gets a ledger entry, and the
   lock and unlock buttons become authenticated writes against DynamoDB.

## Truthful boundaries

- The product, API and persistence are live on AWS at https://mytotem.buzz.
- Wallet sign-in, account registration, the starter claim and piece locking are live and
  require a real NEAR account.
- **NEAR Intents is a live integration**, not a plan. Quotes come from the 1Click solver
  network. Every quote sets `dry: true` and returns `executable: false` with
  `network: 'mainnet'`, because `HACKATHON.md` Q-007 states there is no Intents testnet and
  prescribes mainnet dry quotes. No code path here can move funds through Intents. If the
  solver network is unavailable, the page says so rather than inventing a price.
- **An Arena prize is a real transfer.** Finishing a game pays `$TOTEM` from
  `prizes.totemtest.testnet` to the player's wallet, once per game per day, and only to an
  account that owns a Totem on chain. The race itself runs in the browser and reports its
  own result, so a score is a claim rather than a proof: that is why the prize is small,
  capped and rate limited, why the response carries `verified: false`, and why the page says
  a production Arena would have the race server sign results with the Arena's result signer
  key, which the contract-side model already expects.
- **Arena entry is read from the chain.** `checkEntry` asks NEP-141 what the account holds
  and answers which source qualified it, so a holder is never refused for pieces they can
  prove they have.
- **The operator console is real.** The Arena's operator can set the entry rule, both prize
  amounts, pause and reopen, and settle results past the dispute window. Every call checks
  the operator on the server; hiding the panel is only presentation.
- There is no demo wallet. Sign-in is NEP-413 through the Meteor extension, the Meteor web
  wallet or MyNearWallet, and Totem never holds a user's key: the mint and any purchase are
  signed by the holder.
- **The Totem NFT contract is live on NEAR testnet** at `nft.totemtest.testnet`, deployed
  from this repository's own artifact: its on-chain `code_hash` is `DiPyuXCQAdmx32xVWMQ4zU9RHkBKFNAW2SPLcwwmdXJv`,
  the base58 of the sha256 pinned in `infrastructure/template.yaml`. `nft_metadata` and
  `launch_config` answer over public RPC, the latter reporting 10,000 max supply and the
  500 / 250 bps royalty split. Total supply is 0: nothing has been minted.
- **The Totem token is live on NEAR testnet** at `token.totemtest.testnet`, NEP-141, 18
  decimals, total supply 1,000,000,000, all held by the owner at launch. Deployed from this
  repository's artifact by the same hash check. Note that the supply is exactly the lockable
  float for a fully built collection, so rewards and locking share one float rather than
  drawing on a separate emission.
- **The player-owned market is live** at `market.totemtest.testnet`, code hash
  `C1GguQ854deoNGuFqThJhL8AVbpDrXxoTjW4yTZnwarV`, initialised with a 250 bps fee to the treasury.
  `listings` returns `[]`: deployed and initialised, nothing listed.
- **The Culture Agent is live** at `agent.totemtest.testnet`, code hash
  `2xxUTo1pgx5gHgiUqHBQVNPgSZYQMHPSkuqz9D3Cxefh`. `get_policy` reports a 1 NEAR per-payment cap, a
  5 NEAR daily cap and `paused: false`, all enforced in the contract. Note that
  `available_budget` is about 0.49 NEAR, since the account's balance is mostly staked for
  its own storage, so a larger payment fails on balance before it reaches the cap.
- The launchpad factory is **written and compiles, and is not deployed**.
  `launch.totemtest.testnet` does not exist, and nothing in this submission depends on it.
  Its first design instantiated a launched collection from globally registered contract
  code, which costs 10 NEAR per 100KB **burnt rather than staked**, about 35 NEAR for the
  collection template, so it could not be deployed from a testnet faucet at all. It was
  rewritten to store the template and deploy it directly, which stakes roughly 4 NEAR
  instead and is recoverable, at the cost of each launched collection staking its own copy
  of the code. That makes it deployable; it has not been deployed, and this is the only
  part of Totem where the contract has never run on chain. Launching does not need it: the
  repository's launch script deploys the same contracts directly, and is what put the four
  live ones there.
  `docs/TESTNET_RELEASE.md` holds the per-contract cost and the exact deploy command.
  Launch quoting fails closed meanwhile, in `backend/src/launch-quotes.js`.
- No mainnet deployment, no audit, and no yield or return claim.

## Independent second submission

The same solo builder is submitting [Scion](https://github.com/ezekiel6262/scion) as a second,
independent project: separate idea, repository, codebase, demo and evidence. This repository
contains only Totem. Scion is live at https://scionhub.xyz.
