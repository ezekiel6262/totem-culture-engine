import test from 'node:test'
import assert from 'node:assert/strict'
import { MemoryTotemRepository, TotemService, createCampaignVersion } from '../src/index.js'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 10, 6)

function campaign(overrides = {}) {
  return {
    id: 'totem-genesis', creatorAccountId: 'creator.near', subjectContractId: 'totem.demo.near', mode: 'token_first',
    startsAt: NOW - DAY, endsAt: NOW + 30 * DAY, status: 'active',
    rule: { kind: 'time_weighted_balance', minimumBalance: 10_000, windowDays: 7, minimumCoveredDays: 7 },
    evolutionBranches: [
      { id: 'guardian', role: 'Liquidity Guardian', priority: 20, requirements: [{ signal: 'holdingDays', minimum: 7 }, { signal: 'liquidityActions', minimum: 1 }] },
      { id: 'maker', role: 'Meme Maker', priority: 10, requirements: [{ signal: 'challengeReceipts', minimum: 1 }] }
    ],
    feePolicy: { routes: [{ destination: 'treasury.near', basisPoints: 4500 }, { destination: 'creator.near', basisPoints: 3500 }, { destination: 'prizes.near', basisPoints: 2000 }] },
    ...overrides
  }
}

const checkpoints = Array.from({ length: 7 }, (_, i) => ({ period: `d${i}`, balance: 12_000, observedAt: NOW - (6 - i) * DAY }))

test('campaign versions form an immutable hash chain', () => {
  const first = createCampaignVersion(campaign(), null, NOW)
  const second = createCampaignVersion(campaign({ status: 'paused' }), first, NOW + 1)
  assert.equal(second.version, 2)
  assert.equal(second.previousVersionHash, first.versionHash)
  assert.notEqual(second.versionHash, first.versionHash)
})

test('rejects invalid creator and fee policies', () => {
  assert.throws(() => createCampaignVersion(campaign({ creatorAccountId: 'INVALID!' })), /valid NEAR/)
  assert.throws(() => createCampaignVersion(campaign({ feePolicy: { routes: [{ destination: 'x', basisPoints: 9999 }] } })), /10,000/)
})

test('prepares a mint command exactly once and emits a public audit feed', async () => {
  const repository = new MemoryTotemRepository()
  const service = new TotemService(repository, () => NOW, { nftContractId: 'nft.totem.testnet' })
  await service.createCampaign(campaign())
  const input = { campaignId: 'totem-genesis', accountId: 'member.near', eligibilityEpoch: 1, checkpoints, signals: { holdingDays: 7, liquidityActions: 1, challengeReceipts: 1 } }
  const first = await service.prepareMint(input)
  const replay = await service.prepareMint(input)
  assert.equal(first.replay, false)
  assert.equal(replay.replay, true)
  assert.equal(replay.command.idempotencyKey, first.command.idempotencyKey)
  assert.equal(first.command.transactionPlan.operatorApproval.actions[0].params.methodName, 'approve_eligibility')
  assert.equal(first.command.transactionPlan.operatorApproval.actions[0].params.args.account_id, 'member.near')
  assert.equal(first.command.transactionPlan.memberMint.actions[0].params.methodName, 'mint')
  assert.equal(first.command.transactionPlan.memberMint.receiverId, 'nft.totem.testnet')
  const events = await repository.listEvents({ campaignId: 'totem-genesis' })
  assert.deepEqual(events.map(event => event.type), ['campaign.version_created', 'identity.mint_prepared'])
})

test('refuses mint preparation when durable holding is incomplete', async () => {
  const repository = new MemoryTotemRepository()
  const service = new TotemService(repository, () => NOW, { nftContractId: 'nft.totem.testnet' })
  await service.createCampaign(campaign())
  await assert.rejects(() => service.prepareMint({ campaignId: 'totem-genesis', accountId: 'member.near', eligibilityEpoch: 1, checkpoints: checkpoints.slice(0, 1), signals: { challengeReceipts: 1 } }), /not satisfied/)
})
