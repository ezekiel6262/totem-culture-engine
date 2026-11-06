begin;

create table campaigns (
  id text primary key,
  creator_account_id text not null,
  subject_contract_id text not null,
  mode text not null check (mode in ('token_first', 'nft_first', 'event_first')),
  latest_version integer not null check (latest_version > 0),
  status text not null check (status in ('draft', 'active', 'paused', 'ended')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at < ends_at)
);

create table campaign_versions (
  campaign_id text not null references campaigns(id) on delete restrict,
  version integer not null check (version > 0),
  version_hash text not null check (length(version_hash) = 64),
  previous_version_hash text check (previous_version_hash is null or length(previous_version_hash) = 64),
  policy jsonb not null,
  created_at timestamptz not null default now(),
  primary key (campaign_id, version),
  unique (version_hash)
);

create index campaign_versions_campaign_created_idx on campaign_versions (campaign_id, created_at desc);

create table balance_checkpoints (
  id bigint generated always as identity primary key,
  campaign_id text not null references campaigns(id) on delete restrict,
  account_id text not null,
  period text not null,
  observed_balance numeric(40,0) not null check (observed_balance >= 0),
  block_height numeric(20,0) not null check (block_height > 0),
  block_hash text not null,
  observed_at timestamptz not null,
  provenance jsonb not null,
  created_at timestamptz not null default now(),
  unique (campaign_id, account_id, period)
);

create index balance_checkpoints_lookup_idx on balance_checkpoints (campaign_id, account_id, observed_at desc);

create table consumed_receipts (
  receipt_hash text primary key check (length(receipt_hash) = 64),
  issuer_id text not null,
  nonce text not null,
  campaign_id text not null references campaigns(id) on delete restrict,
  subject_account_id text not null,
  action_id text not null,
  evidence_hash text not null check (length(evidence_hash) = 64),
  expires_at timestamptz not null,
  consumed_at timestamptz not null default now(),
  unique (issuer_id, nonce)
);

create index consumed_receipts_subject_idx on consumed_receipts (campaign_id, subject_account_id, consumed_at desc);

create table commands (
  id bigint generated always as identity primary key,
  idempotency_key text not null unique check (length(idempotency_key) = 64),
  kind text not null check (kind in ('mint_identity', 'evolve_identity', 'route_fee')),
  campaign_id text not null references campaigns(id) on delete restrict,
  account_id text not null,
  payload jsonb not null,
  payload_hash text not null check (length(payload_hash) = 64),
  status text not null default 'pending' check (status in ('pending', 'submitted', 'confirmed', 'failed', 'cancelled')),
  chain_transaction_hash text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index commands_pending_idx on commands (created_at, id) where status = 'pending';
create index commands_account_idx on commands (campaign_id, account_id, created_at desc);

create table audit_events (
  sequence bigint generated always as identity primary key,
  campaign_id text not null references campaigns(id) on delete restrict,
  event_type text not null,
  event_hash text not null unique check (length(event_hash) = 64),
  data jsonb not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index audit_events_feed_idx on audit_events (campaign_id, sequence);

commit;
