import test from 'node:test'
import assert from 'node:assert/strict'
import { createProductRouter, DISPUTE_WINDOW_MS, MemoryProductRepository, PIECE_TOKENS, seedProduct, TotemProductService } from '../src/index.js'

let clock = 1_700_000_000_000
const now = () => clock

async function build() {
  clock = 1_700_000_000_000
  const repository = new MemoryProductRepository()
  await seedProduct(repository, { now: clock })
  return { repository, product: new TotemProductService({ repository, now }) }
}

const code = async promise => {
  try { await promise; return null } catch (error) { return error.code }
}

/* ---------- pieces ---------- */

test('a piece is 25,000 tokens and a Totem holds at most four', async () => {
  const { product } = await build()
  const first = await product.lockPiece({ totemId: '417', accountId: 'ada.near' })
  assert.equal(first.totem.pieces, 4)
  assert.equal(first.totem.holds, 4 * PIECE_TOKENS)
  assert.equal(first.totem.full, true)
  assert.equal(await code(product.lockPiece({ totemId: '417', accountId: 'ada.near' })), 'TOTEM_FULL')
})

test('locking a piece returns the ft_transfer_call plan the UI shows', async () => {
  const { product } = await build()
  const { calls } = await product.lockPiece({ totemId: '417', accountId: 'ada.near' })
  assert.equal(calls[0].method, 'ft_transfer_call')
  assert.equal(calls[0].args.receiver_id, '417.totem.near')
  assert.match(calls[0].args.amount, /25000/)
})

test('only the owner may move pieces', async () => {
  const { product } = await build()
  assert.equal(await code(product.lockPiece({ totemId: '417', accountId: 'kofi.near' })), 'TOTEM_OWNER_MISMATCH')
})

test('withdrawing takes a piece off and an empty Totem cannot be drained', async () => {
  const { product } = await build()
  for (let i = 0; i < 3; i++) await product.withdrawPiece({ totemId: '417', accountId: 'ada.near' })
  assert.equal((await product.getTotem('417')).pieces, 0)
  assert.equal(await code(product.withdrawPiece({ totemId: '417', accountId: 'ada.near' })), 'TOTEM_EMPTY')
})

test('splitting gifts a one piece Totem to another account', async () => {
  const { product } = await build()
  const { totem, gifted } = await product.splitPiece({ totemId: '417', accountId: 'ada.near', to: 'friend.near' })
  assert.equal(totem.pieces, 2)
  assert.equal(gifted.pieces, 1)
  assert.equal(gifted.owner, 'friend.near')
  assert.equal(await code(product.splitPiece({ totemId: '417', accountId: 'ada.near', to: 'NotAnAccount' })), 'RECIPIENT_INVALID')
})

test('merging cannot exceed four pieces or cross owners', async () => {
  const { product, repository } = await build()
  await repository.createTotem({ id: '900', owner: 'ada.near', pieces: 2, items: ['Shell'] })
  assert.equal(await code(product.mergeTotems({ targetId: '417', sourceId: '900', accountId: 'ada.near' })), 'MERGE_TOO_LARGE')
  await product.withdrawPiece({ totemId: '417', accountId: 'ada.near' })
  const merged = await product.mergeTotems({ targetId: '417', sourceId: '900', accountId: 'ada.near' })
  assert.equal(merged.totem.pieces, 4)
  assert.ok(merged.totem.items.includes('Shell'))
  assert.equal(await product.getTotem('900').catch(error => error.code), 'TOTEM_NOT_FOUND')
})

/* ---------- arena entry ---------- */

test('entry needs the minimum pieces and an Arena that is not paused', async () => {
  const { product, repository } = await build()
  const granted = await product.checkEntry({ arenaId: 'totem', accountId: 'ada.near' })
  assert.equal(granted.allowed, true)
  assert.equal(granted.calls[0].method, 'check_entry')

  const empty = await product.checkEntry({ arenaId: 'totem', accountId: 'nobody.near' })
  assert.equal(empty.allowed, false)
  assert.equal(empty.reason, 'PIECES_TOO_FEW')

  await repository.saveArena({ ...(await repository.getArena('totem')), paused: true })
  const paused = await product.checkEntry({ arenaId: 'totem', accountId: 'ada.near' })
  assert.equal(paused.allowed, false)
  assert.equal(paused.reason, 'ARENA_PAUSED')
})

test('only the operator may pause an Arena', async () => {
  const { product } = await build()
  assert.equal(await code(product.setArenaPaused({ arenaId: 'totem', accountId: 'kofi.near', paused: true })), 'ARENA_OPERATOR_MISMATCH')
  const paused = await product.setArenaPaused({ arenaId: 'totem', accountId: 'ada.near', paused: true })
  assert.equal(paused.arena.paused, true)
  assert.equal(paused.calls[0].method, 'pause_arena')
})

/* ---------- results ---------- */

