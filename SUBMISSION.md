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
- [x] Verify a clean clone: `git clone`, `npm ci`, `npm run judge:verify` (114 tests, both audits).
- [x] Authorise `totemtest.testnet` for near-cli-rs. The key is in the legacy key store and matches the account full access key on chain, `ed25519:247jogH965g1UaFCMjWY4ShQPfqLKNLELETr1vMHsCeC`.
- [x] Deploy the NFT: `nft.totemtest.testnet`, collection size 10,000, 4.10 NEAR staked.
- [ ] Top up `totemtest.testnet` from https://near-faucet.io: it holds about 1.29 NEAR and the token needs 3.1 (testnet NEAR is free, Q-008).
- [x] Deploy the token: `token.totemtest.testnet`, total supply 1,000,000,000 at 18 decimals, 2.60 NEAR staked.
- [x] Deploy the market and the Culture Agent: `market.totemtest.testnet`, `agent.totemtest.testnet`.
- [ ] Optional: deploy the launchpad factory (2.8 NEAR). It cannot demonstrate `launch` without ~55.6 NEAR burned on global template registration.
- [x] Record the deployed contract ids and code hashes here (see Deployed contracts below).
- [x] Stack parameter `TotemNftContractId` already defaults to `nft.totemtest.testnet`, which is what was deployed. The others follow their own deploys.
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
| Memecoin mechanics | `token.totemtest.testnet` live on testnet, 25,000 `$TOTEM` per piece and 4 pieces per Totem, enforced in `backend/src/totem-product.js` |
| Arena entry gated on locked value | `backend/src/arena-economy.js`, `#arenas` shows the entry rule and the server's decision |
| Agent wallets with limits | `agent.totemtest.testnet` live on testnet, `get_policy` returns the per-payment cap, daily cap and paused flag from contract state |
| Player-owned market | `market.totemtest.testnet` live on testnet, NEP-171 royalty payouts on sale, 250 bps fee |
| Social Money | `backend/src/social-treasury.js`, capped Sputnik or Trezu proposals, always `DAO_APPROVAL_REQUIRED` |
| NEAR Intents, live | `backend/src/intents.js`, 222 solver assets at `/api/v1/intents/routes`, dry mainnet quotes per Q-007 |
| No anonymous writes | `POST /api/v1/claims/starter` answers `AUTH_REQUIRED`; NEP-413 sign-in required |
| Reproducible contracts | `totem_token.wasm` and `totem_nft.wasm` hash to the values in `infrastructure/template.yaml` |
| Contract deployed from this repo | `nft.totemtest.testnet` on-chain `code_hash` is `BkXRfFM7oBLH3SKeL5hEt2YAeRG7tbZ9Mm3KCJXUn1Dz`, the base58 of the pinned sha256 |

## Deployed contracts

| Contract | Account | Network | Evidence |
| --- | --- | --- | --- |
| Totem NFT, NEP-171 | `nft.totemtest.testnet` | testnet | `code_hash` `BkXRfFM7oBLH3SKeL5hEt2YAeRG7tbZ9Mm3KCJXUn1Dz`, 4.10 NEAR staked, `launch_config` reports 10,000 max supply and 500 / 250 bps royalties, `nft_total_supply` 0 |
| Totem token, NEP-141 | `token.totemtest.testnet` | testnet | `code_hash` `3qR5b6C3wVcgQ1iiJBwPkdp24hFEUFARytTUzWMe9a1j`, 2.60 NEAR staked, `ft_total_supply` 1,000,000,000 at 18 decimals, all held by `totemtest.testnet` |
| Player-owned market | `market.totemtest.testnet` | testnet | `code_hash` `C1GguQ854deoNGuFqThJhL8AVbpDrXxoTjW4yTZnwarV`, 2.30 NEAR staked, 250 bps fee to the treasury, `listings` returns `[]` |
| Culture Agent | `agent.totemtest.testnet` | testnet | `code_hash` `2xxUTo1pgx5gHgiUqHBQVNPgSZYQMHPSkuqz9D3Cxefh`, 2.10 NEAR staked, `get_policy` reports 1 NEAR per payment, 5 NEAR daily, `paused` false; `available_budget` about 0.49 NEAR |

Deployed 2026-11-12 from `totem_nft.wasm`, sha256 `9FBB3EF2F7E4E3682784035A466FF02CAAF766526516A6F4386DC72039587929`, with
`npm run launch:testnet -- --only nft --execute`. Read it back over public RPC:

```sh
near contract call-function as-read-only nft.totemtest.testnet nft_metadata \
  json-args {} network-config testnet now
```

## Links

- Product: https://mytotem.buzz
- Repository: https://github.com/ezekiel6262/totem-culture-engine
- Demo post: pending
- Testnet parent account: `totemtest.testnet` (4 of 5 contracts deployed beneath it)
- Payout account (mainnet): pending

## Intended track ids

`nfts`, `memecoins`, `games`, `security`, `agents`, `social`, `defi`

Each is argued in one line in the README and mapped to code and tests in `JUDGES.md`. It
remains one submission for one project.

## Two-project disclosure

The same lead is submitting Totem and Scion. They are independent projects with separate
repositories, products, codebases, demos, evidence and submission requests. Each repository
may be submitted only once, and one person may submit at most two different projects (Q-015).
