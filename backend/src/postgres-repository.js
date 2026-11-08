import { DomainError } from './errors.js'

export class PostgresTotemRepository {
  constructor(sql) { this.sql = sql }

  async saveCampaignVersion(campaign) {
    await this.sql.transaction(async tx => {
      const campaignWrite = await tx.query(`insert into campaigns (id, creator_account_id, subject_contract_id, mode, latest_version, status, starts_at, ends_at)
        values ($1,$2,$3,$4,$5,$6,to_timestamp($7/1000.0),to_timestamp($8/1000.0))
        on conflict (id) do update set latest_version=excluded.latest_version,status=excluded.status,starts_at=excluded.starts_at,ends_at=excluded.ends_at,updated_at=now()
        where campaigns.creator_account_id=excluded.creator_account_id
          and campaigns.subject_contract_id=excluded.subject_contract_id
          and campaigns.mode=excluded.mode
          and campaigns.latest_version < excluded.latest_version
        returning id`,
      [campaign.id, campaign.creatorAccountId, campaign.subjectContractId, campaign.mode, campaign.version, campaign.status, campaign.startsAt, campaign.endsAt])
      if (campaignWrite.rowCount !== 1) throw new DomainError('CAMPAIGN_VERSION_CONFLICT', 'Campaign identity is immutable or version is stale')
      const inserted = await tx.query(`insert into campaign_versions (campaign_id,version,version_hash,previous_version_hash,policy)
        values ($1,$2,$3,$4,$5::jsonb) on conflict (campaign_id,version) do nothing returning campaign_id`,
      [campaign.id, campaign.version, campaign.versionHash, campaign.previousVersionHash, JSON.stringify(campaign)])
      if (inserted.rowCount !== 1) throw new DomainError('CAMPAIGN_VERSION_CONFLICT', 'Campaign version already exists')
    })
    return campaign
  }

  async getLatestCampaign(id) {
    const result = await this.sql.query(`select policy from campaign_versions where campaign_id=$1 order by version desc limit 1`, [id])
    return result.rows[0]?.policy ?? null
  }

  async listLatestCampaigns({ limit = 50 } = {}) {
    const bounded = Math.min(Math.max(limit, 1), 100)
    const result = await this.sql.query(`select cv.policy from campaigns c join campaign_versions cv on cv.campaign_id=c.id and cv.version=c.latest_version order by cv.created_at desc limit $1`, [bounded])
    return result.rows.map(row => row.policy)
  }

  async createCommandOnce(command) {
    const result = await this.sql.query(`insert into commands (idempotency_key,kind,campaign_id,account_id,payload,payload_hash,status,created_at,updated_at)
      values ($1,$2,$3,$4,$5::jsonb,$6,$7,to_timestamp($8/1000.0),to_timestamp($8/1000.0))
      on conflict (idempotency_key) do nothing returning payload`,
    [command.idempotencyKey, command.kind, command.campaignId, command.accountId, JSON.stringify(command), command.payloadHash, command.status, command.createdAt])
    if (result.rowCount === 1) return { created: true, command }
    const existing = await this.sql.query(`select payload from commands where idempotency_key=$1`, [command.idempotencyKey])
    return { created: false, command: existing.rows[0].payload }
  }

  async listCommands({ campaignId, kind, status, limit = 100 }) {
    const result = await this.sql.query(`select payload from commands where campaign_id=$1 and ($2::text is null or kind=$2) and ($3::text is null or status=$3) order by created_at desc limit $4`, [campaignId, kind ?? null, status ?? null, Math.min(Math.max(limit, 1), 100)])
    return result.rows.map(row => row.payload)
  }

  async updateCommandStatus({ idempotencyKey, expectedStatus, status, reviewedBy, reviewedAt }) {
    const result = await this.sql.query(`update commands set status=$3,payload=jsonb_set(jsonb_set(jsonb_set(payload,'{status}',to_jsonb($3::text)),'{reviewedBy}',to_jsonb($4::text)),'{reviewedAt}',to_jsonb($5::bigint)),updated_at=to_timestamp($5/1000.0) where idempotency_key=$1 and status=$2 returning payload`, [idempotencyKey, expectedStatus, status, reviewedBy, reviewedAt])
    return result.rows[0]?.payload ?? null
  }

  async appendEvent(event) {
    const result = await this.sql.query(`insert into audit_events (campaign_id,event_type,event_hash,data,occurred_at)
      values ($1,$2,$3,$4::jsonb,to_timestamp($5/1000.0)) returning sequence`,
    [event.campaignId, event.type, event.eventHash, JSON.stringify(event.data), event.occurredAt])
    return { ...event, sequence: Number(result.rows[0].sequence) }
  }

  async listEvents({ campaignId, afterSequence = 0, limit = 50 }) {
    const bounded = Math.min(Math.max(limit, 1), 100)
    const result = await this.sql.query(`select sequence,event_type,event_hash,data,extract(epoch from occurred_at)*1000 as occurred_at
      from audit_events where campaign_id=$1 and sequence>$2 order by sequence asc limit $3`, [campaignId, afterSequence, bounded])
    return result.rows.map(row => ({ sequence: Number(row.sequence), campaignId, type: row.event_type, eventHash: row.event_hash, data: row.data, occurredAt: Number(row.occurred_at) }))
  }

  async nextEventSequence() { return 0 }

  async upsertCheckpoint(checkpoint) {
    const result = await this.sql.query(`insert into balance_checkpoints (campaign_id,account_id,period,observed_balance,block_height,block_hash,observed_at,provenance)
      values ($1,$2,$3,$4::numeric,$5::numeric,$6,to_timestamp($7/1000.0),$8::jsonb)
      on conflict (campaign_id,account_id,period) do update set observed_balance=excluded.observed_balance,block_height=excluded.block_height,block_hash=excluded.block_hash,observed_at=excluded.observed_at,provenance=excluded.provenance
      where balance_checkpoints.block_height < excluded.block_height returning *`,
    [checkpoint.campaignId, checkpoint.accountId, checkpoint.period, checkpoint.balance, checkpoint.blockHeight, checkpoint.blockHash, checkpoint.observedAt, JSON.stringify(checkpoint.provenance)])
    return { updated: result.rowCount === 1, checkpoint }
  }
}
