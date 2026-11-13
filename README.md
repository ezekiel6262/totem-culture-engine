# Totem: NFTs that hold the meme

Totem is a culture platform on NEAR where an NFT is an account that holds money. A Totem is a
NEAR sub-account that locks `$TOTEM` inside itself, piece by piece, and that locked value is
what gives it standing: entry to Arena rooms, a price on the player-owned market, and a
rental income when someone else plays it.

Live product: **https://mytotem.buzz**

## The problem

A memecoin holder has a balance and nothing to do with it. An NFT holder owns a picture that
does nothing. Totem joins the two: locking tokens into a Totem is what makes the NFT useful,
and the only way to get the tokens back out is to take the Totem apart. Ownership with a
cost, and with behaviour.

## How the mechanism works

- A Totem holds up to **4 pieces**. Each piece is **25,000 `$TOTEM`** locked inside it, so a
  full Totem holds 100,000.
- Each Totem lives at its own NEAR sub-account, `<id>.totemtest.testnet`, so it can own
  assets rather than merely be owned.
- **Arena rooms gate entry on pieces**, not on a balance you could borrow for a block. A room
  that wants 2 pieces is asking you to have locked 50,000 `$TOTEM` and left it locked.
- **Merging** two Totems combines their pieces, capped at 4, and burns the weaker identity.
- **Renting** lends a Totem's standing for a fixed term without transferring custody.
- A **Culture Agent** pays out quest rewards under published caps: a per-payment maximum, a
  daily cap, and an allowlist of actions. It can spend, but it cannot run away with the
  treasury.

## Judge walkthrough

Every step below was verified against the live deployment. Nothing here needs a wallet except
step 4.

**1. The product.** Open https://mytotem.buzz. It is one page with hash routes: `#market`,
`#claim`, `#profile`, `#arenas`, `#season`, `#rules`, `#nft-0417`.

**2. Real cross-chain pricing (NEAR Intents).** Open https://mytotem.buzz/#market and find
"Bring funds from another chain". The asset list is the live solver inventory, not a fixture:

```sh
curl -s https://mytotem.buzz/api/v1/intents/routes | head -c 400
```

See **222 origin assets** across eth, sol, base, bsc, aptos, arb, op, avax and more, each with
a price and a `priceUpdatedAt` timestamp from minutes ago, all routed to `wNEAR`.

Press "Get a price" for a live quote from the 1Click solver network. Quotes are requested with
`dry: true` and come back `executable: false` — see "NEAR Intents, honestly" below for why
that is the correct behaviour rather than a gap. If the solver network is not answering, the
page says so plainly instead of inventing a number.

**3. Claiming requires a real NEAR account.** There is no anonymous write path:

```sh
curl -s -X POST https://mytotem.buzz/api/v1/claims/starter -H 'content-type: application/json' -d '{}'
```

See `AUTH_REQUIRED` — "Connect a wallet to do that". A starter Totem belongs to an account,
and creating that account is the wallet's job, not ours.

**4. Wallet sign-in (NEP-413).** Open https://mytotem.buzz/#profile and press "Connect NEAR
wallet". Signing is a gas-free NEP-413 message, not a transaction: it proves the account is
yours without moving anything. The server then registers the account and writes a ledger
entry. With a session, the lock and unlock buttons on that page are authenticated writes
against DynamoDB.

**5. The read API.** All of these are live:

```sh
curl -s https://mytotem.buzz/api/v1/health
curl -s https://mytotem.buzz/api/v1/arenas
curl -s https://mytotem.buzz/api/v1/seasons/current/standings
```

**6. The tests.**

```sh
npm install
npm run judge:verify   # the whole gate: tests, static audit, submission audit
```

Or each part on its own:

```sh
npm test               # 114 tests
npm run test:static    # rebuilds the page and verifies every local reference
npm run test:submission # checks the judge files and disclosures are present
```

## What is live, what is simulated, what is not deployed

Stated plainly, because the UI labels it and a judge should not have to guess.

