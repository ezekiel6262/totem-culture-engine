// NEAR wallet sign-in for the product UI.
//
// This module owns the wallet only. It paints nothing and listens to no page events, so
// the UI decides when to open the modal and what to show. It pairs with totem-api.js,
// which holds the session token and performs the NEP-413 exchange.
import { Buffer } from 'buffer'
import { setupWalletSelector } from '@near-wallet-selector/core'
import { setupModal } from '@near-wallet-selector/modal-ui-js'
import { setupMeteorWallet } from '@near-wallet-selector/meteor-wallet'
import { setupMeteorWalletApp } from '@near-wallet-selector/meteor-wallet-app'
import { setupMyNearWallet } from '@near-wallet-selector/my-near-wallet'
import '@near-wallet-selector/modal-ui-js/styles.css'

globalThis.Buffer = Buffer

let ready = null

function start({ network, contractId }) {
  if (!ready) ready = (async () => {
    // Three ways in, because one was not enough. setupMeteorWallet is the browser
    // extension: without it installed there was nothing to connect through, which is why a
    // visitor already signed in to the Meteor web wallet got a modal that went nowhere.
    // setupMeteorWalletApp is that web wallet, and MyNearWallet is a second web wallet so
    // nobody is required to install anything to use Totem.
    const selector = await setupWalletSelector({
      network,
      modules: [
        setupMeteorWallet(),
        setupMeteorWalletApp({ contractId }),
        setupMyNearWallet()
      ]
    })
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

  // Which wallets this build can actually sign in with, for a UI that wants to offer them
  // directly. The modal lists the ones it can draw; an instant-link wallet like the Meteor
  // web wallet is registered but never appears there, so it needs its own way in.
  async options(options) {
    const { selector } = await start(options)
    // The selector has no getAvailableWallets; the registered modules live in its store.
    return (selector.store.getState().modules || [])
      .filter(module => module && module.metadata && module.metadata.available !== false)
      .map(module => ({ id: module.id, name: module.metadata.name, type: module.metadata.type }))
  },

  // Signs in with one named wallet, skipping the modal. This is how the Meteor web wallet
  // is reached: modal-ui-js does not draw instant-link wallets, so a visitor already signed
  // in to it was shown a list that did not include the wallet they were using.
  async connectWith(walletId, options) {
    const { selector } = await start(options)
    const wallet = await selector.wallet(walletId)
    await wallet.signIn({ contractId: options.contractId, accounts: [] })
    const accountId = await waitForAccount(selector)
    if (!accountId) return null
    return window.totemWallet.finish(accountId, options)
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
    return window.totemWallet.finish(accountId, options)
  },

  // The NEP-413 exchange, shared by every way in. Signing proves the account without a
  // transaction, so it costs nothing and moves nothing.
  async finish(accountId, options) {
    const { selector } = await start(options)
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
