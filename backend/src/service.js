import { createCampaignVersion } from './campaigns.js'
import { hashRecord } from './canonical.js'
import { evaluateHoldingRule } from './eligibility.js'
import { chooseEvolution } from './evolution.js'
import { mintIdempotencyKey } from './idempotency.js'
import { invariant } from './errors.js'
import { createMintTransactionPlan } from './near-transactions.js'

export class TotemService {
  constructor(repository, clock = () => Date.now(), contracts = {}) {
    this.repository = repository
    this.clock = clock
    this.contracts = { nftContractId: 'nft.totem.testnet', ...contracts }
  }

  async cultureAccount({ campaignId, accountId }) {
    const campaign = await this.repository.getLatestCampaign(campaignId)
    invariant(campaign, 'CAMPAIGN_NOT_FOUND', 'Campaign does not exist')
    invariant(/^(?=.{2,64}$)[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(accountId ?? ''), 'ACCOUNT_ID_INVALID', 'Account must be a valid NEAR account id')
    const contractId = campaign.culturePair?.collectionContractId
    invariant(contractId, 'CULTURE_ACCOUNT_UNAVAILABLE', 'This culture does not have an NFT collection yet')
    invariant(this.contracts.rpc, 'RPC_UNAVAILABLE', 'NEAR RPC is not configured')
    const block = await this.contracts.rpc.finalBlock()
    const token = await this.contracts.rpc.callFunctionAtBlock({ contractId, methodName: 'get_token_for_owner', args: { account_id: accountId }, blockId: block.hash })
    if (token.value == null) return { campaignId, accountId, contractId, tokenId: null, cultureAccount: null, blockHeight: token.blockHeight, blockHash: token.blockHash }
    const state = await this.contracts.rpc.callFunctionAtBlock({ contractId, methodName: 'get_culture_account', args: { token_id: token.value }, blockId: block.hash })
    return { campaignId, accountId, contractId, tokenId: token.value, cultureAccount: state.value, blockHeight: state.blockHeight, blockHash: state.blockHash }
  }

  async submitContribution({ campaignId, accountId, kind, evidence, nonce }) {
    const campaign = await this.repository.getLatestCampaign(campaignId)
    invariant(campaign, 'CAMPAIGN_NOT_FOUND', 'Campaign does not exist')
    invariant(campaign.status === 'active', 'CAMPAIGN_NOT_ACTIVE', 'Campaign is not active')
    const kinds = new Set(['meme_raid', 'verified_referral', 'liquidity_action', 'governance_action', 'arena_entry'])
    invariant(kinds.has(kind), 'CONTRIBUTION_KIND_INVALID', 'Contribution kind is unsupported')
    invariant(typeof evidence === 'string' && evidence.length >= 3 && evidence.length <= 500, 'CONTRIBUTION_EVIDENCE_INVALID', 'Evidence must be between 3 and 500 characters')
    invariant(/^[a-zA-Z0-9_-]{8,80}$/.test(nonce ?? ''), 'CONTRIBUTION_NONCE_INVALID', 'Contribution nonce is invalid')
    const idempotencyKey = `contribution:${hashRecord({ campaignId, accountId, kind, nonce })}`
    const command = { idempotencyKey, kind: 'verify_social_contribution', campaignId, campaignVersion: campaign.version, accountId, contributionKind: kind, evidence, nonce, status: 'pending_verification', createdAt: this.clock() }
    const stored = await this.repository.createCommandOnce(command)
    if (stored.created) await this.#event(campaignId, 'social.contribution_submitted', { accountId, contributionKind: kind, idempotencyKey, status: command.status })
    return { replay: !stored.created, contribution: stored.command }
  }

  async listContributions({ campaignId, reviewerAccountId }) {
    const campaign = await this.repository.getLatestCampaign(campaignId)
    invariant(campaign, 'CAMPAIGN_NOT_FOUND', 'Campaign does not exist')
    invariant(campaign.creatorAccountId === reviewerAccountId, 'CAMPAIGN_REVIEW_FORBIDDEN', 'Only the culture creator can review contributions')
    return this.repository.listCommands({ campaignId, kind: 'verify_social_contribution', limit: 100 })
  }

  async reviewContribution({ campaignId, reviewerAccountId, idempotencyKey, decision }) {
    const campaign = await this.repository.getLatestCampaign(campaignId)
    invariant(campaign, 'CAMPAIGN_NOT_FOUND', 'Campaign does not exist')
    invariant(campaign.creatorAccountId === reviewerAccountId, 'CAMPAIGN_REVIEW_FORBIDDEN', 'Only the culture creator can review contributions')
    invariant(decision === 'approve' || decision === 'reject', 'CONTRIBUTION_DECISION_INVALID', 'Decision must be approve or reject')
    const commands = await this.repository.listCommands({ campaignId, kind: 'verify_social_contribution', limit: 100 })
    const current = commands.find(command => command.idempotencyKey === idempotencyKey)
    invariant(current, 'CONTRIBUTION_NOT_FOUND', 'Contribution receipt does not exist')
    const collectionContractId = campaign.culturePair?.collectionContractId
    if (decision === 'approve' && current.status === 'approved_pending_credential') return { contribution: current, credential: `contribution:${current.contributionKind}`, credentialTransaction: this.#credentialTransaction(current, reviewerAccountId, collectionContractId) }
    const status = decision === 'approve' && collectionContractId ? 'approved_pending_credential' : decision === 'approve' ? 'verified' : 'rejected', reviewedAt = this.clock()
    const contribution = await this.repository.updateCommandStatus({ idempotencyKey, expectedStatus: 'pending_verification', status, reviewedBy: reviewerAccountId, reviewedAt })
    invariant(contribution, 'CONTRIBUTION_ALREADY_REVIEWED', 'Contribution has already been reviewed')
    const credential = `contribution:${contribution.contributionKind}`
    const credentialTransaction = status === 'approved_pending_credential' ? this.#credentialTransaction(contribution, reviewerAccountId, collectionContractId) : null
    await this.#event(campaignId, `social.contribution_${status}`, { accountId: contribution.accountId, contributionKind: contribution.contributionKind, idempotencyKey, reviewedBy: reviewerAccountId, credential })
    return { contribution, credential, credentialTransaction }
  }

  async finalizeContribution({ campaignId, reviewerAccountId, idempotencyKey, transactionHash }) {
    const campaign = await this.repository.getLatestCampaign(campaignId)
    invariant(campaign?.creatorAccountId === reviewerAccountId, 'CAMPAIGN_REVIEW_FORBIDDEN', 'Only the culture creator can finalize contributions')
    invariant(/^[A-Za-z0-9_-]{20,100}$/.test(transactionHash ?? ''), 'TRANSACTION_HASH_INVALID', 'A valid NEAR transaction hash is required')
    const commands = await this.repository.listCommands({ campaignId, kind: 'verify_social_contribution', limit: 100 })
    invariant(commands.some(command => command.idempotencyKey === idempotencyKey && command.status === 'approved_pending_credential'), 'CONTRIBUTION_FINALIZE_INVALID', 'Contribution is not awaiting credential confirmation')
    const reviewedAt = this.clock(), contribution = await this.repository.updateCommandStatus({ idempotencyKey, expectedStatus: 'approved_pending_credential', status: 'verified', reviewedBy: reviewerAccountId, reviewedAt })
    invariant(contribution, 'CONTRIBUTION_FINALIZE_INVALID', 'Contribution is not awaiting credential confirmation')
    contribution.transactionHash = transactionHash
    await this.#event(campaignId, 'social.contribution_verified', { accountId: contribution.accountId, contributionKind: contribution.contributionKind, idempotencyKey, reviewedBy: reviewerAccountId, transactionHash })
    return { contribution }
  }

  #credentialTransaction(contribution, signerId, receiverId) {
    return { signerId, receiverId, actions: [{ type: 'FunctionCall', params: { methodName: 'grant_credential', args: { account_id: contribution.accountId, credential: `contribution:${contribution.contributionKind}` }, gas: '50000000000000', deposit: '0' } }] }
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
    const eligibilityExpiresAt = this.clock() + 15 * 60 * 1000
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
      transactionPlan: createMintTransactionPlan({
        nftContractId: this.contracts.nftContractId,
        accountId,
        branchId: evolution.branchId,
        expiresAtMs: eligibilityExpiresAt
      }),
      eligibilityExpiresAt,
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
      sequence: typeof this.repository.nextEventSequence === 'function' ? await this.repository.nextEventSequence(campaignId) : 0,
      campaignId,
      type,
      data,
      occurredAt,
      eventHash: hashRecord({ campaignId, type, data, occurredAt })
    })
  }
}