| Part | State |
| --- | --- |
| Product, API, DynamoDB persistence, CloudFront + Lambda | **Live** at mytotem.buzz |
| NEP-413 wallet sign-in and account registration | **Live** |
| Authenticated writes: claim a starter, lock and unlock pieces | **Live** |
| NEAR Intents funding routes and quotes | **Live**, mainnet-priced and dry (see below) |
| Rate limiting on the public claim path | **Live**, hashed identifiers only |
| Claiming `$TOTEM` and a mint permit | **Live**, both move real tokens or grant a real permit |
| Arena entry, gated on `$TOTEM` held on chain | **Live**, read from NEP-141 at request time |
| Arena prizes, paid from the prize account | **Live**, a real transfer per finished game |
| Arena operator console: entry rule, prizes, pause, settle | **Live**, operator checked on the server |
| Arena gameplay itself, scores and race times | **Simulated in the browser**, and the result is self reported |
| Culture Agent (bounded spending) | **Live on testnet** at `agent.totemtest.testnet` |
| Launchpad factory | **Live on testnet** at `launch.totemtest.testnet`, and used: `founders.launch.totemtest.testnet` was launched through it |
| Totem NFT contract (NEP-171) | **Live on testnet** at `nft.totemtest.testnet` |
| Totem token contract (NEP-141) | **Live on testnet** at `token.totemtest.testnet` |
| Player-owned market (NEP-171 royalties) | **Live on testnet** at `market.totemtest.testnet` |
| Culture Agent (bounded spending) | **Live on testnet** at `agent.totemtest.testnet` |
| Launchpad factory contract | **Source and tests complete, not yet deployed** |

The contracts are real Rust against `near-sdk 5.30.1` with tests, and they build
reproducibly. **The Totem NFT contract is deployed to NEAR testnet** at
`nft.totemtest.testnet`, and the deployed code is the artifact in this repository: its
on-chain `code_hash` is `DiPyuXCQAdmx32xVWMQ4zU9RHkBKFNAW2SPLcwwmdXJv`, which is the base58 of the sha256
`BCE70A87CC289AA60C5DE3099B9C89FFB0F6D330638A37BC75713FE4B6997667` that `infrastructure/template.yaml` pins. Check both yourself:

```sh
curl -s https://rpc.testnet.near.org -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":"1","method":"query","params":{"request_type":"view_account","account_id":"nft.totemtest.testnet","finality":"final"}}'
```

The collection is 10,000 Totems with a 5% creator and 2.5% treasury royalty, which the
contract reports itself:

```sh
near contract call-function as-read-only nft.totemtest.testnet launch_config \
  json-args {} network-config testnet now
```

`$TOTEM` is live too, at `token.totemtest.testnet`, NEP-141 with 18 decimals and a total
supply of **1,000,000,000**, all of it held by the owner account at launch. Its on-chain
`code_hash` is `3qR5b6C3wVcgQ1iiJBwPkdp24hFEUFARytTUzWMe9a1j`, the base58 of the sha256
`2A1E7AA0902619272226ACDEFB06D51FD3BDF0196FBCC94C3F45CA9FFCECED9E` that the template pins.

That supply is exactly the lockable float: 10,000 Totems x 4 pieces x 25,000 `$TOTEM` is
1,000,000,000, so a fully built collection would hold every token in existence. In practice
not every Totem is fully built, and the unlocked remainder is what funds Arena prizes and
quest rewards, so rewards and locking draw on the same float rather than on a separate
emission.

The market and the Culture Agent are live too, at `market.totemtest.testnet` (code hash
`C1GguQ854deoNGuFqThJhL8AVbpDrXxoTjW4yTZnwarV`) and `agent.totemtest.testnet` (code hash
`2xxUTo1pgx5gHgiUqHBQVNPgSZYQMHPSkuqz9D3Cxefh`). The agent's caps are not a claim about a prompt, they
are state you can read off the chain:

```sh
near contract call-function as-read-only agent.totemtest.testnet get_policy \
  json-args {} network-config testnet now
# max_payment 1 NEAR, daily_cap 5 NEAR, paused false
```

Being straight about one limit: the agent holds 2.10 NEAR, nearly all of it staked for its
own storage, so `available_budget` is about 0.49 NEAR. A payment above that fails for lack
of balance before the 1 NEAR cap is ever reached. The cap is real and enforced in the
contract; the treasury behind it is testnet-sized.

