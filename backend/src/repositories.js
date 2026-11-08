import { DomainError } from './errors.js'

export class MemoryTotemRepository {
  #campaignVersions = new Map()
  #commands = new Map()
  #events = []

  async saveCampaignVersion(campaign) {
    const versions = this.#campaignVersions.get(campaign.id) ?? []
    if (versions.some(item => item.version === campaign.version)) throw new DomainError('CAMPAIGN_VERSION_CONFLICT', 'Campaign version already exists')
    versions.push(structuredClone(campaign))
    this.#campaignVersions.set(campaign.id, versions)
    return structuredClone(campaign)
  }

  async getLatestCampaign(id) {
    return structuredClone(this.#campaignVersions.get(id)?.at(-1) ?? null)
  }

  async listLatestCampaigns({ limit = 50 } = {}) {
    return [...this.#campaignVersions.values()]
      .map(versions => versions.at(-1))
      .filter(Boolean)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map(campaign => structuredClone(campaign))
  }

  async createCommandOnce(command) {
    const existing = this.#commands.get(command.idempotencyKey)
    if (existing) return { created: false, command: structuredClone(existing) }
    this.#commands.set(command.idempotencyKey, structuredClone(command))
    return { created: true, command: structuredClone(command) }
  }

  async listCommands({ campaignId, kind, status, limit = 100 }) {
    return [...this.#commands.values()].filter(command => command.campaignId === campaignId && (!kind || command.kind === kind) && (!status || command.status === status)).sort((a, b) => b.createdAt - a.createdAt).slice(0, limit).map(command => structuredClone(command))
  }

  async updateCommandStatus({ idempotencyKey, expectedStatus, status, reviewedBy, reviewedAt }) {
    const command = this.#commands.get(idempotencyKey)
    if (!command || command.status !== expectedStatus) return null
    const updated = { ...command, status, reviewedBy, reviewedAt }
    this.#commands.set(idempotencyKey, updated)
    return structuredClone(updated)
  }

  async appendEvent(event) {
    this.#events.push(structuredClone(event))
    return structuredClone(event)
  }

  async listEvents({ campaignId, afterSequence = 0, limit = 50 }) {
    return this.#events
      .filter(event => event.campaignId === campaignId && event.sequence > afterSequence)
      .slice(0, limit)
      .map(event => structuredClone(event))
  }

  async nextEventSequence() { return this.#events.length + 1 }
}
