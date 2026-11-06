import test from 'node:test'
import assert from 'node:assert/strict'
import { PostgresAuthRepository, PostgresTotemRepository } from '../src/index.js'

const campaign = {
  id: 'bbc', creatorAccountId: 'creator.near', subjectContractId: 'bbc.near', mode: 'token_first',
  version: 2, status: 'active', startsAt: 1_000, endsAt: 2_000,
  versionHash: 'a'.repeat(64), previousVersionHash: 'b'.repeat(64)
}

test('Postgres repository aborts stale or identity-changing campaign versions', async () => {
  const sql = {
    transaction: async action => action({ query: async () => ({ rowCount: 0, rows: [] }) })
  }
  const repository = new PostgresTotemRepository(sql)
  await assert.rejects(() => repository.saveCampaignVersion(campaign), /identity is immutable or version is stale/)
})

test('Postgres checkpoint upsert refuses to replace a newer finalized observation', async () => {
  const queries = []
  const sql = { query: async (text, values) => { queries.push({ text, values }); return { rowCount: 0, rows: [] } } }
  const repository = new PostgresTotemRepository(sql)
  const checkpoint = { campaignId: 'bbc', accountId: 'member.near', period: 'd1', balance: '10', blockHeight: 42, blockHash: 'hash', observedAt: 1000, provenance: { finality: 'final' } }
  const result = await repository.upsertCheckpoint(checkpoint)
  assert.equal(result.updated, false)
  assert.match(queries[0].text, /block_height < excluded\.block_height/)
})

test('Postgres auth challenge consumption is atomic', async () => {
  const calls = []
  const sql = { query: async (text, values) => { calls.push({ text, values }); return { rowCount: 1, rows: [{ nonce: values[0] }] } } }
  const repository = new PostgresAuthRepository(sql)
  assert.equal(await repository.consumeOnce('nonce'), true)
  assert.match(calls[0].text, /consumed_at is null/)
})
