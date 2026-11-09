# Totem judge guide

This file is the shortest reproducible path through Totem. It separates implemented evidence from planned testnet activation.

## What to evaluate

Totem lets a community launch a Token, NFT, or linked Twin Culture Pair, then use that pair inside a persistent Arena economy. The central claim is reciprocal: the token gains culture mechanics and the NFT gains economic behavior.

## Five-minute verification

```powershell
npm ci
npm run judge:verify
npm run test:contracts
npm start
```

Expected results:

1. Backend tests pass, including treasury caps, agent limits, deterministic seasons, player custody, wallet authentication, launch planning, and Culture Account eligibility.
2. The static audit reports 23 pages with no missing local references.
3. The submission audit reports all required judge files and disclosures.
4. Rust tests pass for the Token, NFT, factory, Culture Agent, and player market workspace.
5. `http://127.0.0.1:4210` opens the same product structure as https://mytotem.buzz.

## Evidence by track

| Track | Product proof | Primary code | Test proof |
| --- | --- | --- | --- |
| Games With Real Economies | Culture Agent budget rules, player-owned market, deterministic season evolution, Arena venue loop | `contracts/totem-agent`, `contracts/totem-market`, `backend/src/arena-economy.js`, `dist/Arena.dc.html` | `backend/test/arena-economy.test.js` |
| NFTs That Do Something | NEP-171 Culture Accounts with evolving state, credentials, access, inventory, royalties, and membership behavior | `contracts/totem-nft`, `backend/src/evolution.js`, `backend/src/service.js` | `backend/test/service.test.js`, `backend/test/deploy-plan.test.js` |
| Memecoins With Mechanics | NEP-141 launch allocations, vesting, Arena quests, treasury routing, and liquidity planning | `contracts/totem-token`, `contracts/totem-factory`, `backend/src/rhea-launch.js` | `backend/test/deploy-plan.test.js`, `backend/test/rhea-launch.test.js` |
| Social Money | Sputnik transfer and bounty proposals, Trezu workflow, policy caps, allowlists, and approval-bound Arena receipts | `backend/src/social-treasury.js`, `dist/Treasury.dc.html` | `backend/test/social-treasury.test.js` |

## Complete product moment

1. In Forge, choose Token, NFT, or Twin and configure only the parameters required for that origin.
2. Review the generated deployment and economic plan.
3. Enter Arena and inspect how finalized participation and treasury inputs derive the next season without a developer switch.
4. Inspect the player-owned market and Culture Agent spending limits.
5. Open Social Treasury and prepare a capped Sputnik proposal. The result remains `DAO_APPROVAL_REQUIRED`; Totem cannot execute the community treasury itself.

## Truthful boundaries

- The hosted product and API are live on AWS.
- The release is configured for NEAR testnet.
- Contract deployment and launch execution remain gated until funded testnet accounts and receipts are available.
- NEAR Intents is planned, not represented as a completed integration.
- Sample campaigns are labeled as sample data.
- No mainnet deployment, audit, guaranteed return, or passive-yield claim is made.

## Independent second submission

The same solo builder is submitting [Scion](https://github.com/ezekiel6262/scion) as a second project. Scion is independent: separate idea, repository, codebase, demo, evidence, and application. This repository contains only Totem. Scion is live at https://scionhub.xyz.
