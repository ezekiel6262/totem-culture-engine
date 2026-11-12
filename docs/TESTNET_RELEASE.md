# Totem testnet release checklist

## Ready now

- Static product, responsive layout, wallet selector, authenticated API, DynamoDB persistence, CloudFront, S3, Lambda, and custom domain.
- Launch quoting fails closed when factory deployment is unavailable.
- Culture Pair model, anti-snapshot eligibility, contributions, access decisions, Arena economy planning, agent spending policy, and market listing preparation.
- Token, NFT, agent, market, and launch contract source plus automated JavaScript tests.

## Deployment account

Testnet contracts deploy under **`totemtest.testnet`**.

The `totemstart` stack still carries the earlier placeholder contract ids
(`token.totem.testnet`, `nft.totem.testnet`, `agent.totem.testnet`,
`market.totem.testnet`). They are stack parameters, so they can be repointed at the real
sub-accounts without a code change once the naming is settled and the contracts exist.

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
