// In-memory repository for the product collections the new frontend reads and writes.
// Postgres and DynamoDB implementations follow the same interface.
import { DomainError } from './errors.js'

const clone = value => (value == null ? value : structuredClone(value))

export class MemoryProductRepository {
  #totems = new Map()
  #arenas = new Map()
  #rooms = new Map()
  #results = new Map()
  #listings = new Map()
  #rentals = []
  #launches = new Map()
  #prizes = new Map()
  #claims = new Map()
  #accounts = new Map()
  #ledger = []
  #seasons = new Map()
  #currentSeasonId = null
  #nextTotemId = 1000
  #nextId = 1

  #id(prefix) { return `${prefix}_${this.#nextId++}` }

  /* totems */

  async createTotem({ id, owner, pieces = 0, items = [], origin = null, createdAt = Date.now() }) {
    const totemId = id ?? String(++this.#nextTotemId)
    if (this.#totems.has(totemId)) throw new DomainError('TOTEM_EXISTS', `Totem #${totemId} already exists`)
    const totem = { id: totemId, owner, pieces, items: [...items], origin, createdAt, lending: false, rentedTo: null, rentedUntil: null }
    this.#totems.set(totemId, totem)
    return clone(totem)
  }

  async getTotem(id) { return clone(this.#totems.get(String(id)) ?? null) }

  async saveTotem(totem) {
    if (!this.#totems.has(totem.id)) throw new DomainError('TOTEM_NOT_FOUND', `Totem #${totem.id} not found`)
    this.#totems.set(totem.id, clone(totem))
    return clone(totem)
  }

  async deleteTotem(id) { return this.#totems.delete(String(id)) }

  async listTotems({ owner } = {}) {
    return [...this.#totems.values()].filter(totem => !owner || totem.owner === owner).sort((a, b) => Number(a.id) - Number(b.id)).map(clone)
  }

  /* arenas and rooms */

  async saveArena(arena) { this.#arenas.set(arena.id, clone(arena)); return clone(arena) }
  async getArena(id) { return clone(this.#arenas.get(id) ?? null) }
  async listArenas() { return [...this.#arenas.values()].map(clone) }
  async saveRoom(room) { this.#rooms.set(room.id, clone(room)); return clone(room) }
  async getRoom(id) { return clone(this.#rooms.get(id) ?? null) }
  async listRooms() { return [...this.#rooms.values()].map(clone) }

  /* results */

  async createResultOnce(result) {
    const existing = this.#results.get(result.key)
    if (existing) return { created: false, result: clone(existing) }
    this.#results.set(result.key, clone(result))
    return { created: true, result: clone(result) }
  }

  async listResults({ arenaId, game, player, status, seasonId } = {}) {
    return [...this.#results.values()]
      .filter(result => (!arenaId || result.arenaId === arenaId) && (!game || result.game === game) && (!player || result.player === player) && (!status || result.status === status) && (!seasonId || result.seasonId === seasonId || !result.seasonId))
      .sort((a, b) => a.reportedAt - b.reportedAt)
      .map(clone)
  }

  async updateResultStatus({ key, expectedStatus, status, settledAt }) {
    const result = this.#results.get(key)
    if (!result || result.status !== expectedStatus) return null
    const updated = { ...result, status, settledAt }
    this.#results.set(key, updated)
    return clone(updated)
  }

  /* seasons */

  async saveSeason(season, { current = false } = {}) {
    this.#seasons.set(season.id, clone(season))
    if (current) this.#currentSeasonId = season.id
    return clone(season)
  }

  async getCurrentSeason() { return clone(this.#seasons.get(this.#currentSeasonId) ?? null) }

  /* market */

  async createListing(listing) {
    const id = listing.id ?? this.#id('listing')
    const stored = { ...listing, id }
    this.#listings.set(id, clone(stored))
    return clone(stored)
  }

  async getListing(id) { return clone(this.#listings.get(id) ?? null) }

  async listListings({ status } = {}) {
    return [...this.#listings.values()].filter(listing => !status || listing.status === status).sort((a, b) => b.createdAt - a.createdAt).map(clone)
  }

  async updateListingStatus({ id, expectedStatus, status, buyer, soldAt }) {
    const listing = this.#listings.get(id)
    if (!listing || listing.status !== expectedStatus) return null
    const updated = { ...listing, status, buyer, soldAt }
    this.#listings.set(id, updated)
    return clone(updated)
  }

  /* rentals */

  async createRental(rental) {
    const stored = { ...rental, id: rental.id ?? this.#id('rental') }
    this.#rentals.push(clone(stored))
    return clone(stored)
  }

  async listRentals({ renter, owner, activeAt } = {}) {
    return this.#rentals
      .filter(rental => (!renter || rental.renter === renter) && (!owner || rental.owner === owner) && (activeAt == null || rental.expiresAt > activeAt))
      .map(clone)
  }

  /* launches */

  async createLaunch(launch) {
    const stored = { ...launch, id: launch.id ?? this.#id('launch') }
    this.#launches.set(stored.id, clone(stored))
    return clone(stored)
  }

  async listLaunches({ creator } = {}) {
    return [...this.#launches.values()].filter(launch => !creator || launch.creator === creator).sort((a, b) => b.createdAt - a.createdAt).map(clone)
  }

  async updateLaunchStatus({ id, expectedStatus, status, reviewedBy, reviewedAt, note }) {
    const launch = this.#launches.get(id)
    if (!launch || launch.status !== expectedStatus) return null
    const updated = { ...launch, status, reviewedBy, reviewedAt, note }
    this.#launches.set(id, updated)
    return clone(updated)
  }

  /* prizes and claims */

  async createPrize(prize) {
    const stored = { ...prize, id: prize.id ?? this.#id('prize'), claimedBy: prize.claimedBy ?? null }
    this.#prizes.set(stored.id, clone(stored))
    return clone(stored)
  }

  async getPrize(id) { return clone(this.#prizes.get(id) ?? null) }

  async updatePrize({ id, ...patch }) {
    const prize = this.#prizes.get(id)
    if (!prize) return null
    const updated = { ...prize, ...patch }
    this.#prizes.set(id, updated)
    return clone(updated)
  }

  async saveAccount(account) { this.#accounts.set(account.id, clone(account)); return clone(account) }
  async getAccount(id) { return clone(this.#accounts.get(id) ?? null) }
  async listAccounts() { return [...this.#accounts.values()].map(clone) }

  async createClaim(claim) { this.#claims.set(claim.handle, clone(claim)); return clone(claim) }
  async getClaim(handle) { return clone(this.#claims.get(handle) ?? null) }

  /* ledger */

  async appendLedgerEntry(entry) { this.#ledger.unshift(clone(entry)); return clone(entry) }

  async listLedger({ account, limit = 20 }) {
    return this.#ledger.filter(entry => entry.account === account).slice(0, limit).map(clone)
  }
}

/* ---------- platform configuration ---------- */
// The Arena, its rooms and the running season are platform configuration, not sample
// data: without them nothing can be entered or played. This runs in every environment
// and is safe to repeat.

export async function ensurePlatform(repository, { now = Date.now(), operator = 'ada.near', resultSigner = 'games.totem.near' } = {}) {
  if (!(await repository.getArena('totem'))) {
    await repository.saveArena({ id: 'totem', name: 'Totem Arena', collection: 'Totem', token: '$TOTEM', entryPieces: 1, paused: false, operator, resultSigner })
  }
  if (!(await repository.getRoom('holders'))) await repository.saveRoom({ id: 'holders', name: 'Holder room', minPieces: 1, requiresCredential: [] })
  if (!(await repository.getRoom('treasury'))) await repository.saveRoom({ id: 'treasury', name: 'Treasury room', minPieces: 3, requiresCredential: [] })
  if (!(await repository.getCurrentSeason())) {
    await repository.saveSeason({ id: 'season-1', name: 'Season 1', startedAt: now, status: 'running' }, { current: true })
  }
  return repository
}

/* ---------- sample data ---------- */
// The example Totems the new frontend shows by default. Labelled as seed so the UI can
// mark them, and only loaded where demo seeding is enabled, never in production.

export async function seedProduct(repository, { now = Date.now() } = {}) {
  await ensurePlatform(repository, { now })
  if (!(await repository.getTotem('417'))) await repository.createTotem({ id: '417', owner: 'ada.near', pieces: 3, items: ['Gold Wings'], origin: 'seed', createdAt: now })
  if (!(await repository.getTotem('1201'))) await repository.createTotem({ id: '1201', owner: 'kofi.near', pieces: 4, items: ['Gold Ear'], origin: 'seed', createdAt: now })
  return repository
}
