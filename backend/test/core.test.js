import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { canonicalize, chooseEvolution, evaluateHoldingRule, MemoryNonceStore, mintIdempotencyKey, receiptPayload, routeFee, verifyChallengeReceipt } from '../src/index.js'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 10, 6)
const rule = { kind: 'time_weighted_balance', minimumBalance: 10_000, windowDays: 7, minimumCoveredDays: 7 }

test('rejects an instantaneous balance snapshot', () => {
  const result = evaluateHoldingRule(rule, [{ period: 'day-7', balance: 1_000_000, observedAt: NOW }], NOW)
  assert.equal(result.eligible, false)
  assert.ok(result.reasons.includes('INSUFFICIENT_DURATION'))
})

test('accepts seven independent qualifying checkpoints', () => {
  const points = Array.from({ length: 7 }, (_, i) => ({ period: `d${i}`, balance: 10_000, observedAt: NOW - (6 - i) * DAY }))
  assert.equal(evaluateHoldingRule(rule, points, NOW).eligible, true)
})

test('deduplicates checkpoints by period', () => {
  const points = Array.from({ length: 7 }, (_, i) => ({ period: 'same', balance: 100_000, observedAt: NOW - i * DAY }))
  assert.equal(evaluateHoldingRule(rule, points, NOW).coveredDays, 1)
})

test('verifies and consumes a bound receipt exactly once', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const issuer = { id: 'demo.community.v1', publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }) }
  const receipt = { version: 1, issuer: issuer.id, subject: 'demo.near', campaignId: 'totem-genesis', actionId: 'publish-meme', nonce: 'n-001', issuedAt: NOW - 1, expiresAt: NOW + 10_000, evidenceHash: 'a'.repeat(64), provenance: { uri: 'demo://moderation/42', hash: 'b'.repeat(64) } }
  receipt.signature = sign(null, Buffer.from(canonicalize(receiptPayload(receipt))), privateKey).toString('base64')
  const store = new MemoryNonceStore()
  assert.equal(verifyChallengeReceipt({ receipt, issuer, expected: { subject: 'demo.near', campaignId: 'totem-genesis', actionId: 'publish-meme' }, nonceStore: store, now: NOW }).valid, true)
  assert.throws(() => verifyChallengeReceipt({ receipt, issuer, expected: { subject: 'demo.near', campaignId: 'totem-genesis', actionId: 'publish-meme' }, nonceStore: store, now: NOW }), /already consumed/)
})

test('routes all smallest units and rejects an invalid split', () => {
  const policy = { id: 'v1', routes: [{ destination: 'treasury', basisPoints: 4500 }, { destination: 'creator', basisPoints: 3500 }, { destination: 'prizes', basisPoints: 2000 }] }
  const result = routeFee(101, policy)
  assert.equal(result.allocations.reduce((sum, route) => sum + route.amount, 0), 101)
  assert.throws(() => routeFee(100, { id: 'bad', routes: [{ destination: 'x', basisPoints: 9999 }] }), /10,000/)
})

test('evolution and mint key are deterministic', () => {
  const branches = [{ id: 'maker', role: 'Meme Maker', priority: 1, requirements: [{ signal: 'receipts', minimum: 1 }] }]
  assert.equal(chooseEvolution(branches, { receipts: 1 }).branchId, 'maker')
  assert.equal(mintIdempotencyKey({ campaignId: 'c', accountId: 'a', eligibilityEpoch: 1 }), mintIdempotencyKey({ accountId: 'a', eligibilityEpoch: 1, campaignId: 'c' }))
})
