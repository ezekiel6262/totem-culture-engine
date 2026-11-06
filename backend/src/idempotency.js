import { hashRecord } from './canonical.js'

export function mintIdempotencyKey({ campaignId, accountId, eligibilityEpoch }) {
  return hashRecord({ scope: 'totem.mint.v1', campaignId, accountId, eligibilityEpoch })
}

export class MemoryNonceStore {
  #values = new Set()
  has(value) { return this.#values.has(value) }
  add(value) { this.#values.add(value) }
}
