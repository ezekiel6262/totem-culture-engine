import { createCampaignVersion } from './campaigns.js'
import { hashRecord } from './canonical.js'
import { evaluateHoldingRule } from './eligibility.js'
import { chooseEvolution } from './evolution.js'
import { mintIdempotencyKey } from './idempotency.js'
import { invariant } from './errors.js'

export class TotemService {
  constructor(repository, clock = () => Date.now()) {
    this.repository = repository
    this.clock = clock
  }

  async createCampaign(input) {
    const current = await this.repository.getLatestCampaign(input.id)
    const campaign = createCampaignVersion(input, current, this.clock())
    await this.repository.saveCampaignVersion(campaign)
    await this.#event(campaign.id, 'campaign.version_created', { version: campaign.version, versionHash: campaign.versionHash })
    return campaign
  }

  async evaluate({ campaignId, accountId, checkpoints }) {
    const campaign = await this.repository.getLatestCampaign(campaignId)
    invariant(campaign, 'CAMPAIGN_NOT_FOUND', 'Campaign does not exist')
    const result = evaluateHoldingRule(campaign.rule, checkpoints, this.clock())
    return { campaignId, campaignVersion: campaign.version, accountId, ...result }
  }

  async prepareMint({ campaignId, accountId, eligibilityEpoch, checkpoints, signals }) {
    const campaign = await this.repository.getLatestCampaign(campaignId)
    invariant(campaign, 'CAMPAIGN_NOT_FOUND', 'Campaign does not exist')
    invariant(campaign.status === 'active', 'CAMPAIGN_NOT_ACTIVE', 'Campaign is not active')
    const eligibility = evaluateHoldingRule(campaign.rule, checkpoints, this.clock())
    invariant(eligibility.eligible, 'MINT_NOT_ELIGIBLE', 'Account has not satisfied the holding rule', eligibility)
    const evolution = chooseEvolution(campaign.evolutionBranches, signals)
    const idempotencyKey = mintIdempotencyKey({ campaignId, accountId, eligibilityEpoch })
    const command = {
      idempotencyKey,
      kind: 'mint_identity',
      campaignId,
      campaignVersion: campaign.version,
      accountId,
      eligibilityEpoch,
      role: evolution.role,
      branchId: evolution.branchId,
      payloadHash: hashRecord({ checkpoints, signals }),
      status: 'pending',
      createdAt: this.clock()
    }
    const stored = await this.repository.createCommandOnce(command)
    if (stored.created) await this.#event(campaignId, 'identity.mint_prepared', { accountId, idempotencyKey, branchId: evolution.branchId })
    return { replay: !stored.created, command: stored.command, eligibility, evolution }
  }

  async #event(campaignId, type, data) {
    const occurredAt = this.clock()
    return this.repository.appendEvent({
      sequence: await this.repository.nextEventSequence(),
      campaignId,
      type,
      data,
      occurredAt,
      eventHash: hashRecord({ campaignId, type, data, occurredAt })
    })
  }
}
