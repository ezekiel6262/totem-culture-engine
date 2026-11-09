# Totem Product Specification

## Product

Totem is a bidirectional culture-launch and programmable-ownership platform for communities on NEAR. Its root primitive is a **Culture Pair**: a memecoin contract, an NFT collection, or both, bound to one versioned rulebook, treasury, social graph, and Arena history. A **Rite** is a versioned, auditable campaign that changes eligibility, identity, access, inventory, token mechanics, or community state.

Pitch: **Totem makes a memecoin playable and an NFT community economically programmable.**

All four tracks are product pillars: Memecoins With Mechanics; NFTs That Do Something; Games With Real Economies through Arena; Social Money through portable identity, contribution, access, and collective coordination.

`$TOTEM` plus the Totem collection is the platform's flagship Culture Pair and reference implementation. Communities launch their own tokens and collections; they do not become extensions of `$TOTEM`.

## Users

- Creator: registers a token or collection, selects a template, configures rules and bounded routing.
- Participant: tracks progress, submits proofs, mints/evolves identity, uses gated utilities.
- Artist: publishes approved trait assets and receives transparent marketplace splits.
- Community steward: verifies selected actions, manages seasons, proposes rule changes.
- Oracle/attestor: signs narrowly scoped receipts with published provenance.
- Guardian: can pause unsafe entry points but cannot seize assets or redirect treasury funds.
- Integrator: embeds eligibility, progress, mint, and access checks through SDK/API.

## Supported directions

1. Token: launch or connect NEP-141, create a linked collection, then activate living Culture Accounts, Arena, and utility.
2. NFT: launch or connect a NEP-171/245 collection, then connect token mechanics informed by ownership, contribution, credentials, and Arena history.
3. Twin: create the token and collection together under one Culture Pair rulebook and treasury.

Events and rituals are Arena mechanics for an existing Culture Pair, not independent Forge origins.

## MVP campaign

The flagship `$TOTEM` Culture Pair requires a time-weighted holding score plus verified participation. Eligible members mint a Totem Culture Account and evolve into roles such as Liquidity Guardian, Meme Commander, Diamond Holder, or Community Builder. The identity carries access, inventory, credentials, Arena history, and governance permissions. Other communities configure their own token, collection, thresholds, roles, mechanics, and treasury routes.

## Culture Accounts

A Culture NFT is not just media. It is a programmable identity and account surface that can hold bounded inventory and prizes, carry transferable traits and non-transferable credentials, unlock membership and tools, represent an Arena character, exercise role-scoped permissions, preserve contribution history, and expose composable state to other apps. Personal reputation must remain distinct from transferable assets when ownership changes.

## Memecoin mechanics

Culture Pair tokens can use transparent, capped mechanics tied to verified community outcomes: milestone unlocks, bounded burns, seasonal budgets, crafting and entry utility, creator sponsorship, quest distributions, and treasury rules. Totem avoids uncontrolled supply reactions, passive-yield promises, and mechanics judged only by price.

## Rule configuration

- Minimum balance, rolling window, checkpoint cadence, time-weighted threshold, grace period.
- Liquidity duration, bounded burns, referrals, onchain calls, game events, social proofs, attendance.
- AND/OR/threshold compositions; prerequisites; per-wallet and campaign caps; start/end windows.
- Evolution DAG with mutually exclusive or composable branches, trait inventory, merge recipes, credentials.
- Access policies with explicit active, grace, paused, expired states; ownership is never destroyed for a utility lapse.
- Fee route sums must equal 100%; destinations are allowlisted; updates are timelocked and versioned.

## Screens

- Discover/templates; creator setup; rule composer; evolution tree; routing preview; campaign dashboard.
- Participant quest view; evidence submission; mint/evolution ceremony; identity/passport; gated room/game.
- Public audit dashboard; oracle registry; treasury flows; event log; SDK/API docs.

## Arena: the living economy

Arena is a core shared product, not an optional demo. Culture Accounts enter seasonal faction contests, creative challenges, raids, collaborative objectives, and culture-versus-culture tournaments. Verified action earns reputation, inventory, evolution, access, and bounded prizes. Roles provide non-financial abilities; results can update NFT state, unlock capped token mechanics, and route published community budgets. No wager or paid random outcome is required.

## Social money

Totem treats money as a relationship and coordination layer. Culture Pairs recognize contribution, belonging, creation, reputation, and shared history—not only balance. Portable credentials, community roles, cross-culture alliances, creator attribution, reputation-aware governance, and public treasury rules make social money a first-class product surface.

## Compliance boundaries

- No guaranteed return, APY, dividend, appreciation claim, or passive fee entitlement.
- Rewards are framed as participation prizes or community-directed budgets with published criteria.
- Jurisdictional review is required for transferable tokens, paid randomized mechanics, prize contests, royalties, referrals, and secondary trading.
- Avoid pay-to-win, undisclosed sponsored challenges, misleading scarcity, and permanent loss of purchased access without disclosed terms.
- NFT royalties are not universally enforceable; show marketplace-specific behavior.
- Tax reporting remains the user's responsibility; exports should distinguish purchases, prizes, creator income, and treasury payments.
- Prefer non-token or offchain state when public ownership, composability, or credible neutrality does not add value.

## Success metrics

Campaign activation, eligible-to-mint conversion, 7/30-day retained participants, unique verified actions, repeat utility usage, treasury diversity, Sybil-adjusted participation, and SDK integrations. Token price is not a product KPI.
