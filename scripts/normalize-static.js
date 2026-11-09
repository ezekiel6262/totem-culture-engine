import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '..', 'dist');
const excluded = new Set(['support.js']);
const replacements = {
  'Arena.dc.html': [
    ['<div data-screen-label="12 Arena match" style="min-height:100vh;background:#0D0D0B;color:#EDE6D8">', '<div data-screen-label="12 Arena match" style="min-height:100vh;background:#0D0D0B;color:#EDE6D8"><div class="totem-status"><strong>INTERACTIVE ARENA PREVIEW</strong> Sample worlds and mechanics are shown below. No campaign, vote, reward or market is live yet.</div>'],
    ['$TOTEM CULTURE WORLD · SEASON 01', 'ARENA WORLD PREVIEW · SAMPLE SEASON'],
    ['●</b> OPEN', '●</b> DESIGNED'], ['●</b> LOCKED', '●</b> TESTNET NEXT'], ['●</b> UPCOMING', '●</b> PLANNED'],
    ['LIVE IN THE MEME CLASH COLOSSEUM · ROUND 3 OF 5', 'SAMPLE MEME CLASH · ROUND 3 OF 5'],
    ['FINAL VOTE OPENS IN<br><span style="font-size:23px;color:#EDE6D8">{{ clock }}</span>', 'FINAL VOTE<br><span style="font-size:18px;color:#EDE6D8">ACTIVATES AFTER TESTNET DEPLOYMENT</span>'],
    ["state:'OPEN'", "state:'DESIGNED'"], ["state:'LOCKED'", "state:'TESTNET NEXT'"], ["state:'UPCOMING'", "state:'PLANNED'"],
    ["venue.state !== 'OPEN'", "venue.state !== 'LIVE'"], ["venue.state!=='OPEN'", "venue.state!=='LIVE'"],
    ["venue.state==='OPEN'", "venue.state==='LIVE'"], ["venue.state==='LOCKED'", "venue.state==='TESTNET NEXT'"],
    ['Connect a NEAR wallet to cast a verified final-round vote.', 'Preview only. Voting activates after the Arena contracts and first campaign deploy to testnet.'],
    ['travel,not', 'travel, not'], ['monument,with', 'monument, with'], ['history,no', 'history, with no'],
    ['AUTONOMY STATUS · rule-driven seasons designed · wallet-owning Culture Agents not yet implemented', 'AUTONOMY STATUS · contracts and policies built · funded testnet account deployment pending']
  ],
  'index.html': [['Buy in from any chain through NEAR Intents. Mint on NEAR. Totem names live at <span style="font-family:\'JetBrains Mono\',monospace;color:#EDE6D8">name.totem.near</span>.', 'Cross-chain routes through NEAR Intents and onchain Totem names are planned. NEAR-native testnet launch activates first.']],
  'Landing.dc.html': [['Buy in from any chain through NEAR Intents. Mint on NEAR. Totem names live at <span style="font-family:\'JetBrains Mono\',monospace;color:#EDE6D8">name.totem.near</span>.', 'Cross-chain routes through NEAR Intents and onchain Totem names are planned. NEAR-native testnet launch activates first.']],
  'Explore.dc.html': [['412 totems carved, Season 01 live, leading the Arena against $DOGGO.', 'Sample community profile showing how a future season and Arena history can look.'], ['Gold Ear trait live.', 'Gold Ear trait previewed.'], ['<div data-screen-label="04 Discover"', '<div class="totem-status"><strong>PREVIEW DATA</strong> Sample communities are clearly separated from campaigns returned by the live API.</div><div data-screen-label="04 Discover"']],
  'Traits.dc.html': [["'LIVE'", "'SAMPLE'"], ['LIVE: C', 'SAMPLE: C'], ['<div data-screen-label="11 Trait market"', '<div class="totem-status"><strong>MARKET PREVIEW</strong> Listings are samples. Trading activates after the testnet market contract deploys.</div><div data-screen-label="11 Trait market"']],
  'Onboarding.dc.html': [['Other chains settle through NEAR Intents, so your totem still lives on NEAR.', 'Cross-chain onboarding through NEAR Intents is planned. Start with a NEAR wallet for the testnet release.'], ["['evm', 'MetaMask / EVM', 'via Intents']", "['evm', 'MetaMask / EVM', 'planned']"], ["['sol', 'Phantom / Solana', 'via Intents']", "['sol', 'Phantom / Solana', 'planned']"]],
  'Buy.dc.html': [['<div data-screen-label="07 Buy via Intents"', '<div class="totem-status"><strong>INTENTS ROUTE PROTOTYPE</strong> Quotes and signatures are disabled until the cross-chain integration is complete.</div><div data-screen-label="07 Buy via Intents"'], ['{{ chain }} → Intents → NEAR', '{{ chain }} to NEAR via planned Intents route'], ['onClick="{{ sign }}"', 'disabled="true"'], ['Sign intent</button>', 'Intents integration pending</button>']],
  'Launch-Review.dc.html': [['Calculating the live launch quote…', 'Calculating the testnet launch quote...'], ['Live quote ready. Review and sign when enabled.', 'Testnet quote ready. Review when deployment is enabled.']]
};

for (const name of fs.readdirSync(dist)) {
  if (!/\.(html|js|css)$/.test(name) || excluded.has(name)) continue;
  const file = path.join(dist, name);
  let source = fs.readFileSync(file, 'utf8')
    .replaceAll('—', '-')
    .replaceAll('–', '-')
    .replaceAll("||','", "||'Not set'");
  for (const [from, to] of replacements[name] ?? []) source = source.replaceAll(from, to);
  if (name === 'Arena.dc.html') {
    const banner = '<div class="totem-status"><strong>INTERACTIVE ARENA PREVIEW</strong> Sample worlds and mechanics are shown below. No campaign, vote, reward or market is live yet.</div>';
    source = source.replace(new RegExp(`(?:${banner.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})+`), banner);
  }
  if (name.endsWith('.html') && !source.includes('rel="icon"')) {
    source = source.replace(/<meta name="viewport"[^>]*>/, match => `${match}\n<title>TOTEM | Culture Engine on NEAR</title>\n<link rel="icon" href="./favicon.svg" type="image/svg+xml">`);
  }
  if (name.endsWith('.html') && !source.includes('platform.css')) {
    source = source.replace('</head>', '<link rel="stylesheet" href="./platform.css">\n</head>');
  }
  fs.writeFileSync(file, source);
}
