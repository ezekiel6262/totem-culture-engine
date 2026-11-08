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

test('models token-first, NFT-first and twin-launch Culture Pairs', () => {
  const tokenFirst = createCampaignVersion(campaign(), null, NOW)
  assert.deepEqual(tokenFirst.culturePair, { tokenContractId: 'totem.demo.near', collectionContractId: null })
  const nftFirst = createCampaignVersion(campaign({ mode: 'nft_first', subjectContractId: 'glyphs.near' }), null, NOW)
  assert.deepEqual(nftFirst.culturePair, { tokenContractId: null, collectionContractId: 'glyphs.near' })
  const twin = createCampaignVersion(campaign({ mode: 'twin_launch', culturePair: { tokenContractId: 'token.near', collectionContractId: 'nft.near' } }), null, NOW)
  assert.deepEqual(twin.culturePair, { tokenContractId: 'token.near', collectionContractId: 'nft.near' })
  assert.throws(() => createCampaignVersion(campaign({ mode: 'twin_launch' })), /both token and collection/)
})

test('reads a Culture Account from one finalized NFT state', async () => {
  const repository = new MemoryTotemRepository(), calls = []
  const rpc = {
    finalBlock: async () => ({ hash: 'final-block', height: 77 }),
    callFunctionAtBlock: async input => {
      calls.push(input)
      if (input.methodName === 'get_token_for_owner') return { value: '42', blockHeight: 77, blockHash: 'final-block' }
      return { value: { token_id: '42', owner_id: 'member.near', evolution: { branch: 'maker', tier: 3, frozen: false }, inventory: ['kente-wings'], credentials: ['founding-member'], arena: { points: 90, wins: 2, seasons: 3 } }, blockHeight: 77, blockHash: 'final-block' }
    }
  }
  const service = new TotemService(repository, () => NOW, { rpc })
  await service.createCampaign(campaign({ mode: 'twin_launch', culturePair: { tokenContractId: 'token.near', collectionContractId: 'nft.near' } }))
  const result = await service.cultureAccount({ campaignId: 'totem-genesis', accountId: 'member.near' })
  assert.equal(result.cultureAccount.inventory[0], 'kente-wings')
  assert.equal(result.blockHash, 'final-block')
  assert.deepEqual(calls.map(call => call.methodName), ['get_token_for_owner', 'get_culture_account'])
  assert.ok(calls.every(call => call.blockId === 'final-block'))
})

test('combines finalized token, NFT tier, and credentials into an access receipt', async () => {
  const repository = new MemoryTotemRepository(), calls = []
  const rpc = {
    finalBlock: async () => ({ hash: 'final-access-block', height: 91 }),
    callFunctionAtBlock: async input => {
      calls.push(input)
      if (input.methodName === 'ft_balance_of') return { value: '150000' }
      if (input.methodName === 'get_token_for_owner') return { value: '7' }
      return { value: { evolution: { tier: 2, frozen: false }, credentials: ['founding-member'] } }
    }
  }
  const service = new TotemService(repository, () => NOW, { rpc })
  await service.createCampaign(campaign({
    mode: 'twin_launch', culturePair: { tokenContractId: 'token.near', collectionContractId: 'nft.near' },
    accessPolicy: { minimumTokenBalance: '100000', requireCultureAccount: true, minimumTier: 2, requiredCredentials: ['founding-member'], ttlSeconds: 900, grants: ['arena', 'treasury-proposals'] }
  }))
  const decision = await service.accessDecision({ campaignId: 'totem-genesis', accountId: 'member.near' })
  assert.equal(decision.granted, true)
  assert.deepEqual(decision.grants, ['arena', 'treasury-proposals'])
  assert.equal(decision.blockHash, 'final-access-block')
  assert.match(decision.decisionHash, /^[a-f0-9]{64}$/)
  assert.ok(calls.every(call => call.blockId === 'final-access-block'))
})

test('denies access when a Culture Account is frozen', async () => {
  const repository = new MemoryTotemRepository()
  const rpc = {
    finalBlock: async () => ({ hash: 'final-access-block', height: 92 }),
    callFunctionAtBlock: async input => input.methodName === 'get_token_for_owner' ? { value: '8' } : { value: { evolution: { tier: 3, frozen: true }, credentials: [] } }
  }
  const service = new TotemService(repository, () => NOW, { rpc })
  await service.createCampaign(campaign({ mode: 'nft_first', subjectContractId: 'nft.near', accessPolicy: { minimumTokenBalance: '0', requireCultureAccount: true, minimumTier: 1, requiredCredentials: [], ttlSeconds: 900, grants: ['members'] } }))
  const decision = await service.accessDecision({ campaignId: 'totem-genesis', accountId: 'member.near' })
  assert.equal(decision.granted, false)
  assert.equal(decision.checks.find(check => check.kind === 'evolution_tier').pass, false)
})

