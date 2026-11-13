// DynamoDB implementation of the product repository, on the same single table as the
// rest of Totem. Keys follow the existing scheme: pk/sk plus an `entity` attribute, with
// conditional writes for the rules that have to hold under concurrency.
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { DomainError } from './errors.js'

const clone = value => (value == null ? null : structuredClone(value))
const conditional = error => error?.name === 'ConditionalCheckFailedException' || error?.name === 'TransactionCanceledException'

export class DynamoProductRepository {
  constructor(client, tableName) { this.client = client; this.tableName = tableName }
  send(command) { return this.client.send(command) }

  async scanEntity(entity) {
    const items = []
    let ExclusiveStartKey
    do {
      const result = await this.send(new ScanCommand({ TableName: this.tableName, FilterExpression: '#entity = :entity', ExpressionAttributeNames: { '#entity': 'entity' }, ExpressionAttributeValues: { ':entity': entity }, ExclusiveStartKey }))
      items.push(...(result.Items ?? []))
      ExclusiveStartKey = result.LastEvaluatedKey
    } while (ExclusiveStartKey)
    return items
  }

  async putItem(pk, sk, entity, field, value, condition) {
    const command = { TableName: this.tableName, Item: { pk, sk, entity, [field]: value } }
    if (condition) command.ConditionExpression = condition
    await this.send(new PutCommand(command))
    return clone(value)
  }

  async getField(pk, sk, field) {
    const result = await this.send(new GetCommand({ TableName: this.tableName, Key: { pk, sk }, ConsistentRead: true }))
    return clone(result.Item?.[field] ?? null)
  }

  /* totems */

  async nextTotemId() {
    const result = await this.send(new UpdateCommand({ TableName: this.tableName, Key: { pk: 'TOTEM_SEQ', sk: 'COUNTER' }, UpdateExpression: 'ADD #value :one', ExpressionAttributeNames: { '#value': 'value' }, ExpressionAttributeValues: { ':one': 1 }, ReturnValues: 'UPDATED_NEW' }))
    return String(1000 + Number(result.Attributes.value))
  }

  async createTotem({ id, owner, pieces = 0, items = [], origin = null, createdAt = Date.now() }) {
    const totemId = id ?? await this.nextTotemId()
    const totem = { id: totemId, owner, pieces, items: [...items], origin, createdAt, lending: false, rentedTo: null, rentedUntil: null }
    try {
      return await this.putItem(`TOTEM#${totemId}`, 'TOTEM', 'totem', 'totem', totem, 'attribute_not_exists(pk)')
    } catch (error) {
      if (conditional(error)) throw new DomainError('TOTEM_EXISTS', `Totem #${totemId} already exists`)
      throw error
    }
  }

  async getTotem(id) { return this.getField(`TOTEM#${String(id)}`, 'TOTEM', 'totem') }

  async saveTotem(totem) {
    try {
      return await this.putItem(`TOTEM#${totem.id}`, 'TOTEM', 'totem', 'totem', totem, 'attribute_exists(pk)')
    } catch (error) {
      if (conditional(error)) throw new DomainError('TOTEM_NOT_FOUND', `Totem #${totem.id} not found`)
      throw error
    }
  }

  async deleteTotem(id) {
    await this.send(new DeleteCommand({ TableName: this.tableName, Key: { pk: `TOTEM#${String(id)}`, sk: 'TOTEM' } }))
    return true
  }

  async listTotems({ owner } = {}) {
    return (await this.scanEntity('totem')).map(item => item.totem)
      .filter(totem => !owner || totem.owner === owner)
      .sort((a, b) => Number(a.id) - Number(b.id))
      .map(clone)
  }

  /* arenas and rooms */

  async saveArena(arena) { return this.putItem(`ARENA#${arena.id}`, 'ARENA', 'arena', 'arena', arena) }
  async getArena(id) { return this.getField(`ARENA#${id}`, 'ARENA', 'arena') }
  async listArenas() { return (await this.scanEntity('arena')).map(item => clone(item.arena)) }
  async saveRoom(room) { return this.putItem(`ROOM#${room.id}`, 'ROOM', 'room', 'room', room) }
  async getRoom(id) { return this.getField(`ROOM#${id}`, 'ROOM', 'room') }
  async listRooms() { return (await this.scanEntity('room')).map(item => clone(item.room)) }

  /* results */

