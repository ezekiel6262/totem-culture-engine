# Backend restructure: fitting the new frontend

The new frontend (`frontend/site`, built to `dist/index.html`) is the direction and the
reference. This document maps what it needs onto what the backend already has, and names
what has to be added. Screen names below are the hash routes in the new site.

## 1. The model the new frontend assumes

| Noun | Meaning in the new design |
| --- | --- |
| Totem | An NFT that is also an account. Holds 0-4 pieces, 25,000 $TOTEM per piece, items, credentials, royalties, a rental state and a race record. |
| Arena | A playable world for one culture. Has an entry rule (minimum pieces), venues, an operator who can pause it, and a season. |
| Game | A venue inside an Arena. Produces results: place, coins, proof. |
| Season | Standings across games, with parameters that evolve from finalized results. |
| Market | Player-owned listings of Totems, bought with NEAR. |
| Rental | A Totem lent to another account through a limited access key. |
| Room | A space gated by pieces or credentials. |
| Launch | A new collection plus its Arena, created from the Launch screen and reviewed before it opens. |
| Claim | A first Totem obtained with no gas, through a relayer meta-transaction. |
| Ledger | The activity feed on the Totem account screen. |

The single source of truth for intended onchain behaviour is `T.calls` in
`frontend/site/p10.html`. Every entry there names the receiver, method and arguments the
backend has to prepare or verify.

## 2. What already exists and can be reshaped

| Existing | Becomes |
| --- | --- |
| `auth.js`, `nep413.js` | Unchanged. Wallet sign-in already matches the Connect button. |
| `eligibility.js` (`evaluateHoldingRule`) | The entry check behind `check_entry` for `#arenas`. |
| `service.accessDecision` | Room access for `#rooms`. |
| `arena-economy.js` (`prepareMarketListing`, `evolveSeason`, `prepareAgentReward`) | The market and season services for `#market` and `#season`. |
| `launch-quotes.js`, `fees.js` | Launch pricing for `#launch`. |
| `receipts.js`, `checkpoints.js`, `idempotency.js` | Result settlement and replay protection for game results. |
| `repositories.js`, `postgres-repository.js`, `dynamodb-repositories.js` | Extended with the new collections rather than replaced. |
| `near-rpc.js`, `near-transactions.js` | Unchanged transport. |

The campaign/contribution/council/treasury surface stays in place for now. It is not
referenced by the new frontend, so it is neither extended nor deleted in this pass.

## 3. What is missing and has to be added

| Area | New endpoints |
| --- | --- |
| Totem accounts | `GET /api/v1/totems/:id`, `GET /api/v1/totems?owner=`, `POST /api/v1/totems/:id/pieces` (lock), `DELETE /api/v1/totems/:id/pieces` (withdraw), `POST /api/v1/totems/:id/split`, `POST /api/v1/totems/merge` |
| Arenas | `GET /api/v1/arenas`, `GET /api/v1/arenas/:id`, `POST /api/v1/arenas/:id/entry` (check), `POST /api/v1/arenas/:id/pause` (operator) |
| Results | `POST /api/v1/games/:game/results`, `POST /api/v1/games/:game/settle`, `GET /api/v1/players/:account/bests` |
| Season | `GET /api/v1/seasons/current`, `GET /api/v1/seasons/current/standings` |
| Market | `GET /api/v1/market/listings`, `POST /api/v1/market/listings`, `POST /api/v1/market/listings/:id/buy` |
| Rentals | `GET /api/v1/rentals?account=`, `POST /api/v1/rentals` (rent), `POST /api/v1/totems/:id/lend`, `DELETE /api/v1/totems/:id/lend` |
| Rooms | `POST /api/v1/rooms/:id/access` |
| Claim | `POST /api/v1/claims/starter`, `POST /api/v1/claims/prize` |
| Launches | `POST /api/v1/launches`, `GET /api/v1/launches?creator=`, `POST /api/v1/launches/:id/review` |
| Ledger | `GET /api/v1/accounts/:account/ledger` |

## 4. Rules the backend owns, not the client

These are currently enforced in the browser only, which means they are not enforced:

- A piece is exactly 25,000 $TOTEM, and a Totem holds at most 4.
- Withdrawing takes the top piece off; selling the Totem sells everything inside.
- Arena entry requires the Arena's minimum pieces and a non-paused Arena.
- A result is only signed by a game server key, and settles after a 24 hour dispute window.
- A rental key is limited to named methods and expires by term.
- Only the operator of an Arena may pause it; only the creator may launch under their name.
- Market purchases transfer the Totem with its contents.

## 5. Shape of the work

1. `backend/src/totem-product.js` - the domain rules above, as pure functions plus a service.
2. `backend/src/totem-product-repository.js` - memory repository, then Postgres and DynamoDB.
3. `backend/src/totem-product-api.js` - the handlers, following the existing `jsonHandler`
   and `invariant` style in `api.js`.
4. `backend/test/totem-product.test.js` - deterministic tests per rule in section 4.
5. Frontend: a client module in `frontend/site` that replaces the `localStorage`-only
   parts of state `S` with API reads and writes, keeping the demo path as the offline
   fallback so the site still works without a backend.

## 6. Deployment

`infrastructure/template.yaml` already provisions the S3 frontend bucket, CloudFront, the
Lambda API and DynamoDB. The new frontend is a single `index.html` with hash routes, so it
needs no path rewriting: `/#arena` is still a request for `/`.

Do not add `CustomErrorResponses` mapping 404 to `index.html` on this distribution. The
same distribution also serves `/api*` from the Lambda origin, and a distribution-wide
error mapping would turn an API 404 into the HTML page with status 200. If path-based
routes are ever added, scope the rewrite to the frontend behaviour with a CloudFront
Function instead.

Publishing is `npm run deploy:frontend`, which builds the parts, syncs `dist` to the
bucket and invalidates the distribution. It reads the bucket and distribution from the
CloudFormation stack outputs, so it needs an AWS session with access to that stack.

Live stack: `totemstart` in us-east-1, bucket `totemstart-frontendbucket-agixkeoemiyu`,
distribution `E2TGHXC8NZF4AV`, serving mytotem.buzz.

## 7. Before the product API goes live

The routes in section 3 are mounted in `backend/server.js` only. They are deliberately
not mounted in the Lambda yet, because `MemoryProductRepository` holds state in the
process: on Lambda it would be empty on every cold start and inconsistent between
concurrent instances, so writes would appear to succeed and then vanish.

The frontend does not call these routes yet, so nothing is broken by the gap. Before the
API goes live:

1. Add a DynamoDB implementation of the product repository, alongside the existing
   `DynamoTotemRepository`, using the single `TOTEM_DYNAMODB_TABLE`.
2. Select it in `application-runtime.js` the way the other repositories are selected, and
   mount `createProductRouter` in the Lambda route table.
3. Only then point the frontend screens at the API.