test('records a social contribution once without self-awarding value', async () => {
  const repository = new MemoryTotemRepository(), service = new TotemService(repository, () => NOW)
  await service.createCampaign(campaign())
  const input = { campaignId: 'totem-genesis', accountId: 'member.near', kind: 'meme_raid', evidence: 'ipfs://proof', nonce: 'receipt_12345678' }
  const first = await service.submitContribution(input), replay = await service.submitContribution(input)
  assert.equal(first.replay, false)
  assert.equal(replay.replay, true)
  assert.equal(first.contribution.status, 'pending_verification')
  assert.equal('points' in first.contribution, false)
  const events = await repository.listEvents({ campaignId: 'totem-genesis' })
  assert.deepEqual(events.map(event => event.type), ['campaign.version_created', 'social.contribution_submitted'])
})

test('lets only the creator verify a contribution and prepare a credential grant', async () => {
  const repository = new MemoryTotemRepository(), service = new TotemService(repository, () => NOW)
  await service.createCampaign(campaign({ mode: 'twin_launch', culturePair: { tokenContractId: 'token.near', collectionContractId: 'nft.near' } }))
  const submitted = await service.submitContribution({ campaignId: 'totem-genesis', accountId: 'member.near', kind: 'arena_entry', evidence: 'tx:proof-123', nonce: 'receipt_87654321' })
  await assert.rejects(() => service.listContributions({ campaignId: 'totem-genesis', reviewerAccountId: 'stranger.near' }), /Only the culture creator/)
  const pending = await service.listContributions({ campaignId: 'totem-genesis', reviewerAccountId: 'creator.near' })
  assert.equal(pending.length, 1)
  const reviewed = await service.reviewContribution({ campaignId: 'totem-genesis', reviewerAccountId: 'creator.near', idempotencyKey: submitted.contribution.idempotencyKey, decision: 'approve' })
  assert.equal(reviewed.contribution.status, 'approved_pending_credential')
  assert.equal(reviewed.credentialTransaction.receiverId, 'nft.near')
  assert.deepEqual(reviewed.credentialTransaction.actions[0].params.args, { account_id: 'member.near', credential: 'contribution:arena_entry' })
  const retry = await service.reviewContribution({ campaignId: 'totem-genesis', reviewerAccountId: 'creator.near', idempotencyKey: submitted.contribution.idempotencyKey, decision: 'approve' })
  assert.equal(retry.credentialTransaction.receiverId, 'nft.near')
  const finalized = await service.finalizeContribution({ campaignId: 'totem-genesis', reviewerAccountId: 'creator.near', idempotencyKey: submitted.contribution.idempotencyKey, transactionHash: 'nearTransactionHash123456789' })
  assert.equal(finalized.contribution.status, 'verified')
  await assert.rejects(() => service.finalizeContribution({ campaignId: 'totem-genesis', reviewerAccountId: 'creator.near', idempotencyKey: submitted.contribution.idempotencyKey, transactionHash: 'nearTransactionHash123456789' }), /not awaiting/)
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

test('prepares mint against the launched collection with price plus refundable storage', async () => {
  const repository = new MemoryTotemRepository()
  const service = new TotemService(repository, () => NOW, { nftContractId: 'fallback.testnet' })
  await service.createCampaign(campaign({
    mode: 'nft_first',
    subjectContractId: 'culture-nft.creator.testnet',
    culturePair: { tokenContractId: null, collectionContractId: 'culture-nft.creator.testnet' },
    launchConfig: { nft: { price: '2.5 NEAR' } }
  }))
  const prepared = await service.prepareMint({ campaignId: 'totem-genesis', accountId: 'member.near', eligibilityEpoch: 1, checkpoints, signals: { challengeReceipts: 1 } })
  assert.equal(prepared.command.transactionPlan.memberMint.receiverId, 'culture-nft.creator.testnet')
  assert.equal(prepared.command.transactionPlan.memberMint.actions[0].params.deposit, '3500000000000000000000000')
})

test('refuses mint preparation when durable holding is incomplete', async () => {
  const repository = new MemoryTotemRepository()
  const service = new TotemService(repository, () => NOW, { nftContractId: 'nft.totem.testnet' })
  await service.createCampaign(campaign())
  await assert.rejects(() => service.prepareMint({ campaignId: 'totem-genesis', accountId: 'member.near', eligibilityEpoch: 1, checkpoints: checkpoints.slice(0, 1), signals: { challengeReceipts: 1 } }), /not satisfied/)
})
