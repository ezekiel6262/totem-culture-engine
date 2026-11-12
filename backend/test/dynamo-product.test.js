import test from 'node:test'
import assert from 'node:assert/strict'
import { DynamoProductRepository } from '../src/index.js'

const TABLE = 'totem-table'

// Records every command and answers with whatever the test queued.
function stub(responses = []) {
  const sent = []
  const queue = [...responses]
  const client = {
    send: async command => {
      sent.push({ name: command.constructor.name, input: command.input })
      const next = queue.shift()
      if (next instanceof Error) throw next
      return next ?? {}
    }
  }
  return { client, sent }
}

const conditionalFailure = () => Object.assign(new Error('conditional'), { name: 'ConditionalCheckFailedException' })

test('a Totem is keyed by id on the shared table and created only once', async () => {
  const { client, sent } = stub()
  const repository = new DynamoProductRepository(client, TABLE)
  await repository.createTotem({ id: '417', owner: 'ada.near', pieces: 3, createdAt: 10 })

  assert.equal(sent[0].name, 'PutCommand')
  assert.equal(sent[0].input.TableName, TABLE)
  assert.deepEqual({ pk: sent[0].input.Item.pk, sk: sent[0].input.Item.sk, entity: sent[0].input.Item.entity }, { pk: 'TOTEM#417', sk: 'TOTEM', entity: 'totem' })
  assert.equal(sent[0].input.ConditionExpression, 'attribute_not_exists(pk)')
  assert.equal(sent[0].input.Item.totem.pieces, 3)
})

test('creating a Totem that exists is reported as a domain error', async () => {
  const { client } = stub([conditionalFailure()])
  const repository = new DynamoProductRepository(client, TABLE)
  await assert.rejects(() => repository.createTotem({ id: '417', owner: 'ada.near' }), error => error.code === 'TOTEM_EXISTS')
})

test('saving a Totem requires it to exist', async () => {
  const { client, sent } = stub([conditionalFailure()])
  const repository = new DynamoProductRepository(client, TABLE)
  await assert.rejects(() => repository.saveTotem({ id: '999', owner: 'ada.near', pieces: 1 }), error => error.code === 'TOTEM_NOT_FOUND')
  assert.equal(sent[0].input.ConditionExpression, 'attribute_exists(pk)')
})

test('a new Totem without an id takes the next number from a counter', async () => {
  const { client, sent } = stub([{ Attributes: { value: 7 } }, {}])
  const repository = new DynamoProductRepository(client, TABLE)
  const totem = await repository.createTotem({ owner: 'ada.near' })
  assert.equal(sent[0].name, 'UpdateCommand')
  assert.equal(sent[0].input.Key.pk, 'TOTEM_SEQ')
  assert.equal(totem.id, '1007')
})

test('a result is written once and its status update guards the previous value', async () => {
  const { client, sent } = stub([{}, { Attributes: { result: { status: 'settled' } } }])
  const repository = new DynamoProductRepository(client, TABLE)

  const created = await repository.createResultOnce({ key: 'abc', arenaId: 'totem', game: 'kart', player: 'ada.near', status: 'reported', reportedAt: 1 })
  assert.equal(created.created, true)
  assert.equal(sent[0].input.Item.pk, 'RESULT#abc')
  assert.equal(sent[0].input.ConditionExpression, 'attribute_not_exists(pk)')

  await repository.updateResultStatus({ key: 'abc', expectedStatus: 'reported', status: 'settled', settledAt: 2 })
  // `result` and `status` are both reserved words, so both must be aliased.
  assert.deepEqual(sent[1].input.ExpressionAttributeNames, { '#result': 'result', '#status': 'status' })
  assert.equal(sent[1].input.ConditionExpression, '#result.#status = :expected')
})

test('a replayed result returns the stored one instead of failing', async () => {
  const { client } = stub([conditionalFailure(), { Item: { result: { key: 'abc', status: 'reported' } } }])
  const repository = new DynamoProductRepository(client, TABLE)
  const replay = await repository.createResultOnce({ key: 'abc', status: 'reported' })
  assert.equal(replay.created, false)
  assert.equal(replay.result.key, 'abc')
})

test('a lost race on a listing or launch status returns null rather than throwing', async () => {
  const listing = new DynamoProductRepository(stub([conditionalFailure()]).client, TABLE)
  assert.equal(await listing.updateListingStatus({ id: 'l1', expectedStatus: 'open', status: 'sold' }), null)

  const launch = new DynamoProductRepository(stub([conditionalFailure()]).client, TABLE)
  assert.equal(await launch.updateLaunchStatus({ id: 'x1', expectedStatus: 'pending_review', status: 'approved' }), null)
})

test('the current season is read through a pointer item', async () => {
  const { client, sent } = stub([{ Item: { seasonId: 'season-1' } }, { Item: { season: { id: 'season-1', name: 'Season 1' } } }])
  const repository = new DynamoProductRepository(client, TABLE)
  const season = await repository.getCurrentSeason()
  assert.equal(sent[0].input.Key.pk, 'SEASON_CURRENT')
  assert.equal(sent[1].input.Key.pk, 'SEASON#season-1')
  assert.equal(season.name, 'Season 1')
})

test('no current season pointer means no season, without a second read', async () => {
  const { client, sent } = stub([{}])
  const repository = new DynamoProductRepository(client, TABLE)
  assert.equal(await repository.getCurrentSeason(), null)
  assert.equal(sent.length, 1)
})

test('ledger entries sort newest first by key', async () => {
  const { client, sent } = stub([{}, {}])
  const repository = new DynamoProductRepository(client, TABLE)
  await repository.appendLedgerEntry({ account: 'ada.near', at: 1_000, title: 'older' })
  await repository.appendLedgerEntry({ account: 'ada.near', at: 2_000, title: 'newer' })

  assert.equal(sent[0].input.Item.pk, 'LEDGER#ada.near')
  // Descending key: the later timestamp must sort first.
  assert.ok(sent[1].input.Item.sk < sent[0].input.Item.sk)
})

test('a ledger read is a bounded query on one account', async () => {
  const { client, sent } = stub([{ Items: [{ entry: { title: 'Locked a piece' } }] }])
  const repository = new DynamoProductRepository(client, TABLE)
  const ledger = await repository.listLedger({ account: 'ada.near', limit: 500 })
  assert.equal(sent[0].name, 'QueryCommand')
  assert.equal(sent[0].input.ExpressionAttributeValues[':pk'], 'LEDGER#ada.near')
  assert.equal(sent[0].input.Limit, 100)
  assert.equal(ledger[0].title, 'Locked a piece')
})

test('listing Totems by owner filters a scan of the entity', async () => {
  const { client, sent } = stub([{ Items: [{ totem: { id: '417', owner: 'ada.near' } }, { totem: { id: '1201', owner: 'kofi.near' } }] }])
  const repository = new DynamoProductRepository(client, TABLE)
  const mine = await repository.listTotems({ owner: 'ada.near' })
  assert.equal(sent[0].name, 'ScanCommand')
  assert.equal(sent[0].input.ExpressionAttributeValues[':entity'], 'totem')
  assert.deepEqual(mine.map(totem => totem.id), ['417'])
})

test('a claimed name cannot be written twice', async () => {
  const { client, sent } = stub([{}])
  const repository = new DynamoProductRepository(client, TABLE)
  await repository.createClaim({ handle: 'newcomer.near', totemId: '1001', kind: 'starter', at: 1 })
  assert.equal(sent[0].input.Item.pk, 'CLAIM#newcomer.near')
  assert.equal(sent[0].input.ConditionExpression, 'attribute_not_exists(pk)')
})
