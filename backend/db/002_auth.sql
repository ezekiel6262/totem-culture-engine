begin;

create table auth_challenges (
  nonce text primary key,
  account_id text not null,
  recipient text not null,
  state text not null unique,
  message text not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  check (issued_at < expires_at)
);

create index auth_challenges_active_idx on auth_challenges (expires_at)
where consumed_at is null;

commit;
