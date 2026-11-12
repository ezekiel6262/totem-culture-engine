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
- Arena games, prizes, balances and the demo wallet are **simulated in the browser** and
  labelled as such on the page.
- **The Totem NFT contract is live on NEAR testnet** at `nft.totemtest.testnet`, deployed
  from this repository's own artifact: its on-chain `code_hash` is `BkXRfFM7oBLH3SKeL5hEt2YAeRG7tbZ9Mm3KCJXUn1Dz`,
  the base58 of the sha256 pinned in `infrastructure/template.yaml`. `nft_metadata` and
  `launch_config` answer over public RPC, the latter reporting 10,000 max supply and the
  500 / 250 bps royalty split. Total supply is 0: nothing has been minted.
- The other four contracts are complete Rust with tests and build reproducibly, but are
  **not deployed yet** — each needs its own funded sub-account.
  `docs/TESTNET_RELEASE.md` holds the per-contract cost and the exact deploy command.
  Launch quoting fails closed meanwhile, in `backend/src/launch-quotes.js`.
- No mainnet deployment, no audit, and no yield or return claim.

## Independent second submission

The same solo builder is submitting [Scion](https://github.com/ezekiel6262/scion) as a second,
independent project: separate idea, repository, codebase, demo and evidence. This repository
contains only Totem. Scion is live at https://scionhub.xyz.
