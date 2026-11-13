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
- [x] Fund `totemtest.testnet`. The token and the collection are both deployed; the account retains a working balance.
- [x] Deploy the token: `token.totemtest.testnet`, total supply 1,000,000,000 at 18 decimals, 2.60 NEAR staked.
- [x] Deploy the market and the Culture Agent: `market.totemtest.testnet`, `agent.totemtest.testnet`.
- [x] Exercise the deployed contracts end to end on chain: mint, NEP-141 transfer, market listing, agent reward, and a refused over-cap payment. Eight transactions, listed in `JUDGES.md`.
- [x] Deploy the launchpad factory: `launch.totemtest.testnet`, template committed and hash-verified, and a collection launched through it.
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
| NFTs with behaviour | `nft.totemtest.testnet` holds `$TOTEM` inside the token itself through the NEP-141 receiver: `locked_of` and `pieces_of` read it, `withdraw_piece` is owner-only, and Arena entry reads what the Totem holds rather than what its owner's wallet holds |
| Memecoin mechanics | `token.totemtest.testnet` live on testnet, 25,000 `$TOTEM` per piece and 4 pieces per Totem, enforced in `backend/src/totem-product.js` |
| Arena entry gated on locked value | `backend/src/arena-economy.js`, `#arenas` shows the entry rule and the server's decision |
| Agent wallets with limits | `agent.totemtest.testnet` live on testnet, `get_policy` returns the per-payment cap, daily cap and paused flag from contract state |
| Player-owned market | `market.totemtest.testnet` live on testnet, NEP-171 royalty payouts on sale, 250 bps fee |
| Social Money | `backend/src/social-treasury.js`, capped Sputnik or Trezu proposals, always `DAO_APPROVAL_REQUIRED` |
| NEAR Intents, live | `backend/src/intents.js`, 222 solver assets at `/api/v1/intents/routes`, dry mainnet quotes per Q-007 |
| No anonymous writes | `POST /api/v1/claims/starter` answers `AUTH_REQUIRED`; NEP-413 sign-in required |
| Reproducible contracts | `totem_token.wasm` and `totem_nft.wasm` hash to the values in `infrastructure/template.yaml` |
| Contract deployed from this repo | `nft.totemtest.testnet` on-chain `code_hash` is `DiPyuXCQAdmx32xVWMQ4zU9RHkBKFNAW2SPLcwwmdXJv`, the base58 of the pinned sha256 |

## Deployed contracts

| Contract | Account | Network | Evidence |
| --- | --- | --- | --- |
| Totem NFT, NEP-171 | `nft.totemtest.testnet` | testnet | `code_hash` `DiPyuXCQAdmx32xVWMQ4zU9RHkBKFNAW2SPLcwwmdXJv`, 5.60 NEAR staked, **holds `$TOTEM` inside each Totem**: `locked_of("1")` is 25,000 and the collection's own NEP-141 balance is 25,000 because the tokens really moved, `launch_config` reports 10,000 max supply and 500 / 250 bps royalties, `nft_total_supply` 0 |
| Totem token, NEP-141 | `token.totemtest.testnet` | testnet | `code_hash` `3qR5b6C3wVcgQ1iiJBwPkdp24hFEUFARytTUzWMe9a1j`, 2.60 NEAR staked, `ft_total_supply` 1,000,000,000 at 18 decimals, all held by `totemtest.testnet` |
| Player-owned market | `market.totemtest.testnet` | testnet | `code_hash` `C1GguQ854deoNGuFqThJhL8AVbpDrXxoTjW4yTZnwarV`, 2.30 NEAR staked, 250 bps fee to the treasury, `listings` returns one live listing, Totem #1 at 1 NEAR |
| Launchpad factory | `launch.totemtest.testnet` | testnet | `code_hash` `FKu7XrLZtYbT1tyUkiVJW1Gupf9RzdLmae1EkJbfVaJ8`, the base58 of sha256 `D4DAFED65F1D776D93B52601E87BABBF7CCC7A345EF2B96B49422719E8933845`. Holds the collection template as bytes, `template_status` reports hash `DiPyuXCQAdmx32xVWMQ4zU9RHkBKFNAW2SPLcwwmdXJv`. `totemtest.testnet` launched `founders.launch.totemtest.testnet` through it for 6.3 NEAR; the record reads `deployed` |
| Culture Agent | `agent.totemtest.testnet` | testnet | `code_hash` `2xxUTo1pgx5gHgiUqHBQVNPgSZYQMHPSkuqz9D3Cxefh`, 2.10 NEAR staked, `get_policy` reports 1 NEAR per payment, 5 NEAR daily, `paused` false; `available_budget` about 0.49 NEAR |

First deployed 2026-11-12 with `npm run launch:testnet -- --only nft --execute`, and
upgraded in place on 2026-11-13 to the build that holds `$TOTEM`, sha256
`BCE70A87CC289AA60C5DE3099B9C89FFB0F6D330638A37BC75713FE4B6997667`. The upgrade ran a state
migration in the same transaction as the deploy, so Totem #1 kept its owner and metadata.
Read any of it back over public RPC:

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

`nfts`, `memecoins`, `games`, `security`, `agents`, `social`, `defi`, `open`

Each is argued in one line in the README and mapped to code and tests in `JUDGES.md`. It
remains one submission for one project.

## Two-project disclosure

The same lead is submitting Totem and Scion. They are independent projects with separate
repositories, products, codebases, demos, evidence and submission requests. Each repository
may be submitted only once, and one person may submit at most two different projects (Q-015).