const report = (product, overrides = {}) => product.reportResult({ arenaId: 'totem', game: 'kart', player: 'ada.near', place: 1, coins: 120, signedBy: 'games.totem.near', ...overrides })

test('results must be signed by the Arena game server key', async () => {
  const { product } = await build()
  assert.equal(await code(report(product, { signedBy: 'someone.near' })), 'RESULT_SIGNER_INVALID')
  assert.equal(await code(report(product, { signedBy: undefined })), 'RESULT_SIGNER_INVALID')
})

test('a repeated result for the same round is not counted twice', async () => {
  const { product } = await build()
  const first = await report(product)
  const second = await report(product)
  assert.equal(first.replayed, false)
  assert.equal(second.replayed, true)
  assert.equal(second.result.key, first.result.key)
})

test('results settle only after the 24 hour dispute window', async () => {
  const { product } = await build()
  await report(product)
  const early = await product.settleResults({ arenaId: 'totem', game: 'kart' })
  assert.equal(early.settled.length, 0)

  clock += DISPUTE_WINDOW_MS + 1
  const late = await product.settleResults({ arenaId: 'totem', game: 'kart' })
  assert.equal(late.settled.length, 1)
  assert.equal(late.settled[0].status, 'settled')
})

test('standings count settled results only, best coins first', async () => {
  const { product } = await build()
  await report(product, { player: 'ada.near', coins: 120, place: 1 })
  await report(product, { player: 'kofi.near', coins: 300, place: 1, game: 'paint' })
  clock += DISPUTE_WINDOW_MS + 1
  await product.settleResults({ arenaId: 'totem', game: 'kart' })

  const { standings } = await product.standings()
  assert.equal(standings.length, 1)
  assert.equal(standings[0].player, 'ada.near')

  await product.settleResults({ arenaId: 'totem', game: 'paint' })
  const after = await product.standings()
  assert.deepEqual(after.standings.map(row => row.player), ['kofi.near', 'ada.near'])
})

test('a player best keeps the lowest place', async () => {
  const { product } = await build()
  await report(product, { place: 4, coins: 10, round: 1 })
  await report(product, { place: 2, coins: 50, round: 2 })
  const bests = await product.bests({ accountId: 'ada.near' })
  assert.equal(bests.kart.place, 2)
})

/* ---------- market ---------- */

test('buying a Totem transfers it with everything inside', async () => {
  const { product } = await build()
  const { listing } = await product.createListing({ totemId: '417', ownerId: 'ada.near', price: '12' })
  const bought = await product.buyListing({ listingId: listing.id, buyerId: 'kofi.near' })
  assert.equal(bought.totem.owner, 'kofi.near')
  assert.equal(bought.totem.pieces, 3)
  assert.ok(bought.totem.items.includes('Gold Wings'))
  assert.equal(bought.listing.status, 'sold')
  assert.equal(await code(product.buyListing({ listingId: listing.id, buyerId: 'other.near' })), 'LISTING_NOT_OPEN')
})

test('a seller cannot buy their own listing and prices must be positive', async () => {
  const { product } = await build()
  assert.equal(await code(product.createListing({ totemId: '417', ownerId: 'ada.near', price: '0' })), 'PRICE_INVALID')
  const { listing } = await product.createListing({ totemId: '417', ownerId: 'ada.near', price: '5' })
  assert.equal(await code(product.buyListing({ listingId: listing.id, buyerId: 'ada.near' })), 'BUYER_IS_SELLER')
})

/* ---------- rentals ---------- */

test('renting needs a listed Totem, a known term, and locks withdrawals', async () => {
  const { product } = await build()
  assert.equal(await code(product.rentTotem({ totemId: '417', renterId: 'kofi.near', term: 'week' })), 'TOTEM_NOT_LENT')
  await product.setLending({ totemId: '417', ownerId: 'ada.near', listed: true })
  assert.equal(await code(product.rentTotem({ totemId: '417', renterId: 'kofi.near', term: 'forever' })), 'TERM_INVALID')

  const { rental, calls } = await product.rentTotem({ totemId: '417', renterId: 'kofi.near', term: 'week', price: '3' })
  assert.equal(rental.renter, 'kofi.near')
  assert.deepEqual(calls[1].args.methods, ['play', 'enter_room'])
  assert.equal(calls[1].args.expires, '7 days')
  assert.equal(await code(product.withdrawPiece({ totemId: '417', accountId: 'ada.near' })), 'TOTEM_RENTED')
})

test('a rented Totem grants its renter Arena entry', async () => {
  const { product } = await build()
  await product.setLending({ totemId: '417', ownerId: 'ada.near', listed: true })
  await product.rentTotem({ totemId: '417', renterId: 'newbie.near', term: 'week', price: '3' })
  const entry = await product.checkEntry({ arenaId: 'totem', accountId: 'newbie.near' })
  assert.equal(entry.allowed, true)
})

