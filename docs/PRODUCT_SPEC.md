# Kinforge Product Specification

## Product

Kinforge is a reusable policy and progression layer for communities on NEAR. Its core primitive is a **Rite**: a versioned, auditable campaign that converts durable commitment plus verified action into a portable onchain identity state.

Pitch: **Kinforge turns token holders into participants, and participants into living communities.**

Primary tracks: Memecoins With Mechanics; NFTs That Do Something. Optional only when implemented: Games With Real Economies; Social Money.

## Users

- Creator: registers a token or collection, selects a template, configures rules and bounded routing.
- Participant: tracks progress, submits proofs, mints/evolves identity, uses gated utilities.
- Artist: publishes approved trait assets and receives transparent marketplace splits.
- Community steward: verifies selected actions, manages seasons, proposes rule changes.
- Oracle/attestor: signs narrowly scoped receipts with published provenance.
- Guardian: can pause unsafe entry points but cannot seize assets or redirect treasury funds.
- Integrator: embeds eligibility, progress, mint, and access checks through SDK/API.

## Supported directions

1. Token-first: NEP-141 → commitment → Rite → NFT identity → utility.
2. NFT-first: NEP-171/245 ownership → token allocation/launch → Rites → evolution.
3. Event-first: signed attendance/ritual → temporary community instrument → collectible record → later evolution.

## MVP campaign

Byte Beasts Club requires a 10,000 BBC seven-day time-weighted holding score plus one signed creation challenge. Eligible users mint an NFT and branch into Liquidity Guardian or Meme Maker. The NFT opens a simple Signal Arena. A 1 NEAR mint fee routes 45% to community treasury, 35% to creator/artist, and 20% to the season prize pool.

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

## Game rules: Signal Arena

Once per round, active identities choose one of three community signals. Roles supply non-transferable modifiers (not financial leverage): Guardians can stabilize a losing signal; Makers can amplify a new signal. No wager or paid random outcome. The winning signal determines next season's cosmetic theme and a bounded community budget proposal. Ties resolve deterministically by earliest aggregate commitment score, then lexicographic signal ID.

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
