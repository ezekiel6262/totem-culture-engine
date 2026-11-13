# The demo video

Two minutes forty of the live site, rebuilt from scratch by three scripts. Nothing in it is
a mockup: every frame is `https://mytotem.buzz` as it was served on the day it was rendered,
and every number on screen was read from NEAR testnet by the page itself.

```sh
# 1. the voice, one wav per line of narration
powershell -File scripts/demo-video/tts.ps1 \
  -JsonPath scripts/demo-video/narration.json -OutDir .video/vo

# 2. the pictures, straight from the live site
node scripts/demo-video/capture.mjs .video/shots

# 3. cut them together against the narration
node scripts/demo-video/assemble.mjs .video
```

It needs `ffmpeg` on the path, Node 20 or newer, and a Chromium on Windows (the capture
script points at Edge, which every Windows machine has). The voice is Microsoft Susan, a
Windows OneCore voice, driven through the WinRT speech API; the script falls back to the
older SAPI voices where WinRT is unavailable.

## How it is put together

The capture script drives Edge over the DevTools protocol with no dependency beyond Node's
own `WebSocket`, and takes **one still per shot** rather than a stream of frames. The motion
is made afterwards in ffmpeg, by drifting a 1920×1080 crop window across a taller still with
a cosine ease. A pan built this way is smooth at 30fps; frames captured from a live scroll
arrive two or three a second and judder.

Each segment is cut half a second longer than the narration line it carries, and the
segments are crossfaded by exactly that half second, so every cut lands on a sentence
boundary instead of drifting away from the voice.

The game screens sit behind the Arena gate. The capture seeds the same `localStorage` state
a visitor writes by clicking in, with `pieces: 1` to match what Totem #1 actually holds on
chain, then reloads onto the route.

## Re-recording the narration in a human voice

The synthesised voice is the weakest part of it. To replace it, record the lines in
`narration.json` in order, one file per line, as `line-01.wav` … `line-13.wav` in the `vo`
directory, and run step 3 again. The timing follows the audio rather than the other way
around: every shot is cut to the length of its line, so a slower or faster read re-cuts the
picture to match with no further work.

## What it claims, and where to check it

| Said in the video | Checkable by |
| --- | --- |
| A Totem holds 25,000 $TOTEM itself | `locked_of {"token_id":"1"}` on `nft.totemtest.testnet` |
| One piece of four | `pieces_of {"token_id":"1"}`, and `locking_config` for the maximum |
| The owner's wallet is a different number | `ft_balance_of` on `token.totemtest.testnet` |
| Withdrawing costs one yoctoNEAR | `withdraw_piece` asserts it, `contracts/totem-nft/src/lib.rs` |
| Entry reads the Totem, not the wallet | `checkEntry` in `backend/src/totem-product.js` |
| The launchpad is live and has launched a collection | `template_status` on `launch.totemtest.testnet`, `nft_metadata` on `founders.launch.totemtest.testnet` |
| Five contracts on testnet | the table in `SUBMISSION.md`, every `code_hash` cited |

The narration deliberately says nothing about gameplay being verified, because it is not:
scores run in the browser and are self reported. The video shows the Arena island and the
prize rules, and the site's own rules page says which half is live.
