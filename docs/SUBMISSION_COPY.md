# Totem submission copy

## One-line pitch

Totem attaches NFT supply to a meme token: the NFT becomes an account that holds the
tokens, and what it holds is what gets you into the games.

## Project description

A memecoin is a number in a wallet. A PFP is a picture somebody hopes is wanted. They run
on the same fuel, culture, and they live apart.

Totem binds them. A community launches a collection against its token, and every holder
mints their own NFT: different art, different branch, one coin behind all of them. The NFT
is an account rather than an image. Tokens locked into it are held by the token itself, as
a real NEP-141 balance the collection owns, not as a trait or a line of metadata.

That balance is what the Arena reads. Every community gets an Arena with its own games,
entry rule and prizes, and entry does not ask what the player's wallet holds. It asks what
the Totem holds. Prizes are paid on chain from a prize account under a cap per game per
day, and the cap is enforced by refusal rather than by a promise: a request above it
produces no receipt and moves nothing.

Totem never holds a community's treasury. Payouts above the Arena's own prize budget are
prepared as a capped proposal that a DAO has to approve, and the backend returns
`DAO_APPROVAL_REQUIRED` with custody left on the DAO.

## Track fit

- **Memecoins with mechanics**: a token gains supply-bound NFTs, entry rules, quests and an
  Arena economy, and the token is held inside the NFT rather than beside it.
- **NFTs that do something**: the collection implements the NEP-141 receiver, so a Totem
  holds tokens, reports them through `locked_of` and `pieces_of`, and releases them only to
  its owner under `assert_one_yocto`.
- **Games with real economies**: prizes settle on chain from a prize account under a
  contract-enforced daily cap, and the market is player owned.
- **Social money**: capped, DAO-gated treasury proposals with public receipts and no custody
  held by Totem.

## What is live, and what is not

Live on NEAR testnet: five contracts (`nft`, `token`, `market`, `agent` under
`totemtest.testnet`, and `launch.totemtest.testnet`), real wallet connect, locking and
withdrawing, minting behind an eligibility gate, listing and buying, Arena entry decided by
what the Totem holds, on-chain prize payouts, and a collection launched through the
launchpad at `founders.launch.totemtest.testnet`.

Not live: gameplay and scores run in the browser and are self reported, so a result proves
nothing. Rentals, room contents, merge and split, and the season leaderboard are
illustrative. The Arena entry gate that guards them is real.

## Required evidence

- Public repository URL and passing CI.
- Live product URL: https://mytotem.buzz
- Testnet contract accounts with every `code_hash` cited in `SUBMISSION.md`.
- Demo video showing the product and the on-chain figures.
- Public X post that says built at NEAR HACKATHON, tags `@NEARProtocol`, and includes
  `#NEARHackathon`.

## X post, single

The one to actually publish. The thread below is kept as a fallback.

> Your memecoin is a number in your wallet. Your PFP is a picture you hope someone wants.
> Neither one remembers anything you did.
>
> Totem makes them one object: a community binds an NFT collection to its token, and the NFT
> holds the coins.
>
> Lock 25,000 $TOTEM into your Totem and the NFT's own balance goes up. Not a trait, not
> metadata — a real NEP-141 balance. Totem #1 holds it on testnet right now:
> locked_of("1") → 25,000
>
> Why NEAR: contracts are accounts, so ft_transfer_call hands the tokens to the NFT with a
> callback in a single transaction, with no registry in between. And withdrawing asserts 1
> yoctoNEAR, so an app key can never drain it. Only the owner, signing.
>
> The Arena then gates entry on what your Totem holds, not what your wallet holds.
>
> Demo: https://mytotem.buzz
> Code: https://github.com/ezekiel6262/totem-culture-engine
>
> Would you gate your community on the NFT or the wallet? I want to hear where this breaks.
>
> Built at NEAR HACKATHON @NEARProtocol #NEARHackathon @NearBuilders

## X thread

**1 / main post**

> Built at NEAR HACKATHON.
>
> Memecoins and NFTs run on the same fuel: culture. But they live apart. A memecoin is a
> number in your wallet. A PFP is a picture you hope someone wants.
>
> Totem attaches NFT supply to your meme token.
>
> https://mytotem.buzz
> @NEARProtocol #NEARHackathon

**2 / the idea, in one example**

> Imagine Nearkat ($KAT) had a collection bound to the token.
>
> Every holder mints their own cat. Every one of them is different. Every one of them still
> represents a single memecoin.
>
> And every one of them holds $KAT inside it.
>
> Custom identity, one coin.

**3 / the NFT is an account**

> Totem #1 is live on NEAR testnet and holds 25,000 $TOTEM inside the NFT itself.
>
> Not a trait. Not metadata. A real NEP-141 balance held by the token.
>
> locked_of("1") → 25,000
>
> Its owner's wallet separately holds 299,960,000, and that gives the Totem nothing.

**4 / the Arena**

> Then a community plays with it.
>
> Arena is where the culture goes: Meme Kart, Paint the Island, Hold the Line, Ritual Raid,
> Bagwork quests. Each community sets its own games, entry rule and prizes.
>
> Entry doesn't ask your wallet. It asks your Totem.

**5 / prizes, and the part that isn't finished**

> Prizes settle on chain from a prize account, capped per game per day, and the cap is
> enforced by refusal: ask for more and there's no receipt and nothing moves.
>
> Scores are still client side and self reported. The site says so on its own rules page.

**6 / anyone can launch one**

> The launchpad is live. It stores the collection template on chain and deploys it onto a
> fresh account, so a community launches in a single call.
>
> founders.launch.totemtest.testnet was launched through it, carrying the same code hash as
> the flagship collection.

**7 / check it**

> Five contracts on NEAR testnet. Every hash published, every claim checkable.
>
> Demo: https://mytotem.buzz
> Code: https://github.com/ezekiel6262/totem-culture-engine

Do not publish until the owner approves the final links and evidence.