Only the launchpad factory is still undeployed. It needs its own funded sub-account, and
`docs/TESTNET_RELEASE.md` records the exact cost and command for each. Launch quoting fails
closed in the meantime, in `backend/src/launch-quotes.js`, rather than pretending a factory
exists.

## NEAR Intents, honestly

`HACKATHON.md` Q-007 says there is no Intents testnet and none planned, and prescribes
mainnet with `dry: true` quotes. That is exactly what `backend/src/intents.js` does:

- Every quote sets `dry: true`, so the solver prices a route and never issues a deposit
  address. No code path in this repository can move funds through Intents.
- The response carries `executable: false` and `network: 'mainnet'`, and the UI repeats both,
  so a mainnet price is never passed off as a testnet action.
- No 1Click JWT, so the public 0.2% fee applies (Q-006). No partner credentials in the repo.

## Track fit

- **`nfts` NFTs That Do Something** — a Totem is a NEAR sub-account that holds `$TOTEM`
  inside itself and earns rent. NEP-171, sub-accounts, dynamic state.
- **`memecoins` Memecoins With Mechanics** — `$TOTEM` is only useful once locked, 25,000 at a
  time, and unlocking costs you the Totem's standing. NEP-141.
- **`games` Games With Real Economies** — Arena entry is gated on locked pieces, and the
  market keeps what players earn in their own hands.
- **`security` AI Security & Defense** — the Culture Agent has a per-payment cap, a daily cap
  and an action allowlist enforced in the contract, not in a prompt.
- **`agents` Agent Economy** — that agent pays quest rewards autonomously inside those bounds.
- **`social` Social Money** — Arena rewards are prepared as bounded Sputnik DAO or Trezu
  proposals. `backend/src/social-treasury.js` always returns `DAO_APPROVAL_REQUIRED`: the DAO
  stays custodian and approver, and Totem never executes a community treasury itself.
- **`defi` Unstoppable DeFi** — NEAR Intents routes value from 222 assets across 12 chains
  into NEAR to fund a position.

## Run locally

```sh
npm install
npm test
npm run test:static
npm start
```

Node.js 22 or newer. The local product runs at `http://127.0.0.1:4210`. Health and readiness
are at `/api/v1/health` and `/api/v1/readiness`. No secrets are needed to run the tests or the
local server.

## Repository structure

- `contracts/` — NEAR contracts in Rust: `totem-token` (NEP-141), `totem-nft` (NEP-171),
  `totem-factory` (launchpad), `totem-agent` (bounded spending), `totem-market`.
- `backend/` — the API, the domain model, the Lambda adapter and 114 tests.
- `frontend/site/` — the page, built from ordered parts into `dist/index.html`.
- `scripts/` — site build, static audit, frontend deploy, testnet deploy and launch.
- `infrastructure/` — AWS SAM: Lambda, DynamoDB, S3, CloudFront.
- `docs/` — architecture, product spec, backend plan, and the testnet release checklist.

## Hackathon disclosure

Built for NEAR HACKATHON. The repository's first commit is 2026-11-06, inside the window that
opened with the announcement on 2026-10-19, so the whole repository is hackathon work with no
pre-hackathon baseline to separate.

Written with AI-assisted coding. Dependencies are listed in `package.json` and
`contracts/Cargo.toml`: `near-sdk` and `near-contract-standards` for the contracts,
`@near-wallet-selector` for sign-in, Three.js for the Arena visuals, the AWS SDK for
persistence. No wallet keys or provider secrets are committed, and the deployment scripts sign
through near-cli-rs's own key store rather than reading keys themselves.

`npm run test:contracts` does not run on Windows: `near-sdk`'s `unit-testing` feature pulls in
`aws-lc-sys`, which needs NASM for the host build. The wasm build is unaffected and CI runs
those tests on Ubuntu.

## Other hackathon project

The same solo builder is also submitting **Scion** as a separate, independent project: a
non-custodial strategy network with verifiable fork lineage and wallet-approved NEAR Intents
execution. Totem and Scion have separate products, repositories, demos and judging evidence.

[Scion live site](https://scionhub.xyz) · [Scion repository](https://github.com/ezekiel6262/scion)

## Licence

MIT. See [LICENSE](LICENSE).
