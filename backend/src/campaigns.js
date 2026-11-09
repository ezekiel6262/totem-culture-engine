import { hashRecord } from './canonical.js'
import { invariant } from './errors.js'

const ACCOUNT_ID = /^(?=.{2,64}$)[a-z0-9]+(?:[._-][a-z0-9]+)*$/
const CAMPAIGN_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MODES = new Set(['token_first', 'nft_first', 'twin_launch'])

function validOptionalAccount(value) { return value == null || ACCOUNT_ID.test(value) }

export function normalizeCulturePair(input) {
  const pair = input.culturePair ?? {}
  const tokenContractId = pair.tokenContractId ?? (input.mode === 'token_first' ? input.subjectContractId : null)
  const collectionContractId = pair.collectionContractId ?? (input.mode === 'nft_first' ? input.subjectContractId : null)
  return { tokenContractId, collectionContractId }
}

export function validateCampaign(input) {
  invariant(CAMPAIGN_ID.test(input.id ?? ''), 'CAMPAIGN_ID_INVALID', 'Campaign id must be a lowercase kebab-case identifier')
  invariant(ACCOUNT_ID.test(input.creatorAccountId ?? ''), 'ACCOUNT_ID_INVALID', 'Creator must be a valid NEAR account id')
  invariant(ACCOUNT_ID.test(input.subjectContractId ?? ''), 'ACCOUNT_ID_INVALID', 'Subject contract must be a valid NEAR account id')
  invariant(MODES.has(input.mode), 'CAMPAIGN_MODE_INVALID', 'Campaign mode is unsupported')
  const pair = normalizeCulturePair(input)
  invariant(validOptionalAccount(pair.tokenContractId) && validOptionalAccount(pair.collectionContractId), 'CULTURE_PAIR_INVALID', 'Culture Pair contracts must be valid NEAR account ids')
  invariant(input.mode !== 'token_first' || pair.tokenContractId, 'CULTURE_PAIR_INVALID', 'Token cultures require a token contract')
  invariant(input.mode !== 'nft_first' || pair.collectionContractId, 'CULTURE_PAIR_INVALID', 'NFT cultures require a collection contract')
  invariant(input.mode !== 'twin_launch' || (pair.tokenContractId && pair.collectionContractId), 'CULTURE_PAIR_INVALID', 'Twin cultures require both token and collection contracts')
  invariant(Number.isSafeInteger(input.startsAt) && Number.isSafeInteger(input.endsAt) && input.startsAt < input.endsAt, 'CAMPAIGN_WINDOW_INVALID', 'Campaign start must precede its end')
  invariant(input.rule?.kind === 'time_weighted_balance', 'CAMPAIGN_RULE_INVALID', 'MVP campaigns require a time-weighted balance rule')
  invariant(Array.isArray(input.evolutionBranches) && input.evolutionBranches.length >= 2, 'CAMPAIGN_EVOLUTION_INVALID', 'At least two evolution branches are required')
  if (input.accessPolicy) {
    invariant(typeof input.accessPolicy.minimumTokenBalance === 'string' && /^\d+$/.test(input.accessPolicy.minimumTokenBalance), 'ACCESS_POLICY_INVALID', 'Minimum token balance must be an integer string')
    invariant(Number.isSafeInteger(input.accessPolicy.minimumTier) && input.accessPolicy.minimumTier >= 0 && input.accessPolicy.minimumTier <= 3, 'ACCESS_POLICY_INVALID', 'Minimum Culture Account tier must be between 0 and 3')
    invariant(Array.isArray(input.accessPolicy.requiredCredentials) && input.accessPolicy.requiredCredentials.length <= 16, 'ACCESS_POLICY_INVALID', 'Required credentials must be a bounded list')
    invariant(input.accessPolicy.requiredCredentials.every(value => typeof value === 'string' && value.length > 0 && value.length <= 64), 'ACCESS_POLICY_INVALID', 'Required credentials are invalid')
    invariant(Number.isSafeInteger(input.accessPolicy.ttlSeconds) && input.accessPolicy.ttlSeconds >= 60 && input.accessPolicy.ttlSeconds <= 86_400, 'ACCESS_POLICY_INVALID', 'Access receipt lifetime must be between 60 seconds and 24 hours')
  }
  invariant(Array.isArray(input.feePolicy?.routes), 'CAMPAIGN_FEE_POLICY_INVALID', 'A fee policy is required')
  invariant(input.feePolicy.routes.reduce((sum, route) => sum + route.basisPoints, 0) === 10_000, 'CAMPAIGN_FEE_POLICY_INVALID', 'Fee routes must total 10,000 basis points')
  return true
}

export function createCampaignVersion(input, previous = null, now = Date.now()) {
  validateCampaign(input)
  invariant(!previous || previous.id === input.id, 'CAMPAIGN_VERSION_INVALID', 'Previous version belongs to another campaign')
  invariant(!previous || previous.creatorAccountId === input.creatorAccountId, 'CAMPAIGN_CREATOR_IMMUTABLE', 'Campaign creator cannot change between versions')
  const version = (previous?.version ?? 0) + 1
  const policy = { ...structuredClone(input), culturePair: normalizeCulturePair(input) }
  return Object.freeze({
    ...policy,
    version,
    status: input.status ?? 'draft',
    createdAt: now,
    previousVersionHash: previous?.versionHash ?? null,
    versionHash: hashRecord({ policy, version, previousVersionHash: previous?.versionHash ?? null })
  })
}