  async createResultOnce(result) {
    const key = { pk: `RESULT#${result.key}`, sk: 'RESULT' }
    try {
      await this.send(new PutCommand({ TableName: this.tableName, Item: { ...key, entity: 'result', result }, ConditionExpression: 'attribute_not_exists(pk)' }))
      return { created: true, result: clone(result) }
    } catch (error) {
      if (!conditional(error)) throw error
      const existing = await this.send(new GetCommand({ TableName: this.tableName, Key: key, ConsistentRead: true }))
      return { created: false, result: clone(existing.Item.result) }
    }
  }

  async listResults({ arenaId, game, player, status, seasonId } = {}) {
    return (await this.scanEntity('result')).map(item => item.result)
      .filter(row => (!arenaId || row.arenaId === arenaId) && (!game || row.game === game) && (!player || row.player === player) && (!status || row.status === status) && (!seasonId || row.seasonId === seasonId || !row.seasonId))
      .sort((a, b) => a.reportedAt - b.reportedAt)
      .map(clone)
  }

  async updateResultStatus({ key, expectedStatus, status, settledAt }) {
    try {
      const updated = await this.send(new UpdateCommand({
        TableName: this.tableName,
        Key: { pk: `RESULT#${key}`, sk: 'RESULT' },
        UpdateExpression: 'SET #result.#status = :status, #result.settledAt = :settledAt',
        ConditionExpression: '#result.#status = :expected',
        ExpressionAttributeNames: { '#result': 'result', '#status': 'status' },
        ExpressionAttributeValues: { ':status': status, ':expected': expectedStatus, ':settledAt': settledAt },
        ReturnValues: 'ALL_NEW'
      }))
      return clone(updated.Attributes.result)
    } catch (error) {
      if (conditional(error)) return null
      throw error
    }
  }

  /* seasons */

  async saveSeason(season, { current = false } = {}) {
    await this.putItem(`SEASON#${season.id}`, 'SEASON', 'season', 'season', season)
    if (current) await this.send(new PutCommand({ TableName: this.tableName, Item: { pk: 'SEASON_CURRENT', sk: 'POINTER', entity: 'season-pointer', seasonId: season.id } }))
    return clone(season)
  }

  async getCurrentSeason() {
    const pointer = await this.send(new GetCommand({ TableName: this.tableName, Key: { pk: 'SEASON_CURRENT', sk: 'POINTER' }, ConsistentRead: true }))
    if (!pointer.Item) return null
    return this.getField(`SEASON#${pointer.Item.seasonId}`, 'SEASON', 'season')
  }

  /* market */

  async createListing(listing) {
    const stored = { ...listing, id: listing.id ?? `listing_${crypto.randomUUID()}` }
    return this.putItem(`LISTING#${stored.id}`, 'LISTING', 'listing', 'listing', stored)
  }

  async getListing(id) { return this.getField(`LISTING#${id}`, 'LISTING', 'listing') }

  async listListings({ status } = {}) {
    return (await this.scanEntity('listing')).map(item => item.listing)
      .filter(row => !status || row.status === status)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(clone)
  }

  async updateListingStatus({ id, expectedStatus, status, buyer, soldAt }) {
    try {
      const updated = await this.send(new UpdateCommand({
        TableName: this.tableName,
        Key: { pk: `LISTING#${id}`, sk: 'LISTING' },
        UpdateExpression: 'SET #listing.#status = :status, #listing.buyer = :buyer, #listing.soldAt = :soldAt',
        ConditionExpression: '#listing.#status = :expected',
        ExpressionAttributeNames: { '#listing': 'listing', '#status': 'status' },
        ExpressionAttributeValues: { ':status': status, ':expected': expectedStatus, ':buyer': buyer, ':soldAt': soldAt },
        ReturnValues: 'ALL_NEW'
      }))
      return clone(updated.Attributes.listing)
    } catch (error) {
      if (conditional(error)) return null
      throw error
    }
  }

  /* rentals */

  async createRental(rental) {
    const stored = { ...rental, id: rental.id ?? `rental_${crypto.randomUUID()}` }
    return this.putItem(`RENTAL#${stored.id}`, 'RENTAL', 'rental', 'rental', stored)
  }

  async listRentals({ renter, owner, activeAt } = {}) {
    return (await this.scanEntity('rental')).map(item => item.rental)
      .filter(row => (!renter || row.renter === renter) && (!owner || row.owner === owner) && (activeAt == null || row.expiresAt > activeAt))
      .map(clone)
  }

  /* launches */

