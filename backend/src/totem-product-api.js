// HTTP surface for the product the new frontend drives. Reads are public, writes require
// a wallet session and must act as the authenticated account.
import { DomainError, invariant } from './errors.js'

// Same response envelope as http.js, but tolerant of requests that carry no body
// (DELETE /pieces and the public reads both arrive without one).
const productHandler = action => async request => {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID()
  try {
    let body = null
    if (request.method !== 'GET') {
      const raw = await request.text()
      if (raw) {
        try { body = JSON.parse(raw) } catch { throw new DomainError('BODY_INVALID', 'Request body must be JSON') }
      }
    }
    const data = await action({ request, body, requestId })
    return Response.json({ requestId, data }, { status: 200, headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    const known = error instanceof DomainError
    console.error(JSON.stringify({ requestId, event: 'request_failed', code: known ? error.code : 'INTERNAL_ERROR' }))
    return Response.json({ requestId, error: { code: known ? error.code : 'INTERNAL_ERROR', message: known ? error.message : 'Unexpected server error', details: known ? error.details : undefined } }, { status: known ? 400 : 500 })
  }
}

const route = (method, path, handle, { auth = 'none' } = {}) => {
  const names = []
  const pattern = new RegExp('^' + path.replace(/:[a-zA-Z]+/g, match => { names.push(match.slice(1)); return '([^/]+)' }) + '$')
  return { method, path, pattern, names, handle, auth }
}

export function createProductRouter({ product, auth = null }) {
  invariant(product, 'PRODUCT_REQUIRED', 'The product router requires a TotemProductService')

  const identityOf = async request => {
    if (!auth) return null
    const header = request.headers.get('authorization') ?? ''
    if (!header.startsWith('Bearer ')) return null
    return auth.authenticate(header.slice(7))
  }

  const actingAs = (identity, accountId) => {
    invariant(identity, 'AUTH_REQUIRED', 'Connect a wallet to do that')
    invariant(!accountId || identity.accountId === accountId, 'AUTH_ACCOUNT_MISMATCH', 'You can only act as your own account')
    return identity.accountId
  }

  const routes = [
    /* totems */
    route('GET', '/api/v1/totems', async ({ url }) => ({ totems: await product.listTotems({ owner: url.searchParams.get('owner') ?? undefined }) })),
    route('GET', '/api/v1/totems/:id', async ({ params }) => ({ totem: await product.getTotem(params.id) })),
    route('POST', '/api/v1/totems/:id/pieces', async ({ params, identity }) => product.lockPiece({ totemId: params.id, accountId: actingAs(identity) }), { auth: 'required' }),
    route('DELETE', '/api/v1/totems/:id/pieces', async ({ params, identity }) => product.withdrawPiece({ totemId: params.id, accountId: actingAs(identity) }), { auth: 'required' }),
    route('POST', '/api/v1/totems/:id/split', async ({ params, body, identity }) => product.splitPiece({ totemId: params.id, accountId: actingAs(identity), to: body?.to }), { auth: 'required' }),
    route('POST', '/api/v1/totems/:id/merge', async ({ params, body, identity }) => product.mergeTotems({ targetId: params.id, sourceId: body?.sourceId, accountId: actingAs(identity) }), { auth: 'required' }),
    route('POST', '/api/v1/totems/:id/lend', async ({ params, body, identity }) => product.setLending({ totemId: params.id, ownerId: actingAs(identity), listed: body?.listed !== false }), { auth: 'required' }),

    /* arenas */
    route('GET', '/api/v1/arenas', async () => ({ arenas: await product.listArenas() })),
    route('GET', '/api/v1/arenas/:id', async ({ params }) => ({ arena: await product.getArena(params.id) })),
    route('POST', '/api/v1/arenas/:id/entry', async ({ params, body, identity }) => product.checkEntry({ arenaId: params.id, accountId: identity?.accountId ?? body?.accountId })),
    route('POST', '/api/v1/arenas/:id/pause', async ({ params, body, identity }) => product.setArenaPaused({ arenaId: params.id, accountId: actingAs(identity), paused: body?.paused !== false }), { auth: 'required' }),

    /* results and season */
    route('POST', '/api/v1/arenas/:id/results', async ({ params, body, identity }) => {
      actingAs(identity)
      return product.reportResult({ arenaId: params.id, ...body, signedBy: body?.signedBy })
    }, { auth: 'required' }),
    route('POST', '/api/v1/arenas/:id/settle', async ({ params, body, identity }) => {
      actingAs(identity)
      return product.settleResults({ arenaId: params.id, game: body?.game })
    }, { auth: 'required' }),
    route('GET', '/api/v1/players/:account/bests', async ({ params }) => ({ bests: await product.bests({ accountId: params.account }) })),
    route('GET', '/api/v1/seasons/current', async () => ({ season: await product.currentSeason() })),
    route('GET', '/api/v1/seasons/current/standings', async ({ url }) => product.standings({ limit: Number(url.searchParams.get('limit') ?? 50) })),

    /* market */
    route('GET', '/api/v1/market/listings', async () => ({ listings: await product.listListings() })),
    route('POST', '/api/v1/market/listings', async ({ body, identity }) => product.createListing({ totemId: body?.totemId, ownerId: actingAs(identity), price: body?.price }), { auth: 'required' }),
    route('POST', '/api/v1/market/listings/:id/buy', async ({ params, identity }) => product.buyListing({ listingId: params.id, buyerId: actingAs(identity) }), { auth: 'required' }),

    /* rentals */
    route('GET', '/api/v1/rentals', async ({ url }) => ({ rentals: await product.listRentals({ accountId: url.searchParams.get('account') }) })),
    route('POST', '/api/v1/rentals', async ({ body, identity }) => product.rentTotem({ totemId: body?.totemId, renterId: actingAs(identity), term: body?.term, price: body?.price }), { auth: 'required' }),

    /* rooms */
    route('POST', '/api/v1/rooms/:id/access', async ({ params, body, identity }) => product.roomAccess({ roomId: params.id, accountId: identity?.accountId ?? body?.accountId })),

    /* claims */
    route('POST', '/api/v1/claims/starter', async ({ body }) => product.claimStarter({ handle: body?.handle })),
    route('POST', '/api/v1/claims/prize', async ({ body }) => product.claimPrize({ handle: body?.handle, prizeId: body?.prizeId })),

    /* launches */
    route('GET', '/api/v1/launches', async ({ url }) => ({ launches: await product.listLaunches({ creatorId: url.searchParams.get('creator') ?? undefined }) })),
    route('POST', '/api/v1/launches', async ({ body, identity }) => product.createLaunch({ creatorId: actingAs(identity), collection: body?.collection, token: body?.token, size: body?.size }), { auth: 'required' }),
    route('POST', '/api/v1/launches/:id/review', async ({ params, body, identity }) => product.reviewLaunch({ launchId: params.id, reviewerId: actingAs(identity), decision: body?.decision, note: body?.note }), { auth: 'required' }),

    /* ledger */
    route('GET', '/api/v1/accounts/:account/ledger', async ({ params, url }) => ({ ledger: await product.ledger({ accountId: params.account, limit: Number(url.searchParams.get('limit') ?? 20) }) }))
  ]

  const match = (method, pathname) => {
    for (const entry of routes) {
      if (entry.method !== method) continue
      const found = entry.pattern.exec(pathname)
      if (!found) continue
      return { entry, params: Object.fromEntries(entry.names.map((name, index) => [name, decodeURIComponent(found[index + 1])])) }
    }
    return null
  }

  const handler = productHandler(async ({ request, body }) => {
    const url = new URL(request.url)
    const matched = match(request.method, url.pathname)
    invariant(matched, 'NOT_FOUND', 'Route not found')
    const identity = await identityOf(request)
    return matched.entry.handle({ request, body, url, params: matched.params, identity })
  })

  return {
    routes: routes.map(({ method, path }) => `${method} ${path}`),
    matches: (method, pathname) => Boolean(match(method, pathname)),
    handle: request => handler(request)
  }
}
