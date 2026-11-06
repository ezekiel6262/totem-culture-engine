import { hashRecord } from './canonical.js'
import { invariant } from './errors.js'

const ACCOUNT_ID = /^(?=.{2,64}$)[a-z0-9]+(?:[._-][a-z0-9]+)*$/
const CAMPAIGN_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MODES = new Set(['token_first', 'nft_first', 'event_first'])

export function validateCampaign(input) {
  invariant(CAMPAIGN_ID.test(input.id ?? ''), 'CAMPAIGN_ID_INVALID', 'Campaign id must be a lowercase kebab-case identifier')
  invariant(ACCOUNT_ID.test(input.creatorAccountId ?? ''), 'ACCOUNT_ID_INVALID', 'Creator must be a valid NEAR account id')
  invariant(ACCOUNT_ID.test(input.subjectContractId ?? ''), 'ACCOUNT_ID_INVALID', 'Subject contract must be a valid NEAR account id')
  invariant(MODES.has(input.mode), 'CAMPAIGN_MODE_INVALID', 'Campaign mode is unsupported')
  invariant(Number.isSafeInteger(input.startsAt) && Number.isSafeInteger(input.endsAt) && input.startsAt < input.endsAt, 'CAMPAIGN_WINDOW_INVALID', 'Campaign start must precede its end')
  invariant(input.rule?.kind === 'time_weighted_balance', 'CAMPAIGN_RULE_INVALID', 'MVP campaigns require a time-weighted balance rule')
  invariant(Array.isArray(input.evolutionBranches) && input.evolutionBranches.length >= 2, 'CAMPAIGN_EVOLUTION_INVALID', 'At least two evolution branches are required')
  invariant(Array.isArray(input.feePolicy?.routes), 'CAMPAIGN_FEE_POLICY_INVALID', 'A fee policy is required')
  invariant(input.feePolicy.routes.reduce((sum, route) => sum + route.basisPoints, 0) === 10_000, 'CAMPAIGN_FEE_POLICY_INVALID', 'Fee routes must total 10,000 basis points')
  return true
}

export function createCampaignVersion(input, previous = null, now = Date.now()) {
  validateCampaign(input)
  invariant(!previous || previous.id === input.id, 'CAMPAIGN_VERSION_INVALID', 'Previous version belongs to another campaign')
  invariant(!previous || previous.creatorAccountId === input.creatorAccountId, 'CAMPAIGN_CREATOR_IMMUTABLE', 'Campaign creator cannot change between versions')
  const version = (previous?.version ?? 0) + 1
  const policy = structuredClone(input)
  return Object.freeze({
    ...policy,
    version,
    status: input.status ?? 'draft',
    createdAt: now,
    previousVersionHash: previous?.versionHash ?? null,
    versionHash: hashRecord({ policy, version, previousVersionHash: previous?.versionHash ?? null })
  })
}