/* ---------- rooms ---------- */

test('rooms check pieces and credentials', async () => {
  const { product, repository } = await build()
  assert.equal((await product.roomAccess({ roomId: 'holders', accountId: 'ada.near' })).allowed, true)
  assert.equal((await product.roomAccess({ roomId: 'holders', accountId: 'nobody.near' })).reason, 'PIECES_TOO_FEW')

  await repository.saveRoom({ id: 'gold', name: 'Gold room', minPieces: 1, requiresCredential: ['Gold Ear'] })
  assert.equal((await product.roomAccess({ roomId: 'gold', accountId: 'ada.near' })).reason, 'CREDENTIAL_MISSING')
  assert.equal((await product.roomAccess({ roomId: 'gold', accountId: 'kofi.near' })).allowed, true)
})

/* ---------- claims ---------- */

test('a gasless starter can be claimed once per name', async () => {
  const { product } = await build()
  const claimed = await product.claimStarter({ handle: 'newcomer.near' })
  assert.equal(claimed.totem.pieces, 1)
  assert.equal(claimed.gasless, true)
  assert.equal(claimed.calls[0].method, 'relay_delegate_action')
  assert.equal(await code(product.claimStarter({ handle: 'newcomer.near' })), 'CLAIM_ALREADY_USED')
})

test('a prize can only be claimed by its winner, once', async () => {
  const { product, repository } = await build()
  const prize = await repository.createPrize({ winner: 'ada.near', pieces: 2, game: 'Meme Clash', items: ['Clash Badge'] })
  assert.equal(await code(product.claimPrize({ handle: 'kofi.near', prizeId: prize.id })), 'PRIZE_WINNER_MISMATCH')
  const won = await product.claimPrize({ handle: 'ada.near', prizeId: prize.id })
  assert.equal(won.totem.pieces, 2)
  assert.equal(await code(product.claimPrize({ handle: 'ada.near', prizeId: prize.id })), 'PRIZE_ALREADY_CLAIMED')
})

/* ---------- launches ---------- */

test('a launch waits for review before it opens', async () => {
  const { product } = await build()
  const { launch, calls } = await product.createLaunch({ creatorId: 'ada.near', collection: 'Doggo', token: '$DOGGO', size: 10000 })
  assert.equal(launch.status, 'pending_review')
  assert.equal(calls[0].method, 'create_collection')
  assert.equal(calls[1].args.status, 'pending_review')

  const approved = await product.reviewLaunch({ launchId: launch.id, reviewerId: 'ops.near', decision: 'approved' })
  assert.equal(approved.launch.status, 'approved')
  assert.equal(await code(product.reviewLaunch({ launchId: launch.id, reviewerId: 'ops.near', decision: 'approved' })), 'LAUNCH_NOT_PENDING')
})

/* ---------- ledger ---------- */

test('the ledger records what the Totem account screen shows', async () => {
  const { product } = await build()
  await product.lockPiece({ totemId: '417', accountId: 'ada.near' })
  const ledger = await product.ledger({ accountId: 'ada.near' })
  assert.equal(ledger[0].title, 'Locked a piece')
  assert.equal(ledger[0].tone, 'g')
})

/* ---------- router ---------- */

const authStub = { authenticate: async token => (token === 'ada' ? { accountId: 'ada.near' } : null) }
const call = (router, method, path, { body, token } = {}) => router.handle(new Request('http://localhost' + path, {
  method,
  headers: token ? { authorization: `Bearer ${token}` } : {},
  body: body === undefined ? undefined : JSON.stringify(body)
}))

test('reads are public and writes require the acting account', async () => {
  const { product } = await build()
  const router = createProductRouter({ product, auth: authStub })

  const open = await call(router, 'GET', '/api/v1/totems/417')
  assert.equal(open.status, 200)
  assert.equal((await open.json()).data.totem.pieces, 3)

  const denied = await call(router, 'POST', '/api/v1/totems/417/pieces')
  assert.equal(denied.status, 400)
  assert.equal((await denied.json()).error.code, 'AUTH_REQUIRED')

  const allowed = await call(router, 'POST', '/api/v1/totems/417/pieces', { token: 'ada' })
  assert.equal(allowed.status, 200)
  assert.equal((await allowed.json()).data.totem.pieces, 4)
})

test('a body free DELETE is accepted', async () => {
  const { product } = await build()
  const router = createProductRouter({ product, auth: authStub })
  const response = await call(router, 'DELETE', '/api/v1/totems/417/pieces', { token: 'ada' })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).data.totem.pieces, 2)
})

test('unknown product routes do not match', async () => {
  const { product } = await build()
  const router = createProductRouter({ product, auth: authStub })
  assert.equal(router.matches('GET', '/api/v1/totems/417'), true)
  assert.equal(router.matches('GET', '/api/v1/nothing'), false)
})
