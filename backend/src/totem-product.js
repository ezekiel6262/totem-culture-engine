// Domain rules for the product the new frontend describes: Totems that hold pieces,
// Arenas that gate entry, games that report results, and the market, rentals and rooms
// around them. The browser used to own all of this; it now lives here.
//
// State kept by this service is a projection of what the contracts will hold. Every
// mutation returns the onchain call plan it corresponds to, so the UI can show the same
// "What happens onchain" list whether or not the contracts are deployed yet.
import { invariant } from './errors.js'
import { hashRecord } from './canonical.js'
import { MemoryRateLimiter } from './rate-limit.js'

export const PIECE_TOKENS = 25000
export const MAX_PIECES = 4
export const DISPUTE_WINDOW_MS = 24 * 60 * 60 * 1000
export const RENTAL_TERMS = Object.freeze({ race: { label: 'after 1 race', ms: 60 * 60 * 1000 }, week: { label: '7 days', ms: 7 * 24 * 60 * 60 * 1000 } })

const ACCOUNT_PATTERN = /^(?=.{2,64}$)[a-z0-9]+(?:[._-][a-z0-9]+)*$/
export const isAccountId = value => typeof value === 'string' && ACCOUNT_PATTERN.test(value)
export const isTotemId = value => typeof value === 'string' && /^[0-9]{1,8}$/.test(value)

const requireAccount = (value, code, message) => invariant(isAccountId(value), code, message)
const yocto = amount => `${amount} $TOTEM`

/* ---------- piece economics ---------- */

export function holdingsFor(pieces) {
  invariant(Number.isSafeInteger(pieces) && pieces >= 0 && pieces <= MAX_PIECES, 'PIECES_INVALID', `pieces must be between 0 and ${MAX_PIECES}`)
  return pieces * PIECE_TOKENS
}

export function lockPiece(totem) {
  invariant(totem.pieces < MAX_PIECES, 'TOTEM_FULL', `A Totem holds at most ${MAX_PIECES} pieces`)
  return { ...totem, pieces: totem.pieces + 1 }
}

export function withdrawPiece(totem) {
  invariant(totem.pieces > 0, 'TOTEM_EMPTY', 'This Totem has no pieces to take out')
  invariant(!totem.rentedTo, 'TOTEM_RENTED', 'A rented Totem cannot have pieces removed until the rental expires')
  return { ...totem, pieces: totem.pieces - 1 }
}

export function mergeTotems(target, source) {
  invariant(target.id !== source.id, 'MERGE_SAME_TOTEM', 'A Totem cannot be merged into itself')
  invariant(target.owner === source.owner, 'MERGE_OWNER_MISMATCH', 'Both Totems must have the same owner')
  invariant(target.pieces + source.pieces <= MAX_PIECES, 'MERGE_TOO_LARGE', `A merged Totem cannot hold more than ${MAX_PIECES} pieces`)
  invariant(!target.rentedTo && !source.rentedTo, 'TOTEM_RENTED', 'A rented Totem cannot be merged')
  return { ...target, pieces: target.pieces + source.pieces, items: [...new Set([...target.items, ...source.items])] }
}

/* ---------- arena entry ---------- */

export function entryDecision({ arena, pieces }) {
  invariant(arena, 'ARENA_NOT_FOUND', 'Arena not found')
  const minPieces = arena.entryPieces ?? 1
  if (arena.paused) return { allowed: false, reason: 'ARENA_PAUSED', message: 'The operator has paused this Arena', minPieces, pieces }
  if (pieces < minPieces) return { allowed: false, reason: 'PIECES_TOO_FEW', message: `This Arena needs ${minPieces} piece${minPieces === 1 ? '' : 's'}`, minPieces, pieces }
  return { allowed: true, reason: 'ENTRY_GRANTED', message: 'Entry granted', minPieces, pieces }
}

/* ---------- game results ---------- */

export function resultKey({ arenaId, game, player, round }) {
  return hashRecord({ scope: 'totem.result.v1', arenaId, game, player, round })
}

export function settlesAt(reportedAt) { return reportedAt + DISPUTE_WINDOW_MS }

export function validateResult({ game, player, place, coins }) {
  invariant(typeof game === 'string' && game.length > 0, 'GAME_REQUIRED', 'game is required')
  requireAccount(player, 'PLAYER_INVALID', 'player must be a valid NEAR account')
  invariant(Number.isSafeInteger(place) && place >= 1 && place <= 64, 'PLACE_INVALID', 'place must be between 1 and 64')
  invariant(Number.isSafeInteger(coins) && coins >= 0, 'COINS_INVALID', 'coins must be a non-negative integer')
}

