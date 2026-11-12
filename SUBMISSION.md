# Totem submission readiness

Development ends **2026-11-14T23:59:00Z**. Submissions are accepted only inside the
development phase; outside it the API answers 403.

## Required before submission

- [x] MIT licence and CI workflow present.
- [x] Judge guide gives a reproducible `do X, see Y` path.
- [x] Track claims map to code and tests.
- [x] README discloses the lead's independent second project, Scion.
- [x] README walkthrough verified against the live deployment, with no dead links.
- [x] Repository made public.
- [ ] Verify a clean clone: `git clone`, `npm ci`, `npm run judge:verify`.
- [ ] Authorise `totemtest.testnet` for near-cli-rs: `near account import-account using-seed-phrase --network-id testnet`.
- [ ] Top up `totemtest.testnet` from https://near-faucet.io (testnet NEAR is free, Q-008).
- [ ] Deploy the Totem token and NFT: `npm run launch:testnet -- --execute`.
- [ ] Record the deployed contract ids and transaction hashes here.
- [ ] Repoint the stack parameters at the deployed contracts.
- [ ] Confirm the live demo stays up at https://mytotem.buzz through 2026-11-18, ideally 2026-11-25 (Q-012).
- [ ] Record a short demo video: one complete moment from a user action to a visible result.
- [ ] Human publishes the X post with `@NEARProtocol` and `#NEARHackathon` and the video attached.
- [ ] Add the demo-post URL below.
- [ ] Create the **mainnet** NEAR account for the prize payout. Not a testnet account.
- [ ] Re-read https://nearhackathon.com/HACKATHON.md.
- [ ] Human confirms every submission field and the contact notice verbatim.

## Evidence matrix

| Claim | Evidence |
| --- | --- |
| NFTs with behaviour | `contracts/totem-nft`, a Totem is a sub-account holding `$TOTEM`, `#profile` lock and unlock against the live API |
| Memecoin mechanics | `contracts/totem-token`, 25,000 `$TOTEM` per piece and 4 pieces per Totem, enforced in `backend/src/totem-product.js` |
| Arena entry gated on locked value | `backend/src/arena-economy.js`, `#arenas` shows the entry rule and the server's decision |
| Agent wallets with limits | `contracts/totem-agent`, per-payment cap, daily cap, action allowlist in the contract |
| Player-owned market | `contracts/totem-market`, NEP-171 royalty payouts on sale |
| Social Money | `backend/src/social-treasury.js`, capped Sputnik or Trezu proposals, always `DAO_APPROVAL_REQUIRED` |
| NEAR Intents, live | `backend/src/intents.js`, 222 solver assets at `/api/v1/intents/routes`, dry mainnet quotes per Q-007 |
| No anonymous writes | `POST /api/v1/claims/starter` answers `AUTH_REQUIRED`; NEP-413 sign-in required |
| Reproducible contracts | `totem_token.wasm` and `totem_nft.wasm` hash to the values in `infrastructure/template.yaml` |

## Links

- Product: https://mytotem.buzz
- Repository: https://github.com/ezekiel6262/totem-culture-engine
- Demo post: pending
- Testnet parent account: `totemtest.testnet`
- Payout account (mainnet): pending

## Intended track ids

`nfts`, `memecoins`, `games`, `security`, `agents`, `social`, `defi`

Each is argued in one line in the README and mapped to code and tests in `JUDGES.md`. It
remains one submission for one project.

## Two-project disclosure

The same lead is submitting Totem and Scion. They are independent projects with separate
repositories, products, codebases, demos, evidence and submission requests. Each repository
may be submitted only once, and one person may submit at most two different projects (Q-015).
