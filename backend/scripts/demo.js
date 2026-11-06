import { evaluateHoldingRule, routeFee, mintIdempotencyKey, chooseEvolution } from '../src/index.js'

const now = Date.UTC(2026, 10, 6)
const checkpoints = Array.from({ length: 7 }, (_, index) => ({ period: `day-${index + 1}`, balance: 12_400, observedAt: now - (6 - index) * 86_400_000 }))
const eligibility = evaluateHoldingRule({ kind: 'time_weighted_balance', minimumBalance: 10_000, windowDays: 7, minimumCoveredDays: 7 }, checkpoints, now)
const evolution = chooseEvolution([
  { id: 'guardian', role: 'Liquidity Guardian', priority: 20, requirements: [{ signal: 'holdingDays', minimum: 7 }, { signal: 'liquidityActions', minimum: 1 }] },
  { id: 'maker', role: 'Meme Maker', priority: 10, requirements: [{ signal: 'challengeReceipts', minimum: 1 }] }
], { holdingDays: 7, liquidityActions: 1, challengeReceipts: 1 })
const fees = routeFee(100, { id: 'bbc-genesis-v1', routes: [
  { destination: 'community.treasury.near', basisPoints: 4500 },
  { destination: 'creator.artist.near', basisPoints: 3500 },
  { destination: 'season.prizes.near', basisPoints: 2000 }
] })

console.log(JSON.stringify({ eligibility, evolution, fees, mintKey: mintIdempotencyKey({ campaignId: 'bbc-genesis', accountId: 'demo.near', eligibilityEpoch: 1 }) }, null, 2))
