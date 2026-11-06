# Architecture and Data Model

## Target NEAR architecture

- `culture_registry`: campaign factory/registry, immutable version hashes, roles, pause state.
- `eligibility_engine`: evaluates checkpoint accumulators and rule DAGs; emits deterministic decisions.
- `identity_nft`: NEP-171 initially; stores compact state root, role, level, active policy version, inventory pointers. A future account-backed model can use subaccounts or NEP-245 where materially useful.
- `router_treasury`: validates exact splits, recipient allowlists, caps, timelocks, pull-payment balances, and failed-transfer recovery.
- `receipt_gateway`: verifies NEP-413-style signed attestations, issuer scope, expiry, campaign/action binding, nonce consumption, and provenance hash.
- Indexer/API: historical balance checkpoints, progress views, metadata rendering, public audit feed. Indexed state is a convenience; contracts remain authoritative for mint/access decisions.
- SDK: TypeScript campaign builder, eligibility reader, receipt submitter, mint/evolve/access helpers, and embeddable progress UI.

## Integration boundary

Real target integrations: NEP-141 balance/calls, NEP-171 NFTs, NEAR RPC, wallet signing, NEP-413 receipts, optional NEAR Intents acquisition link. The current web demo simulates wallet, acquisition, elapsed time, and oracle review. It does not claim mainnet deployment.

## Core records

```text
Campaign { id, creator, mode, subject_contract, rule_root, evolution_root,
  fee_policy_id, oracle_policy_id, version, starts_at, ends_at, status }
Rule { id, kind, params_hash, children[], threshold, version }
Checkpoint { campaign_id, account_id, period, observed_balance, source_height }
Accumulator { campaign_id, account_id, weighted_balance, covered_duration, last_height }
Receipt { issuer, subject, campaign_id, action_id, nonce, issued_at, expires_at,
  evidence_hash, provenance_uri_hash, signature }
Identity { token_id, owner, campaign_id, role, level, state_root, inventory_root,
  utility_status, last_evolved_at }
FeePolicy { destinations[], basis_points[], cap, timelock, version }
Transition { identity_id, from_state, to_state, cause_hash, policy_version, timestamp }
```

## State-transition guarantees

- Mint uses `sha256(campaign_id, account_id, eligibility_epoch)` as an idempotency key.
- Receipts and Intents callbacks consume unique nonces before external calls.
- Evolution is a compare-and-set transition from an expected state root.
- Transfer callbacks follow checks-effects-interactions and reconcile failures.
- Metadata is derived from contract state and versioned asset manifests; oracle-originated events expose issuer and provenance.

## Milestones

1. Hackathon slice: polished deterministic web demo, public spec, rule/economic flow, explicit simulation boundary.
2. Testnet core: Rust registry, eligibility and NFT contracts; NEP-141 checkpoints; wallet; testnet mint/evolution.
3. Attestation and treasury: issuer registry, NEP-413 receipts, replay tests, fee router, audit dashboard.
4. Utility and SDK: gated Signal Arena, templates, embeddable TypeScript SDK, example integration.
5. Hardening: property/fuzz tests, storage/gas limits, independent review, incident runbook, staged mainnet pilot.
