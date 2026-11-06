import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { createAuthChallenge, encodeBase58, MemoryChallengeStore, nep413Digest, NearRpcClient, observeFinalizedBalance, verifyNep413Authentication } from '../src/index.js'

test('NEP-413 authentication verifies domain-separated signature and current full-access key', async () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const raw = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32)
  const publicKeyString = `ed25519:${encodeBase58(raw)}`
  const challenge = createAuthChallenge({ accountId: 'member.near', recipient: 'totem.example', now: 1000 })
  const signature = sign(null, nep413Digest({ message: challenge.message, nonce: challenge.nonce, recipient: challenge.recipient }), privateKey).toString('base64')
  const rpc = { viewAccessKey: async () => ({ permission: 'FullAccess', blockHeight: 42, blockHash: 'final-hash' }) }
  const store = new MemoryChallengeStore()
  const result = await verifyNep413Authentication({ challenge, signedMessage: { accountId: 'member.near', publicKey: publicKeyString, signature, state: challenge.state }, rpc, challengeStore: store, now: 2000 })
  assert.equal(result.authenticated, true)
  await assert.rejects(() => verifyNep413Authentication({ challenge, signedMessage: { accountId: 'member.near', publicKey: publicKeyString, signature, state: challenge.state }, rpc, challengeStore: store, now: 2000 }), /already consumed/)
})

test('NEP-413 rejects state mismatch and non-full-access keys', async () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const key = `ed25519:${encodeBase58(publicKey.export({ type: 'spki', format: 'der' }).subarray(-32))}`
  const challenge = createAuthChallenge({ accountId: 'member.near', recipient: 'totem.example', now: 1000 })
  const signature = sign(null, nep413Digest({ message: challenge.message, nonce: challenge.nonce, recipient: challenge.recipient }), privateKey).toString('base64')
  const store = new MemoryChallengeStore()
  await assert.rejects(() => verifyNep413Authentication({ challenge, signedMessage: { accountId: 'member.near', publicKey: key, signature, state: 'wrong' }, rpc: {}, challengeStore: store, now: 2000 }), /state does not match/)
  await assert.rejects(() => verifyNep413Authentication({ challenge, signedMessage: { accountId: 'member.near', publicKey: key, signature, state: challenge.state }, rpc: { viewAccessKey: async () => ({ permission: { FunctionCall: {} } }) }, challengeStore: store, now: 2000 }), /not a current full-access key/)
})

test('RPC balance observation pins ft_balance_of to one finalized block hash', async () => {
  const calls = []
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body); calls.push(body)
    if (body.method === 'block') return { ok: true, json: async () => ({ result: { header: { height: 77, hash: 'block-77', timestamp_nanosec: '1793923200000000000' } } }) }
    return { ok: true, json: async () => ({ result: { result: [...Buffer.from('"12400"')], block_height: 77, block_hash: 'block-77' } }) }
  }
  const rpc = new NearRpcClient({ endpoint: 'https://rpc.testnet.near.org', fetchImpl })
  const saved = []
  await observeFinalizedBalance({ campaign: { id: 'totem', subjectContractId: 'totem.testnet', rule: { kind: 'time_weighted_balance' } }, accountId: 'member.testnet', period: '2026-11-06', rpc, checkpointRepository: { upsertCheckpoint: async value => { saved.push(value); return value } } })
  assert.equal(calls[0].params.finality, 'final')
  assert.equal(calls[1].params.block_id, 'block-77')
  assert.equal(saved[0].balance, '12400')
  assert.equal(saved[0].provenance.finality, 'final')
})
