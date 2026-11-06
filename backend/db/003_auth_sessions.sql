begin;
create table auth_sessions (
  token_hash text primary key,
  account_id text not null,
  public_key text not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check (issued_at < expires_at)
);
create index auth_sessions_account_idx on auth_sessions (account_id, expires_at desc) where revoked_at is null;
commit;
