import { invariant } from './errors.js'

export async function observeFinalizedBalance({ campaign, accountId, period, rpc, checkpointRepository }) {
  invariant(campaign.rule.kind === 'time_weighted_balance', 'CHECKPOINT_RULE_UNSUPPORTED', 'Campaign does not use token balance checkpoints')
  const observation = await rpc.ftBalanceAtFinalBlock({ contractId: campaign.subjectContractId, accountId })
  const checkpoint = {
    campaignId: campaign.id,
    accountId,
    period,
    balance: observation.balance,
    blockHeight: observation.blockHeight,
    blockHash: observation.blockHash,
    observedAt: observation.observedAt,
    provenance: { source: 'near-rpc', finality: 'final', method: 'ft_balance_of', contractId: campaign.subjectContractId }
  }
  return checkpointRepository.upsertCheckpoint(checkpoint)
}