export function standingsFrom(results) {
  const byPlayer = new Map()
  for (const result of results) {
    if (result.status !== 'settled') continue
    const row = byPlayer.get(result.player) ?? { player: result.player, coins: 0, wins: 0, played: 0 }
    row.coins += result.coins
    row.played += 1
    if (result.place === 1) row.wins += 1
    byPlayer.set(result.player, row)
  }
  return [...byPlayer.values()].sort((a, b) => b.coins - a.coins || b.wins - a.wins || a.player.localeCompare(b.player))
}

export function bestsFrom(results, player) {
  const bests = {}
  for (const result of results) {
    if (result.player !== player) continue
    const current = bests[result.game]
    if (!current || result.place < current.place || (result.place === current.place && result.coins > current.coins)) {
      bests[result.game] = { place: result.place, coins: result.coins, at: result.reportedAt }
    }
  }
  return bests
}

/* ---------- onchain call plans ---------- */
// These mirror T.calls in frontend/site/p10.html. The UI renders whatever the server returns.

export const callPlans = {
  lockPiece: ({ totemAccount, tokenContract }) => [{ receiver: tokenContract, method: 'ft_transfer_call', args: { receiver_id: totemAccount, amount: yocto(PIECE_TOKENS), msg: '{"action":"add_piece"}' }, deposit: '1 yoctoNEAR' }],
  withdrawPiece: ({ totemAccount }) => [{ receiver: totemAccount, method: 'withdraw_piece', args: { pieces: 1 }, deposit: '1 yoctoNEAR' }],
  split: ({ totemAccount, to }) => [{ receiver: totemAccount, method: 'split_piece', args: { to, pieces: 1 }, deposit: '1 yoctoNEAR' }],
  merge: ({ totemAccount, sourceId }) => [{ receiver: totemAccount, method: 'merge', args: { from: sourceId }, deposit: '1 yoctoNEAR' }],
  rent: ({ rentContract, arenaAccount, totemId, totemAccount, renter, term, price }) => [
    { receiver: rentContract, method: 'rent', args: { token_id: totemId, term }, deposit: `${price} NEAR` },
    { who: `Then ${rentContract} adds a limited key`, receiver: totemAccount, method: 'add_renter_key', args: { renter, allowed_receiver: arenaAccount, methods: ['play', 'enter_room'], expires: RENTAL_TERMS[term]?.label ?? term } }
  ],
  lend: ({ rentContract, totemId, listed }) => [{ receiver: rentContract, method: listed ? 'list' : 'delist', args: { token_id: totemId } }],
  claim: ({ relayerAccount, arenaAccount, handle, prize }) => [
    { who: 'Relayer pays the fee (NEAR meta-transaction)', receiver: relayerAccount, method: 'relay_delegate_action', args: { sender: handle, actions: ['create_account', prize ? 'claim_prize' : 'claim_starter'] } },
    { who: `Executed for ${handle}`, receiver: arenaAccount, method: prize ? 'claim_prize' : 'claim_starter', args: { account: handle } }
  ],
  entry: ({ arenaAccount, account, minPieces }) => [{ who: 'Read only, no fee', receiver: arenaAccount, method: 'check_entry', args: { account, rule: { min_pieces: minPieces } } }],
  result: ({ arenaAccount, game, player, place, coins }) => [
    { who: 'Signed by the game server key', receiver: arenaAccount, method: 'report_result', args: { game, player, place, coins: yocto(coins), proof: 'ed25519:...' } },
    { who: 'After the 24 hour dispute window', receiver: arenaAccount, method: 'settle', args: { game } }
  ],
  operator: ({ arenaAccount, method, args }) => [{ who: 'Signed by the Totem Arena admin key', receiver: arenaAccount, method, args }],
  buy: ({ marketContract, totemId, price }) => [{ receiver: marketContract, method: 'buy', args: { token_id: totemId }, deposit: `${price} NEAR` }],
  list: ({ marketContract, totemId, price }) => [{ receiver: marketContract, method: 'list', args: { token_id: totemId, price: `${price} NEAR` } }],
  launch: ({ factoryAccount, collection, token, size }) => [
    { receiver: factoryAccount, method: 'create_collection', args: { token, collection, tokens_per_piece: yocto(size), pieces: MAX_PIECES }, deposit: 'Launch fee in $TOTEM' },
    { receiver: factoryAccount, method: 'create_arena', args: { collection, status: 'pending_review' } }
  ]
}

/* ---------- service ---------- */

export const CLAIM_LIMITS = Object.freeze({ claimsPerDevice: 1, claimsPerAddress: 3, claimsPerDay: 200 })

export class TotemProductService {
  #chain
  #repository
  #now
  #accounts
  #rateLimiter
  #limits

