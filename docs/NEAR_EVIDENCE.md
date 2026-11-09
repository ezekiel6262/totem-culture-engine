# NEAR implementation evidence

## Implemented in code

| NEAR capability | Totem use | Evidence |
| --- | --- | --- |
| NEP-141 | Fixed-supply community token, explicit allocations, vesting, and culture mechanics | `contracts/totem-token` |
| NEP-171 | Culture Account NFT with mint economics, royalties, credentials, and evolution state | `contracts/totem-nft` |
| Named accounts | Human-readable contract, DAO, treasury, creator, and agent identities | launch configuration and deployment planners |
| NEP-413 | Wallet authentication without backend key custody | `backend/src/nep413.js`, `backend/src/auth.js`, `dist/wallet.js` |
| Function calls | Wallet-signed contract deployment, mint, market, agent, and DAO proposal plans | `backend/src/near-transactions.js`, `dist/totem-deploy.js` |
| Sputnik DAO | `add_proposal` plans for community transfers and bounties | `backend/src/social-treasury.js` |
| Trezu | Treasury management surface using the connected Sputnik DAO proposal path | `dist/Treasury.dc.html`, `backend/src/social-treasury.js` |
| Rhea | Canonical-pair and liquidity planning for token launches | `backend/src/rhea-launch.js` |

## Activation evidence to add after faucet funding

The following must be real transaction links, never invented placeholders:

1. Factory deployment and initialization transaction.
2. Token deployment and initialization transaction.
3. NFT deployment and initialization transaction.
4. Culture Agent and player market deployment transactions.
5. Token, NFT, and Twin launch smoke-test transactions.
6. Sputnik DAO proposal creation, approval, and execution receipts.
7. Rhea testnet-compatible evidence if available; otherwise retain it as a transaction planner and state that boundary explicitly.

## Safety properties

- Mainnet launch is disabled by configuration.
- Totem does not receive or store wallet private keys.
- Culture Agents use action allowlists, recipient policies, per-payment caps, and daily caps.
- Social Treasury prepares proposals but cannot bypass Sputnik approvals.
- Arena reward eligibility requires an approved proposal receipt bound to its proposal hash.
