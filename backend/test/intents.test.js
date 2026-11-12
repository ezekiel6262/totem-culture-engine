import test from 'node:test'
import assert from 'node:assert/strict'
import { IntentsService } from '../src/index.js'

const tokens = [
  { assetId: 'nep141:wrap.near', symbol: 'wNEAR', blockchain: 'near', decimals: 24, price: 3.46 },
  { assetId: 'nep141:eth.bridge.near', symbol: 'ETH', blockchain: 'eth', decimals: 18, price: 2030.31 },
  { assetId: 'nep141:dead', symbol: 'DEAD', blockchain: 'near', decimals: 6, price: 0 }
]

const quoteBody = {
  quote: {
    amountIn: '10000000', amountInFormatted: '10.0', amountInUsd: '9.99',
    amountOut: '2888907876969618031154078', amountOutFormatted: '2.888', amountOutUsd: '9.99',
    minAmountOut: '2860018798199921850842537', timeEstimate: 20, refundFee: '4327', withdrawFee: '0'
  }
}

function stub(handler) {
  const calls = []
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options, body: options.body ? JSON.parse(options.body) : null })
    return handler(url, options)
  }
  return { fetchImpl, calls }
}

const ok = (payload) => ({ ok: true, status: 200, text: async () => JSON.stringify(payload) })

test('funding routes drop the destination and anything the network is not pricing', async () => {
  const { fetchImpl } = stub(() => ok(tokens))
  const intents = new IntentsService({ fetchImpl })
  const routes = await intents.fundingRoutes()
  assert.equal(routes.destination.symbol, 'wNEAR')
  assert.deepEqual(routes.origins.map(o => o.symbol), ['ETH'])
  assert.equal(routes.source, '1click')
})

test('the token list is cached, so a screen does not hammer the solver network', async () => {
  const { fetchImpl, calls } = stub(() => ok(tokens))
  let clock = 1_000
  const intents = new IntentsService({ fetchImpl, now: () => clock })
  await intents.tokens()
  await intents.tokens()
  assert.equal(calls.length, 1)
  clock += 6 * 60_000
  await intents.tokens()
  assert.equal(calls.length, 2)
})

test('a quote is always dry, so it prices a route and never moves funds', async () => {
  const { fetchImpl, calls } = stub((url) => ok(url.endsWith('/v0/quote') ? quoteBody : tokens))
  const intents = new IntentsService({ fetchImpl, now: () => 1_700_000_000_000 })
  const quote = await intents.quote({ originAsset: 'nep141:eth.bridge.near', amount: '10000000', recipient: 'ada.near', depositType: 'INTENTS' })

  assert.equal(calls[0].body.dry, true)
  assert.equal(calls[0].body.swapType, 'EXACT_INPUT')
  assert.equal(calls[0].body.recipient, 'ada.near')
  assert.equal(calls[0].body.refundTo, 'ada.near')
  assert.ok(calls[0].body.deadline > new Date(1_700_000_000_000).toISOString())
  assert.equal(quote.executable, false)
  assert.equal(quote.amountOutFormatted, '2.888')
  assert.equal(quote.timeEstimateSeconds, 20)
})

test('a quote needs a whole amount in the smallest unit', async () => {
  const { fetchImpl } = stub(() => ok(quoteBody))
  const intents = new IntentsService({ fetchImpl })
  const code = async (promise) => { try { await promise; return null } catch (error) { return error.code } }
  assert.equal(await code(intents.quote({ originAsset: 'nep141:eth.bridge.near', amount: '1.5', recipient: 'ada.near' })), 'AMOUNT_INVALID')
  assert.equal(await code(intents.quote({ originAsset: 'nep141:eth.bridge.near', amount: '100', recipient: '' })), 'RECIPIENT_REQUIRED')
})

test('a solver network that is down is reported, not hidden', async () => {
  const down = new IntentsService({ fetchImpl: async () => { throw new Error('socket hang up') } })
  await assert.rejects(() => down.tokens(), error => error.code === 'INTENTS_UNREACHABLE')

  const erroring = new IntentsService({ fetchImpl: async () => ({ ok: false, status: 500, text: async () => JSON.stringify({ message: 'Internal server error' }) }) })
  await assert.rejects(() => erroring.tokens(), error => error.code === 'INTENTS_UNAVAILABLE')
})

test('a route with no solver is a clear refusal', async () => {
  const { fetchImpl } = stub(() => ok({}))
  const intents = new IntentsService({ fetchImpl })
  await assert.rejects(
    () => intents.quote({ originAsset: 'nep141:eth.bridge.near', amount: '100', recipient: 'ada.near', depositType: 'INTENTS' }),
    error => error.code === 'INTENTS_NO_ROUTE'
  )
})

test('a refund address is only assumed when the refund goes back to the NEAR side', async () => {
  // The solver rejects a NEAR account as refundTo when the deposit comes from another chain,
  // so an origin chain quote has to be given one rather than inheriting the recipient.
  const { fetchImpl, calls } = stub(() => ok(quoteBody))
  const intents = new IntentsService({ fetchImpl })

  await intents.quote({ originAsset: 'nep141:eth.bridge.near', amount: '10000000', recipient: 'ada.near', depositType: 'INTENTS' })
  const intentsCall = calls.at(-1).body
  assert.equal(intentsCall.refundType, 'INTENTS')
  assert.equal(intentsCall.refundTo, 'ada.near')

  await assert.rejects(
    () => intents.quote({ originAsset: 'nep141:eth.bridge.near', amount: '10000000', recipient: 'ada.near' }),
    (error) => error.code === 'REFUND_TO_REQUIRED'
  )

  await intents.quote({ originAsset: 'nep141:eth.bridge.near', amount: '10000000', recipient: 'ada.near', refundTo: '0x1111111111111111111111111111111111111111' })
  const originCall = calls.at(-1).body
  assert.equal(originCall.refundType, 'ORIGIN_CHAIN')
  assert.equal(originCall.refundTo, '0x1111111111111111111111111111111111111111')
  assert.equal(originCall.dry, true)
})