  constructor({ repository, now = () => Date.now(), accounts = {}, rateLimiter = new MemoryRateLimiter(), limits = {}, chain = {} }) {
    invariant(repository, 'PRODUCT_REPOSITORY_REQUIRED', 'TotemProductService requires a repository')
    this.#repository = repository
    this.#now = now
    this.#rateLimiter = rateLimiter
    this.#limits = { ...CLAIM_LIMITS, ...limits }
    // Reading the chain is optional so that tests and local runs work without a network,
    // but when it is configured the product answers from it rather than from its own notes.
    this.#chain = {
      decimals: 18,
      // The phase cap is the claimable collection, not the collection: minting needs a
      // permit this service issues, so refusing to issue more than this many is what
      // keeps the other 9,000 Totems unmintable.
      eligibilityCap: 1000,
      eligibilityDays: 30,
      branches: ['diamond-holder', 'liquidity-guardian', 'meme-commander', 'community-builder'],
      // One piece, which is the smallest amount that opens a one piece Arena.
      faucetWhole: 25000,
      ...chain
    }
    // Every account hangs off the suffix, so a testnet deployment never shows mainnet names
    // in the call plans the UI displays. A null override falls back to the derived name.
    const suffix = accounts.suffix ?? 'totem.near'
    this.#accounts = {
      token: accounts.token ?? `token.${suffix}`,
      factory: accounts.factory ?? `launch.${suffix}`,
      arena: accounts.arena ?? `arena.${suffix}`,
      market: accounts.market ?? `market.${suffix}`,
      rent: accounts.rent ?? `rent.${suffix}`,
      relayer: accounts.relayer ?? `relayer.${suffix}`,
      suffix
    }
  }

  get accounts() { return { ...this.#accounts } }
  totemAccount(totemId) { return `${totemId}.${this.#accounts.suffix}` }

  async #requireTotem(totemId) {
    const totem = await this.#repository.getTotem(totemId)
    invariant(totem, 'TOTEM_NOT_FOUND', `Totem #${totemId} not found`)
    return totem
  }

  async #requireOwner(totemId, accountId) {
    const totem = await this.#requireTotem(totemId)
    invariant(totem.owner === accountId, 'TOTEM_OWNER_MISMATCH', 'Only the owner of this Totem may do that')
    return totem
  }

  async #ledger(accountId, entry) {
    return this.#repository.appendLedgerEntry({ account: accountId, at: this.#now(), ...entry })
  }

  /* totems */

  async getTotem(totemId) {
    const totem = await this.#requireTotem(totemId)
    return this.#present(totem)
  }

  async listTotems({ owner } = {}) {
    const totems = await this.#repository.listTotems({ owner })
    return totems.map(totem => this.#present(totem))
  }

  #present(totem) {
    return { ...totem, account: this.totemAccount(totem.id), holds: holdingsFor(totem.pieces), full: totem.pieces === MAX_PIECES, source: 'projection' }
  }

  async lockPiece({ totemId, accountId }) {
    const totem = await this.#requireOwner(totemId, accountId)
    const updated = lockPiece(totem)
    await this.#repository.saveTotem(updated)
    await this.#ledger(accountId, { title: 'Locked a piece', amount: `+${PIECE_TOKENS.toLocaleString('en-US')} $TOTEM`, tone: 'g' })
    return { totem: this.#present(updated), calls: callPlans.lockPiece({ totemAccount: this.totemAccount(totemId), tokenContract: this.#accounts.token }) }
  }

  async withdrawPiece({ totemId, accountId }) {
    const totem = await this.#requireOwner(totemId, accountId)
    const updated = withdrawPiece(totem)
    await this.#repository.saveTotem(updated)
    await this.#ledger(accountId, { title: 'Took a piece out', amount: `-${PIECE_TOKENS.toLocaleString('en-US')} $TOTEM`, tone: 'e' })
    return { totem: this.#present(updated), calls: callPlans.withdrawPiece({ totemAccount: this.totemAccount(totemId) }) }
  }

  async splitPiece({ totemId, accountId, to }) {
    requireAccount(to, 'RECIPIENT_INVALID', 'Enter a NEAR account like friend.near')
    invariant(to !== accountId, 'RECIPIENT_SELF', 'Send a piece to someone else')
    const totem = await this.#requireOwner(totemId, accountId)
    const updated = withdrawPiece(totem)
    await this.#repository.saveTotem(updated)
    const gifted = await this.#repository.createTotem({ owner: to, pieces: 1, items: [], origin: `split from #${totemId}`, createdAt: this.#now() })
    await this.#ledger(accountId, { title: `Gifted a piece to ${to}`, amount: `-${PIECE_TOKENS.toLocaleString('en-US')} $TOTEM`, tone: 'e' })
    return { totem: this.#present(updated), gifted: this.#present(gifted), calls: callPlans.split({ totemAccount: this.totemAccount(totemId), to }) }
  }

  async mergeTotems({ targetId, sourceId, accountId }) {
    const target = await this.#requireOwner(targetId, accountId)
    const source = await this.#requireOwner(sourceId, accountId)
    const merged = mergeTotems(target, source)
    await this.#repository.saveTotem(merged)
    await this.#repository.deleteTotem(sourceId)
    await this.#ledger(accountId, { title: `Merged #${sourceId} into #${targetId}`, amount: `${holdingsFor(merged.pieces).toLocaleString('en-US')} $TOTEM inside`, tone: 'g' })
    return { totem: this.#present(merged), calls: callPlans.merge({ totemAccount: this.totemAccount(targetId), sourceId }) }
  }

  /* arenas */

  async listArenas() { return this.#repository.listArenas() }

  async getArena(arenaId) {
    const arena = await this.#repository.getArena(arenaId)
    invariant(arena, 'ARENA_NOT_FOUND', `Arena ${arenaId} not found`)
    return arena
  }

  async checkEntry({ arenaId, accountId }) {
    requireAccount(accountId, 'ACCOUNT_INVALID', 'accountId must be a valid NEAR account')
    const arena = await this.getArena(arenaId)
    const totems = await this.#repository.listTotems({ owner: accountId })
    const rentals = await this.#repository.listRentals({ renter: accountId, activeAt: this.#now() })
    const rentedPieces = await Promise.all(rentals.map(async rental => (await this.#repository.getTotem(rental.totemId))?.pieces ?? 0))
    // Entry used to rest entirely on records this service wrote itself. Real $TOTEM held on
    // chain now counts too, and the answer says which of the two let the account in, so a
    // holder is never told they lack pieces they can prove they have.
    const onChain = await this.onChainHoldings(accountId)
    const chainPieces = onChain.source === 'chain' ? onChain.pieces : 0
    const storedPieces = Math.max(0, ...totems.map(totem => totem.pieces), ...rentedPieces)
    const pieces = Math.max(chainPieces, storedPieces)
    const decision = entryDecision({ arena, pieces })
    const qualifiedBy = !decision.allowed ? null : chainPieces >= decision.minPieces ? 'chain' : 'platform'
    return { ...decision, arenaId, accountId, onChain, chainPieces, storedPieces, qualifiedBy, calls: callPlans.entry({ arenaAccount: this.#accounts.arena, account: accountId, minPieces: decision.minPieces }) }
  }

  async setArenaPaused({ arenaId, accountId, paused }) {
    const arena = await this.getArena(arenaId)
    invariant(arena.operator === accountId, 'ARENA_OPERATOR_MISMATCH', 'Only the Arena operator may do that')
    const updated = { ...arena, paused: Boolean(paused) }
    await this.#repository.saveArena(updated)
    return { arena: updated, calls: callPlans.operator({ arenaAccount: this.#accounts.arena, method: paused ? 'pause_arena' : 'resume_arena', args: { arena: arenaId } }) }
  }

  /* results and season */

  async reportResult({ arenaId, game, player, place, coins, round = 1, signedBy }) {
    validateResult({ game, player, place, coins })
    const arena = await this.getArena(arenaId)
    invariant(!arena.paused, 'ARENA_PAUSED', 'The operator has paused this Arena')
    invariant(signedBy && signedBy === arena.resultSigner, 'RESULT_SIGNER_INVALID', 'Results must be signed by the game server key for this Arena')
    const reportedAt = this.#now()
    const result = { key: resultKey({ arenaId, game, player, round }), arenaId, game, player, place, coins, round, reportedAt, settlesAt: settlesAt(reportedAt), status: 'reported' }
    const { created, result: stored } = await this.#repository.createResultOnce(result)
    if (created) await this.#ledger(player, { title: `${game} result`, amount: `+${coins.toLocaleString('en-US')} coins`, tone: 'g' })
    return { result: stored, replayed: !created, calls: callPlans.result({ arenaAccount: this.#accounts.arena, game, player, place, coins }) }
  }

  async settleResults({ arenaId, game }) {
    const now = this.#now()
    const due = (await this.#repository.listResults({ arenaId, game, status: 'reported' })).filter(result => result.settlesAt <= now)
    const settled = []
    for (const result of due) settled.push(await this.#repository.updateResultStatus({ key: result.key, expectedStatus: 'reported', status: 'settled', settledAt: now }))
    return { settled: settled.filter(Boolean), pending: due.length - settled.filter(Boolean).length, disputeWindowMs: DISPUTE_WINDOW_MS }
  }

  async bests({ accountId }) {
    requireAccount(accountId, 'ACCOUNT_INVALID', 'accountId must be a valid NEAR account')
    return bestsFrom(await this.#repository.listResults({ player: accountId }), accountId)
  }

  async currentSeason() {
    const season = await this.#repository.getCurrentSeason()
    invariant(season, 'SEASON_NOT_FOUND', 'No season is running')
    return season
  }

  async standings({ limit = 50 } = {}) {
    const season = await this.currentSeason()
    const results = await this.#repository.listResults({ seasonId: season.id })
    return { season, standings: standingsFrom(results).slice(0, limit) }
  }

  /* market */

  async listListings() { return this.#repository.listListings({ status: 'open' }) }

  async createListing({ totemId, ownerId, price }) {
    invariant(Number.isFinite(Number(price)) && Number(price) > 0, 'PRICE_INVALID', 'price must be a positive number of NEAR')
    const totem = await this.#requireOwner(totemId, ownerId)
    invariant(!totem.rentedTo, 'TOTEM_RENTED', 'A rented Totem cannot be listed for sale')
    const listing = await this.#repository.createListing({ totemId, seller: ownerId, price: String(price), pieces: totem.pieces, status: 'open', createdAt: this.#now() })
    return { listing, calls: callPlans.list({ marketContract: this.#accounts.market, totemId, price }) }
  }

  async buyListing({ listingId, buyerId }) {
    requireAccount(buyerId, 'BUYER_INVALID', 'buyerId must be a valid NEAR account')
    const listing = await this.#repository.getListing(listingId)
    invariant(listing && listing.status === 'open', 'LISTING_NOT_OPEN', 'That listing is no longer open')
    invariant(listing.seller !== buyerId, 'BUYER_IS_SELLER', 'You already own this Totem')
    const totem = await this.#requireTotem(listing.totemId)
    // The sale carries everything inside the Totem: pieces, items and credentials.
    await this.#repository.saveTotem({ ...totem, owner: buyerId })
    const closed = await this.#repository.updateListingStatus({ id: listingId, expectedStatus: 'open', status: 'sold', buyer: buyerId, soldAt: this.#now() })
    await this.#ledger(buyerId, { title: `Bought Totem #${listing.totemId}`, amount: `-${listing.price} NEAR`, tone: 'e' })
    await this.#ledger(listing.seller, { title: `Sold Totem #${listing.totemId}`, amount: `+${listing.price} NEAR`, tone: 'g' })
    return { listing: closed, totem: this.#present({ ...totem, owner: buyerId }), calls: callPlans.buy({ marketContract: this.#accounts.market, totemId: listing.totemId, price: listing.price }) }
  }

  /* rentals */

  async listRentals({ accountId }) { return this.#repository.listRentals({ renter: accountId, activeAt: this.#now() }) }

  async setLending({ totemId, ownerId, listed }) {
    const totem = await this.#requireOwner(totemId, ownerId)
    invariant(!totem.rentedTo, 'TOTEM_RENTED', 'This Totem is already rented out')
    await this.#repository.saveTotem({ ...totem, lending: Boolean(listed) })
    return { totemId, lending: Boolean(listed), calls: callPlans.lend({ rentContract: this.#accounts.rent, totemId, listed: Boolean(listed) }) }
  }

  async rentTotem({ totemId, renterId, term, price }) {
    requireAccount(renterId, 'RENTER_INVALID', 'renterId must be a valid NEAR account')
    invariant(RENTAL_TERMS[term], 'TERM_INVALID', `term must be one of ${Object.keys(RENTAL_TERMS).join(', ')}`)
    const totem = await this.#requireTotem(totemId)
    invariant(totem.lending, 'TOTEM_NOT_LENT', 'This Totem is not listed for rent')
    invariant(!totem.rentedTo, 'TOTEM_RENTED', 'This Totem is already rented out')
    invariant(totem.owner !== renterId, 'RENTER_IS_OWNER', 'You already own this Totem')
    const startedAt = this.#now(), expiresAt = startedAt + RENTAL_TERMS[term].ms
    const rental = await this.#repository.createRental({ totemId, renter: renterId, owner: totem.owner, term, price: String(price ?? '0'), startedAt, expiresAt, methods: ['play', 'enter_room'] })
    await this.#repository.saveTotem({ ...totem, rentedTo: renterId, rentedUntil: expiresAt })
    await this.#ledger(renterId, { title: `Rented Totem #${totemId}`, amount: `-${rental.price} NEAR`, tone: 'e' })
    return { rental, calls: callPlans.rent({ rentContract: this.#accounts.rent, arenaAccount: this.#accounts.arena, totemId, totemAccount: this.totemAccount(totemId), renter: renterId, term, price: rental.price }) }
  }

  /* rooms */

  async roomAccess({ roomId, accountId }) {
    requireAccount(accountId, 'ACCOUNT_INVALID', 'accountId must be a valid NEAR account')
    const room = await this.#repository.getRoom(roomId)
    invariant(room, 'ROOM_NOT_FOUND', `Room ${roomId} not found`)
    const totems = await this.#repository.listTotems({ owner: accountId })
    const pieces = Math.max(0, ...totems.map(totem => totem.pieces))
    const credentials = new Set(totems.flatMap(totem => totem.items ?? []))
    const missingCredential = (room.requiresCredential ?? []).find(name => !credentials.has(name))
    if (pieces < (room.minPieces ?? 1)) return { allowed: false, reason: 'PIECES_TOO_FEW', message: `This room needs ${room.minPieces} piece${room.minPieces === 1 ? '' : 's'}`, roomId, accountId }
    if (missingCredential) return { allowed: false, reason: 'CREDENTIAL_MISSING', message: `This room needs ${missingCredential}`, roomId, accountId }
    return { allowed: true, reason: 'ACCESS_GRANTED', message: 'Door open', roomId, accountId }
  }

  /* claims */

  // Claiming a first Totem has to stay open, because the claimer has no account yet.
  // The limits below are what the rules page promises: one per person per day, checked by
  // device and address, under a daily ceiling for the whole Arena.
  async #guardClaim({ ip, deviceId }) {
    const now = this.#now()
    // Addresses and device ids are identifiers for a person, so only a hash is stored.
    // It limits just as well, and the table never holds the address itself.
    const anonymous = (scope, value) => hashRecord({ scope: `totem.rate.${scope}.v1`, value }).slice(0, 32)

    const checks = [{ key: 'claim#all', limit: this.#limits.claimsPerDay }]
    if (deviceId) checks.push({ key: `claim#device#${anonymous('device', deviceId)}`, limit: this.#limits.claimsPerDevice })
    if (ip) checks.push({ key: `claim#ip#${anonymous('ip', ip)}`, limit: this.#limits.claimsPerAddress })

    for (const check of checks) {
      const result = await this.#rateLimiter.hit({ ...check, now })
      if (result.allowed) continue
      const scope = check.key.startsWith('claim#device') ? 'device' : check.key.startsWith('claim#ip') ? 'address' : 'Arena'
      invariant(false, 'CLAIM_RATE_LIMITED', scope === 'Arena'
        ? 'The free starters for today are gone. Try again tomorrow.'
        : `That ${scope} has already claimed a starter today. Try again tomorrow.`, { scope, resetAt: result.resetAt })
    }
  }

  /* accounts */

  // A NEAR account becomes a Totem account by signing in. Creating the NEAR account
  // itself is the wallet's job, so there is nothing to invent here.
  async registerAccount({ accountId, publicKey = null }) {
    requireAccount(accountId, 'ACCOUNT_INVALID', 'accountId must be a valid NEAR account')
    const existing = await this.#repository.getAccount(accountId)
    if (existing) return { account: existing, created: false }
    const account = await this.#repository.saveAccount({ id: accountId, registeredAt: this.#now(), publicKey, source: 'near-wallet' })
    await this.#ledger(accountId, { title: 'Registered with Totem', amount: 'NEAR wallet', tone: 'g' })
    return { account, created: true }
  }

  // DynamoDB was the only source of truth here, so an account could hold tokens and a Totem
  // on chain and still be told it had nothing. This reports what the chain says, with the
  // block it was read at, and distinguishes "zero" from "could not read".
  async onChainHoldings(accountId) {
    const { rpc, tokenContractId, nftContractId, decimals } = this.#chain
    if (!rpc || !tokenContractId) return { source: 'unavailable', reason: 'CHAIN_NOT_CONFIGURED' }
    try {
      const balance = await rpc.ftBalanceAtFinalBlock({ contractId: tokenContractId, accountId })
      const whole = BigInt(balance.balance) / 10n ** BigInt(decimals)
      const possible = whole / BigInt(PIECE_TOKENS)
      let totemTokenId = null
      if (nftContractId) {
        try {
          totemTokenId = await rpc.callFunctionFinal({ contractId: nftContractId, methodName: 'get_token_for_owner', args: { account_id: accountId } })
        } catch (error) { totemTokenId = null }
      }
      return {
        source: 'chain',
        tokenContractId,
        nftContractId: nftContractId ?? null,
        balance: balance.balance,
        balanceWhole: whole.toString(),
        // What the balance is worth in pieces, capped at a full Totem.
        pieces: Number(possible > BigInt(MAX_PIECES) ? BigInt(MAX_PIECES) : possible),
        piecesWorth: possible.toString(),
        totemTokenId: totemTokenId ?? null,
        blockHeight: balance.blockHeight,
        observedAt: balance.observedAt
      }
    } catch (error) {
      return { source: 'unavailable', reason: error?.code ?? 'CHAIN_READ_FAILED' }
    }
  }

  async getAccount({ accountId }) {
    requireAccount(accountId, 'ACCOUNT_INVALID', 'accountId must be a valid NEAR account')
    const account = await this.#repository.getAccount(accountId)
    const totems = await this.listTotems({ owner: accountId })
    const onChain = await this.onChainHoldings(accountId)
    const arena = await this.#repository.getArena('totem').catch(() => null)
    const operates = Boolean(arena && arena.operator === accountId)
    return { account, registered: Boolean(account), totems, onChain, operator: operates }
  }

  /* ---------- claims that reach the chain ---------- */

  // The platform grants the permit; the holder mints from their own wallet. That split is
  // deliberate. Totem never holds a user's key, so the Totem that appears in their wallet
  // is the result of their own signature, and this service cannot mint on their behalf.
  async claimEligibility({ accountId, branch = 'community-builder' }) {
    requireAccount(accountId, 'ACCOUNT_INVALID', 'Connect a NEAR wallet to claim a Totem')
    const { signer, nftContractId, eligibilityCap, eligibilityDays, branches } = this.#chain
    invariant(signer && nftContractId, 'CLAIMS_NOT_CONFIGURED', 'On-chain claiming is not configured on this deployment')
    invariant(branches.includes(branch), 'BRANCH_INVALID', `branch must be one of: ${branches.join(', ')}`)

    const existing = await this.#repository.getGrant('eligibility', accountId)
    if (existing) return { ...existing, alreadyGranted: true, mint: this.#mintPlan() }

    // The counter is handed out atomically, so two requests racing cannot both take the
    // last slot of the phase.
    const number = await this.#repository.nextGrantNumber('eligibility')
    invariant(number <= eligibilityCap, 'PHASE_SUPPLY_EXHAUSTED', `All ${eligibilityCap} Totems in this phase have been claimed`)

    const expiresAtMs = this.#now() + eligibilityDays * 86_400_000
    const { transactionHash } = await signer.call({
      receiverId: nftContractId,
      methodName: 'approve_eligibility',
      args: { account_id: accountId, branch, expires_at_ms: expiresAtMs }
    })
    const grant = { kind: 'eligibility', accountId, branch, number, expiresAtMs, transactionHash, at: this.#now() }
    await this.#repository.createGrant(grant)
    await this.registerAccount({ accountId })
    await this.#ledger(accountId, { title: `Eligible to mint Totem ${number} of ${eligibilityCap}`, amount: branch, tone: 'g' })
    return { ...grant, alreadyGranted: false, remaining: Math.max(0, eligibilityCap - number), mint: this.#mintPlan() }
  }

  // Minting is the holder's own transaction, so what comes back is what to sign, not a
  // promise that something was done for them.
  #mintPlan() {
    return { receiver: this.#chain.nftContractId, method: 'mint', args: {}, deposit: '0.1 NEAR', note: 'Signed by you. The unused part of the deposit is refunded by the contract.' }
  }

  // A faucet exists so a tester can reach an Arena without being sent to find tokens first.
  // It sends one piece, which is the smallest amount a one piece Arena will accept.
  async claimTokens({ accountId, ip = null, deviceId = null }) {
    requireAccount(accountId, 'ACCOUNT_INVALID', 'Connect a NEAR wallet to claim $TOTEM')
    const { faucetSigner, tokenContractId, faucetWhole, decimals } = this.#chain
    invariant(faucetSigner && tokenContractId, 'FAUCET_NOT_CONFIGURED', 'The $TOTEM faucet is not configured on this deployment')

    const existing = await this.#repository.getGrant('faucet', accountId)
    if (existing) return { ...existing, alreadyGranted: true }

    await this.#guardClaim({ ip, deviceId })
    const amount = (BigInt(faucetWhole) * 10n ** BigInt(decimals)).toString()

    // NEP-141 refuses a transfer to an account that has not paid for its own storage, so the
    // faucet registers the receiver first. Registering an account twice is harmless.
    await faucetSigner.call({
      receiverId: tokenContractId,
      methodName: 'storage_deposit',
      args: { account_id: accountId, registration_only: true },
      deposit: 1_250_000_000_000_000_000_000n
    })
    const { transactionHash } = await faucetSigner.call({
      receiverId: tokenContractId,
      methodName: 'ft_transfer',
      args: { receiver_id: accountId, amount, memo: 'Totem faucet' },
      deposit: 1n
    })
    const grant = { kind: 'faucet', accountId, amount, whole: faucetWhole, transactionHash, at: this.#now() }
    await this.#repository.createGrant(grant)
    await this.registerAccount({ accountId })
    await this.#ledger(accountId, { title: 'Claimed $TOTEM from the faucet', amount: `+${Number(faucetWhole).toLocaleString('en-US')} $TOTEM`, tone: 'g' })
    return { ...grant, alreadyGranted: false }
  }

  async claimStarter({ handle, ip = null, deviceId = null }) {
    requireAccount(handle, 'HANDLE_INVALID', 'Connect a NEAR wallet to claim a starter')
    const existing = await this.#repository.getClaim(handle)
    invariant(!existing, 'CLAIM_ALREADY_USED', 'This account has already claimed a starter Totem')
    await this.#guardClaim({ ip, deviceId })
    await this.registerAccount({ accountId: handle })
    const totem = await this.#repository.createTotem({ owner: handle, pieces: 1, items: [], origin: 'gasless starter', createdAt: this.#now() })
    await this.#repository.createClaim({ handle, totemId: totem.id, kind: 'starter', at: this.#now() })
    // This writes a platform record and moves no tokens, so it must not render as a
    // transfer. The $TOTEM amount that used to be here was a receipt for something that
    // never happened on chain.
    await this.#ledger(handle, { title: 'Claimed a starter Totem', amount: 'platform record, no transfer', tone: 'g' })
    return { totem: this.#present(totem), gasless: true, calls: callPlans.claim({ relayerAccount: this.#accounts.relayer, arenaAccount: this.#accounts.arena, handle, prize: false }) }
  }

  async claimPrize({ handle, prizeId }) {
    requireAccount(handle, 'HANDLE_INVALID', 'Pick a name like yourname.totem.near')
    const prize = await this.#repository.getPrize(prizeId)
    invariant(prize, 'PRIZE_NOT_FOUND', 'That prize was not found')
    invariant(!prize.claimedBy, 'PRIZE_ALREADY_CLAIMED', 'That prize has already been claimed')
    invariant(prize.winner === handle, 'PRIZE_WINNER_MISMATCH', 'That prize belongs to another player')
    const totem = await this.#repository.createTotem({ owner: handle, pieces: prize.pieces, items: prize.items ?? [], origin: `prize from ${prize.game}`, createdAt: this.#now() })
    await this.#repository.updatePrize({ id: prizeId, claimedBy: handle, totemId: totem.id, claimedAt: this.#now() })
    await this.#ledger(handle, { title: `${prize.game} prize`, amount: `+${holdingsFor(prize.pieces).toLocaleString('en-US')} $TOTEM`, tone: 'g' })
    return { totem: this.#present(totem), gasless: true, calls: callPlans.claim({ relayerAccount: this.#accounts.relayer, arenaAccount: this.#accounts.arena, handle, prize: true }) }
  }

  /* launches */

  async createLaunch({ creatorId, collection, token, size }) {
    requireAccount(creatorId, 'CREATOR_INVALID', 'creatorId must be a valid NEAR account')
    invariant(typeof collection === 'string' && collection.trim().length >= 2, 'COLLECTION_REQUIRED', 'Give the collection a name')
    invariant(typeof token === 'string' && token.trim().length >= 2, 'TOKEN_REQUIRED', 'Name the token the NFT will hold')
    const pieceSize = Number(size ?? PIECE_TOKENS)
    invariant(Number.isSafeInteger(pieceSize) && pieceSize > 0, 'SIZE_INVALID', 'Piece size must be a positive whole number of tokens')
    const launch = await this.#repository.createLaunch({ creator: creatorId, collection: collection.trim(), token: token.trim(), size: pieceSize, status: 'pending_review', createdAt: this.#now() })
    return { launch, calls: callPlans.launch({ factoryAccount: this.#accounts.factory, collection: launch.collection, token: launch.token, size: launch.size }) }
  }

  async listLaunches({ creatorId } = {}) { return this.#repository.listLaunches({ creator: creatorId }) }

  async reviewLaunch({ launchId, reviewerId, decision, note = '' }) {
    invariant(decision === 'approved' || decision === 'rejected', 'DECISION_INVALID', 'decision must be approved or rejected')
    const reviewed = await this.#repository.updateLaunchStatus({ id: launchId, expectedStatus: 'pending_review', status: decision, reviewedBy: reviewerId, reviewedAt: this.#now(), note })
    invariant(reviewed, 'LAUNCH_NOT_PENDING', 'That launch is not waiting for review')
    return { launch: reviewed }
  }

  /* ledger */

  async ledger({ accountId, limit = 20 }) {
    requireAccount(accountId, 'ACCOUNT_INVALID', 'accountId must be a valid NEAR account')
    return this.#repository.listLedger({ account: accountId, limit })
  }
}
