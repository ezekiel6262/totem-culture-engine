# Totem developer handoff

## 1. Status in one table

| Part | State |
| --- | --- |
| Demo site, 26 screens, 3D, games, tour, onchain log, share cards | Working in the browser |
| Wallet, balances, rentals, results, prizes on the site | Simulated, saved in `localStorage` |
| Guide agent (Ife) | Real Claude answers inside claude.ai when the viewer allows it, set answers elsewhere |
| Rust contract in `near/contract` | Written for near-sdk 5.5, not yet compiled or deployed |
| `near/frontend/near.js` | Written, not yet wired into the site |
| Per-Totem sub-accounts, Intents, relayer, Chain Signatures, arena, market and treasury contracts | Designed only |

## 2. How the site is built

- One HTML file, no build tools, no framework. Plain JavaScript and CSS.
- Only external code: three.js r128 from cdnjs, and Google Fonts (Instrument Serif, Geist, Geist Mono).
- All demo state lives in one object `S`, saved to `localStorage` under `totem-demo-state-1`. Reset it from Profile, Settings.
- Hash routing: every screen is `#name`. Public Totem pages are `#nft-<id>`, for example `#nft-1201`.
- Each screen is a `<section class="page" data-route="name">`. Each has a module `TOTEM.modules.name = { enter(), leave() }`. `enter` paints the screen and starts any animation; `leave` stops it.
- Page changes play the four-band wipe in `#curtain`. Reduced motion skips it.

### Source parts (`site/source`)

| File | Contains |
| --- | --- |
| `p1.html` | `<head>`, design tokens, all base CSS, curtain, 3D overlay and game CSS |
| `p2.html` | Body markup: nav, menu sheet, and the markup for every page |
| `p3.html` | Core: state `S`, `save`, `log`, `toast`, `svgTotem`, three.js helpers (`makeRenderer`, `ink`, `makeTotem3D`), router, curtain, connect |
| `p4.html` | Homepage: 3D scroll film (5 formations), piece slider, NEAR infra cards |
| `p5.html` | Arenas directory and entry check (`requireArena`), Launch, Lock and unlock, Totem account with 3D viewer, Rooms, Builders form |
| `p6.html` | 3D Arena island: venues, models, NPCs, labels, drag and pinch camera, venue panel |
| `p7.html` | Meme Kart: track, karts, drivers and stats, AI racers, coins, boosts, drift, ghost, minimap, results |
| `p8.html` | Paint the Island, Rent and lend, gasless Claim, multichain card |
| `p9.html` | Explore (search index and sections) and Profile (roles, My NFTs, launches, games, operator console) |
| `p10.html` | Onchain log, sound and vibration, low-power mode, share cards, guided tour, public Totem pages, Market, Season, Rules, Merge and split, Profile settings |
| `p11.html` | Meme Clash, Ritual Raid, Bagwork, Fishing Pier, Agent Bazaar, Stack Attack, Red Day Run, Vault Heist |

Later parts wrap earlier modules where needed (for example `p10` wraps `lock` and `profile`), so keep the build order.

## 3. Routes

| Route | Screen | Needs an Arena entered |
| --- | --- | --- |
| `#home` | Homepage | |
| `#explore` | Explore | |
| `#arenas` | Arenas directory and entry | |
| `#arena` | 3D island | yes |
| `#play` | Meme Kart | yes |
| `#paint` | Paint the Island | yes |
| `#clash` `#raid` `#bagwork` `#fish` `#stack` `#run` `#heist` `#agents` | Arena games and agents | yes |
| `#season` | Season leaderboard | |
| `#market` | Totem market | |
| `#nft-<id>` | Public Totem page | |
| `#rent` | Rent and lend | |
| `#lock` | Lock, unlock, merge, split | |
| `#totem` | Totem account | |
| `#rooms` | Holder and treasury rooms | |
| `#profile` | Profile and operator console | |
| `#launch` | Launch a collection and Arena | |
| `#build` | Builders | |
| `#claim` | Gasless first Totem | |
| `#rules` | Rules and fairness | |

## 4. State `S`

| Key | Meaning |
| --- | --- |
| `pieces`, `wallet` | Pieces in Totem #0417, $TOTEM in the wallet |
| `connected`, `account`, `email` | Demo wallet state |
| `arena`, `arenaPaused`, `entryPieces` | Arena entered, operator pause, entry rule |
| `prizes`, `items`, `bought` | Prize Totems and credentials, items, Totems bought or earned |
| `rented`, `listing` | Active rental, own Totem listed for rent |
| `launches`, `games`, `operator`, `delivered` | Launcher, builder and operator data |
| `ghost`, `ghostT`, `best`, `races` | Meme Kart ghost and best time, other game bests |
| `bag`, `fishDay`, `fishCasts`, `clashEntry` | Daily game state |
| `mute`, `lowPower` | Settings |
| `ledger` | Activity rows shown on the Totem account |

## 5. Common changes

- **Rename the token or numbers.** Piece size (25,000) and the 4-piece rule appear in `p3` (`svgTotem`), `p5` (lock) and copy in `p2`. Search for `25000` and `25,000`.
- **Add an Arena game.** Add a `<section data-route>` in `p2`, add the route name to `routes` in `p3`, write a module, call `TOTEM.requireArena()` at the top of `enter`, and add a venue to `venues` in `p6` with `href`.
- **Add a venue model.** In `p6`, build it from `box`, `cyl` and `T.ink` inside the `/* new venues */` block.
- **Log an onchain call.** `TOTEM.chain(title, [{ receiver, method, args, deposit }])`, or a helper in `TOTEM.calls`.
- **Share card.** `TOTEM.share({ title, stat, line, pieces })`.
- **Sound.** `TOTEM.sfx('coin' | 'win' | 'lose' | 'piece' | 'drop' | 'boost' | 'paint' | 'tap')`.

## 6. Making it real

Follow `near/README.md` to build and deploy the contract on testnet. Then:

1. Load `near/frontend/near.js` into the site (bundle it, or rewrite the calls with the near-api-js browser build).
2. Lock page: replace the demo handlers in `p5` (`#addPiece`, `#takePiece`) with `addPiece(tokenId)` and `withdrawPiece(tokenId)`; refresh with `getTotem(tokenId)`.
3. Arenas page: replace `meets()` in `p5` with `checkEntry(account, minPieces)`.
4. Connect button in `p3`: call `initWallet()` and `connect()`.
5. Label those screens "Live on testnet".

Note: claude.ai published pages block network calls to other sites, so the real version must run on your own domain.

## 7. Known limits

- three.js loads from a CDN; offline viewing shows the 2D fallbacks only.
- Meme Kart's AI uses rubber-banding; it is tuned for a fun demo, not fairness.
- Paint the Island rivals are simple bots.
- Example players (kofi.near and others) and all numbers are demo data.
- The contract is untested. Expect small fixes on the first build, especially trait signatures if your near-sdk version differs.

## 8. Design rules

- White page, black ink, vault green `#00B97F`, ember `#FF5A1F`, highlighter `#FFF09A`, gold `#FFD23F`.
- Instrument Serif for headlines, Geist for interface and numbers, Geist Mono for account names.
- Sentence case, plain hyphens only, no other communities in the product until real ones join.
