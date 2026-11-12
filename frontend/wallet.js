// NEAR wallet sign-in for the product UI.
//
// This module owns the wallet only. It paints nothing and listens to no page events, so
// the UI decides when to open the modal and what to show. It pairs with totem-api.js,
// which holds the session token and performs the NEP-413 exchange.
import { Buffer } from 'buffer'
import { setupWalletSelector } from '@near-wallet-selector/core'
import { setupModal } from '@near-wallet-selector/modal-ui-js'
import { setupMeteorWallet } from '@near-wallet-selector/meteor-wallet'
import '@near-wallet-selector/modal-ui-js/styles.css'

globalThis.Buffer = Buffer

let ready = null

function start({ network, contractId }) {
  if (!ready) ready = (async () => {
    const selector = await setupWalletSelector({ network, modules: [setupMeteorWallet()] })
    const modal = setupModal(selector, { contractId, theme: 'light', description: 'Connect to Totem and sign a gas free NEP-413 message. Signing proves the account is yours and costs nothing.' })
    return { selector, modal }
  })()
  return ready
}

const accountOf = selector => selector.store.getState().accounts[0]?.accountId ?? null

// Resolves once the user picks an account in the modal, or null if they close it.
function waitForAccount(selector, timeoutMs = 180000) {
  return new Promise(resolve => {
    const existing = accountOf(selector)
    if (existing) return resolve(existing)
    let done = false
    const finish = value => { if (!done) { done = true; subscription.unsubscribe(); clearTimeout(timer); resolve(value) } }
    const subscription = selector.store.observable.subscribe(state => {
      const accountId = state.accounts[0]?.accountId ?? null
      if (accountId) finish(accountId)
    })
    const timer = setTimeout(() => finish(null), timeoutMs)
  })
}

window.totemWallet = {
  // The account the wallet currently holds, with no prompting.
  async current(options) {
    const { selector } = await start(options)
    return accountOf(selector)
  },

  // Opens the modal when needed, then signs the server's challenge.
  // Returns the identity, or null if the user closed the modal.
  async connect(options) {
    const { selector, modal } = await start(options)
    let accountId = accountOf(selector)
    if (!accountId) {
      modal.show()
      accountId = await waitForAccount(selector)
      if (!accountId) return null
    }
    const restored = await window.totemApi.restore()
    if (restored && restored.accountId === accountId) return restored

    const wallet = await selector.wallet()
    return window.totemApi.connect(accountId, challenge => wallet.signMessage({
      message: challenge.message,
      recipient: challenge.recipient,
      nonce: Buffer.from(challenge.nonce, 'base64'),
      state: challenge.state,
      callbackUrl: window.location.href
    }))
  },

  async signOut(options) {
    const { selector } = await start(options)
    try {
      const wallet = await selector.wallet()
      await wallet.signOut()
    } catch (error) {
      // Signing out of a wallet that is already gone is not a failure.
    }
    window.totemApi.disconnect()
  },

  signAndSendTransaction: async (transaction, options) => {
    const { selector } = await start(options)
    const wallet = await selector.wallet()
    return wallet.signAndSendTransaction(transaction)
  }
}
