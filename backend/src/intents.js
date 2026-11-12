// NEAR Intents, through the 1Click API.
//
// This is a real integration: quotes come from the live solver network, priced by real
// market makers. The quotes are requested in dry mode, which prices a route without
// committing to it or issuing a deposit address, so nothing here moves funds.
//
// 1Click prices mainnet assets. Totem runs on testnet, so a quote is a true price for the
// route a funded launch would take, not a transaction this release can execute. Callers
// must present it that way, and `network` in the response says which it is.
import { invariant } from './errors.js'

export const ONE_CLICK_BASE = 'https://1click.chaindefuser.com'
const TOKENS_TTL_MS = 5 * 60_000

export class IntentsService {
  #base
  #fetch
  #now
  #network
  #tokens = { at: 0, list: [] }

  constructor({ base = ONE_CLICK_BASE, fetchImpl = globalThis.fetch, now = () => Date.now(), network = 'mainnet', timeoutMs = 8000 } = {}) {
    this.#base = base.replace(/\/$/, '')
    this.#fetch = fetchImpl
    this.#now = now
    this.#network = network
    this.timeoutMs = timeoutMs
  }

  async #call(path, options = {}) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.#fetch(this.#base + path, { ...options, signal: controller.signal, headers: { accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers ?? {}) } })
      const text = await response.text()
      let payload = null
      try { payload = text ? JSON.parse(text) : null } catch { payload = null }
      invariant(response.ok, 'INTENTS_UNAVAILABLE', payload?.message ?? `NEAR Intents returned ${response.status}`)
      return payload
    } catch (error) {
      if (error?.code === 'INTENTS_UNAVAILABLE') throw error
      invariant(false, 'INTENTS_UNREACHABLE', 'The NEAR Intents solver network could not be reached')
    } finally { clearTimeout(timer) }
  }

  // The assets the solver network can route, with the prices it is quoting now.
  async tokens({ force = false } = {}) {
    if (!force && this.#now() - this.#tokens.at < TOKENS_TTL_MS && this.#tokens.list.length) return this.#tokens.list
    const list = await this.#call('/v0/tokens')
    invariant(Array.isArray(list), 'INTENTS_UNAVAILABLE', 'NEAR Intents returned an unexpected token list')
    this.#tokens = { at: this.#now(), list }
    return list
  }

  // A route that can fund a Totem from another chain, grouped for the UI.
  async fundingRoutes({ destinationAsset = 'nep141:wrap.near' } = {}) {
    const tokens = await this.tokens()
    const destination = tokens.find(token => token.assetId === destinationAsset) ?? null
    const origins = tokens
      .filter(token => token.assetId !== destinationAsset && token.price > 0)
      .map(token => ({ assetId: token.assetId, symbol: token.symbol, blockchain: token.blockchain, decimals: token.decimals, price: token.price }))
    return { destination, origins, network: this.#network, source: '1click' }
  }

  async quote({ originAsset, destinationAsset = 'nep141:wrap.near', amount, recipient, refundTo, slippageTolerance = 100, depositType = 'ORIGIN_CHAIN', deadlineMs = 30 * 60_000 }) {
    invariant(typeof originAsset === 'string' && originAsset.length > 3, 'ORIGIN_ASSET_REQUIRED', 'originAsset is required')
    invariant(typeof destinationAsset === 'string' && destinationAsset.length > 3, 'DESTINATION_ASSET_REQUIRED', 'destinationAsset is required')
    invariant(/^[0-9]+$/.test(String(amount ?? '')), 'AMOUNT_INVALID', 'amount must be a whole number in the asset’s smallest unit')
    invariant(recipient, 'RECIPIENT_REQUIRED', 'recipient is required')

    const body = {
      dry: true, // never commits, never returns a deposit address
      swapType: 'EXACT_INPUT',
      slippageTolerance,
      originAsset,
      depositType,
      destinationAsset,
      amount: String(amount),
      refundTo: refundTo ?? recipient,
      refundType: depositType === 'INTENTS' ? 'INTENTS' : 'ORIGIN_CHAIN',
      recipient,
      recipientType: 'DESTINATION_CHAIN',
      deadline: new Date(this.#now() + deadlineMs).toISOString()
    }

    const payload = await this.#call('/v0/quote', { method: 'POST', body: JSON.stringify(body) })
    const quote = payload?.quote
    invariant(quote, 'INTENTS_NO_ROUTE', 'No solver quoted this route')

    return {
      source: '1click',
      network: this.#network,
      executable: false, // dry quotes price a route, they do not move funds
      originAsset,
      destinationAsset,
      amountIn: quote.amountIn,
      amountInFormatted: quote.amountInFormatted,
      amountInUsd: quote.amountInUsd,
      amountOut: quote.amountOut,
      amountOutFormatted: quote.amountOutFormatted,
      amountOutUsd: quote.amountOutUsd,
      minAmountOut: quote.minAmountOut,
      timeEstimateSeconds: quote.timeEstimate,
      refundFee: quote.refundFee,
      withdrawFee: quote.withdrawFee
    }
  }
}
