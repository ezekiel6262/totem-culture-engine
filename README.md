# Totem: the culture engine on NEAR

Totem lets a community launch a Token, NFT collection, or Twin Culture Pair, then make that culture playable through evolving identity, access, quests, treasury rules, Arena seasons, autonomous Culture Agents, and player-owned markets. `$TOTEM` is an example community, not a platform access token.

Live product: https://mytotem.buzz

## The problem

Memecoins launch quickly but struggle to sustain coordinated culture. NFT communities own art but rarely own useful behavior. Totem connects both sides: Forge creates the economy, Culture Accounts represent membership and progression, Arena makes the culture playable, Agents automate bounded activity, and the Market keeps earned assets player-owned.

## Judge walkthrough

1. Open https://mytotem.buzz/Forge-Origin.dc.html. See exactly three launch paths: Token, NFT, and Twin.
2. Open https://mytotem.buzz/Arena.dc.html. Explore the world map and inspect the deterministic game loop, quests, treasury consequences, and Culture Account progression.
3. Open https://mytotem.buzz/Traits.dc.html. Inspect the player-owned trait-market design.
4. Run `npm test`. See deterministic eligibility, agent policy, market, launch, and Arena-economy tests pass.
5. Run `npm run test:static`. See every local page and asset reference verified.

The public UI labels sample data and incomplete integrations. Contract deployment remains gated until the funded testnet accounts are ready.

## Track fit

- NFTs That Do Something: Culture Accounts carry inventory, credentials, memberships, access rights, royalties, and evolution.
- Memecoins With Mechanics: Arena turns a token community into rule-bound rituals, bagwork, treasury challenges, and evolving seasons.
- Games With Real Economies: Culture Agents have constrained budgets, players own market assets, and season parameters evolve from finalized data.
- Social Money: programmable rewards, shared budgets, reputation-aware access, and contribution receipts.
- Open Innovation: reciprocal Token/NFT economies and culture-owned game systems.

## Current release state

- The product and API are live at [mytotem.buzz](https://mytotem.buzz).
- The release targets NEAR testnet and fails closed while factory contracts are not audited and deployed.
- Forge supports three clear launch paths: Token, NFT, and Twin. Rituals and events are Arena mechanics attached to an existing Culture Pair.
- Arena, Explore, Council, and Trait Market clearly label sample data when the API has no published campaigns.
- NEAR Intents and Totem onchain names are planned integrations, not live features.
- Contract source exists for tokens, NFTs, Culture Agents, the player market, and launch infrastructure. Funded testnet accounts are still required for deployment.

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

Health and readiness are exposed at `/api/v1/health` and `/api/v1/readiness`.

See [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and [docs/TESTNET_RELEASE.md](docs/TESTNET_RELEASE.md).