  async createLaunch(launch) {
    const stored = { ...launch, id: launch.id ?? `launch_${crypto.randomUUID()}` }
    return this.putItem(`LAUNCH#${stored.id}`, 'LAUNCH', 'launch', 'launch', stored)
  }

  async listLaunches({ creator } = {}) {
    return (await this.scanEntity('launch')).map(item => item.launch)
      .filter(row => !creator || row.creator === creator)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(clone)
  }

  async updateLaunchStatus({ id, expectedStatus, status, reviewedBy, reviewedAt, note }) {
    try {
      const updated = await this.send(new UpdateCommand({
        TableName: this.tableName,
        Key: { pk: `LAUNCH#${id}`, sk: 'LAUNCH' },
        UpdateExpression: 'SET #launch.#status = :status, #launch.reviewedBy = :by, #launch.reviewedAt = :at, #launch.note = :note',
        ConditionExpression: '#launch.#status = :expected',
        ExpressionAttributeNames: { '#launch': 'launch', '#status': 'status' },
        ExpressionAttributeValues: { ':status': status, ':expected': expectedStatus, ':by': reviewedBy, ':at': reviewedAt, ':note': note ?? '' },
        ReturnValues: 'ALL_NEW'
      }))
      return clone(updated.Attributes.launch)
    } catch (error) {
      if (conditional(error)) return null
      throw error
    }
  }

  /* prizes and claims */

  async createPrize(prize) {
    const stored = { ...prize, id: prize.id ?? `prize_${crypto.randomUUID()}`, claimedBy: prize.claimedBy ?? null }
    return this.putItem(`PRIZE#${stored.id}`, 'PRIZE', 'prize', 'prize', stored)
  }

  async getPrize(id) { return this.getField(`PRIZE#${id}`, 'PRIZE', 'prize') }

  async updatePrize({ id, ...patch }) {
    const prize = await this.getPrize(id)
    if (!prize) return null
    return this.putItem(`PRIZE#${id}`, 'PRIZE', 'prize', 'prize', { ...prize, ...patch })
  }

  async saveAccount(account) { return this.putItem(`ACCOUNT#${account.id}`, 'ACCOUNT', 'account', 'account', account) }
  async getAccount(id) { return this.getField(`ACCOUNT#${id}`, 'ACCOUNT', 'account') }
  async listAccounts() { return (await this.scanEntity('account')).map(item => clone(item.account)) }

  // A grant is one per account per kind, and the counter is the phase cap: the store hands
  // out the next number atomically, so two requests racing cannot both take the last slot.
  async nextGrantNumber(kind) {
    const result = await this.send(new UpdateCommand({ TableName: this.tableName, Key: { pk: `GRANT_SEQ#${kind}`, sk: 'COUNTER' }, UpdateExpression: 'ADD #value :one', ExpressionAttributeNames: { '#value': 'value' }, ExpressionAttributeValues: { ':one': 1 }, ReturnValues: 'UPDATED_NEW' }))
    return Number(result.Attributes.value)
  }

  async createGrant(grant) { return this.putItem(`GRANT#${grant.kind}#${grant.accountId}`, 'GRANT', 'grant', 'grant', grant, 'attribute_not_exists(pk)') }
  async getGrant(kind, accountId) { return this.getField(`GRANT#${kind}#${accountId}`, 'GRANT', 'grant') }

  async createClaim(claim) { return this.putItem(`CLAIM#${claim.handle}`, 'CLAIM', 'claim', 'claim', claim, 'attribute_not_exists(pk)') }
  async getClaim(handle) { return this.getField(`CLAIM#${handle}`, 'CLAIM', 'claim') }

  /* ledger */

  async appendLedgerEntry(entry) {
    // Descending sort key, so the newest entry is first without reversing a page.
    const sk = `AT#${String(Number.MAX_SAFE_INTEGER - entry.at).padStart(16, '0')}#${crypto.randomUUID()}`
    await this.send(new PutCommand({ TableName: this.tableName, Item: { pk: `LEDGER#${entry.account}`, sk, entity: 'ledger', entry } }))
    return clone(entry)
  }

  async listLedger({ account, limit = 20 }) {
    const result = await this.send(new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk,:prefix)',
      ExpressionAttributeValues: { ':pk': `LEDGER#${account}`, ':prefix': 'AT#' },
      Limit: Math.min(Math.max(limit, 1), 100),
      ConsistentRead: true
    }))
    return (result.Items ?? []).map(item => clone(item.entry))
  }
}
