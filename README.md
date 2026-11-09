# Totem: Culture Engine on NEAR

Totem lets a community launch a Token, NFT collection, or Twin Culture Pair, then make that culture playable through evolving identity, access, quests, treasury rules, Arena seasons, autonomous Culture Agents, and player-owned markets. `$TOTEM` is an example community, not a platform access token.

Live product: https://mytotem.buzz

Repository status: testnet release candidate. The hosted interface and API are live; contract source and reproducible WASM builds are included. Testnet deployment receipts will be added after the project account is funded.

## The problem

Memecoins launch quickly but struggle to sustain coordinated culture. NFT communities own art but rarely own useful behavior. Totem connects both sides: Forge creates the economy, Culture Accounts represent membership and progression, Arena makes the culture playable, Agents automate bounded activity, and the Market keeps earned assets player-owned.

## Judge quickstart

### Hosted path

1. Open https://mytotem.buzz/Forge-Origin.dc.html. See exactly three launch paths: Token, NFT, and Twin.
2. Open https://mytotem.buzz/Arena.dc.html. Explore the world map and inspect the deterministic game loop, quests, treasury consequences, and Culture Account progression.
3. Open https://mytotem.buzz/Traits.dc.html. Inspect the player-owned trait-market design.
4. Open https://mytotem.buzz/Treasury.dc.html. Prepare a bounded Sputnik or Trezu treasury proposal and inspect the DAO-approval boundary.

### Reproduce from a clean clone

```powershell
git clone https://github.com/ezekiel6262/totem-culture-engine.git
cd totem-culture-engine
npm ci
npm run judge:verify
npm start
```

Open `http://127.0.0.1:4210`. The verification command must finish with passing backend tests, a passing 23-page static audit, and a passing submission-structure audit. Rust contract verification runs separately with `npm run test:contracts`.

The public UI labels sample data and incomplete integrations. Contract deployment remains gated until the funded testnet accounts are ready.

## Track fit

- NFTs That Do Something: Culture Accounts carry inventory, credentials, memberships, access rights, royalties, and evolution.
- Memecoins With Mechanics: Arena turns a token community into rule-bound rituals, bagwork, treasury challenges, and evolving seasons.
- Games With Real Economies: Culture Agents have constrained budgets, players own market assets, and season parameters evolve from finalized data.
- Social Money: Totem converts verified work into policy-checked Sputnik DAO transfer or bounty proposals. Communities can operate those proposals through Trezu; the DAO remains custodian and approver while Culture Agents stay inside published caps and allowlists.
- Open Innovation: reciprocal Token/NFT economies and culture-owned game systems.

Recommended submission tracks: `games`, `nfts`, `memecoins`, and `social`. Open Innovation is part of the product framing, but the four named tracks have the clearest implemented evidence.

See [JUDGES.md](JUDGES.md) for a feature-to-code map, expected outputs, and current limitations.

## Current release state

- The product and API are live at [mytotem.buzz](https://mytotem.buzz).
- The release targets NEAR testnet and fails closed while factory contracts are not audited and deployed.
- Forge supports three clear launch paths: Token, NFT, and Twin. Rituals and events are Arena mechanics attached to an existing Culture Pair.
- Arena, Explore, Council, and Trait Market clearly label sample data when the API has no published campaigns.
- NEAR Intents and Totem onchain names are planned integrations, not live features.
- Contract source exists for tokens, NFTs, Culture Agents, the player market, and launch infrastructure. Funded testnet accounts are still required for deployment.

## Why NEAR

- NEP-141 supplies the fungible Culture Pair token primitive.
- NEP-171 supplies programmable Culture Accounts with credentials, inventory, access, and evolution state.
- NEAR named accounts make community, treasury, agent, and contract identities understandable.
- NEP-413 wallet authentication proves account control without asking the backend to custody keys.
- Sputnik DAO and Trezu provide community custody and approval while Totem supplies bounded reward and bounty mechanics.
- Rhea planning supports initial token liquidity without disguising liquidity as a platform fee.

## Run and verify

```powershell
npm test
npm run test:static
npm start
```

Node.js 22 or newer is required. The local product runs at `http://127.0.0.1:4210`.

## Repository structure

- `contracts/`: NEAR token, NFT, factory, Culture Agent, and market contracts.
- `backend/`: authenticated API, deterministic domain services, Lambda adapter, and tests.
- `dist/`: deployable product, Forge, Arena, markets, and wallet integration.
- `infrastructure/`: AWS SAM infrastructure for Lambda, DynamoDB, S3, and CloudFront.
- `docs/`: architecture, product specification, and testnet release checklist.

## Hackathon disclosure

Totem was developed during the NEAR HACKATHON window with AI-assisted coding and design iteration. It uses open-source dependencies listed in `package.json`, AWS managed infrastructure, Three.js for Arena visuals, and NEAR wallet-selector packages. The repository contains no committed wallet keys or provider secrets.

The same solo builder is also submitting **Scion**, a separate and independent project. Scion is a non-custodial strategy network for private strategies, public proof, verifiable fork lineage, wallet-approved NEAR Intents execution, and bounded user-owned agents. Totem and Scion have separate products, repositories, codebases, demos, descriptions, evidence, and submission records. No Scion feature or evidence is claimed by Totem.

[Scion live site](https://scionhub.xyz) | [Scion repository](https://github.com/ezekiel6262/scion)

The first Totem commit is dated 2026-11-06, inside the eligible development window. This is a new repository, so no pre-hackathon baseline branch is required.

Health and readiness are exposed at `/api/v1/health` and `/api/v1/readiness`.

See [JUDGES.md](JUDGES.md), [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/NEAR_EVIDENCE.md](docs/NEAR_EVIDENCE.md), and [docs/TESTNET_RELEASE.md](docs/TESTNET_RELEASE.md).
