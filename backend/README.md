# Totem backend

This package is deliberately frontend-independent. It provides the deterministic policy core that a web app, indexer, NEAR contract adapter, or SDK can call.

## Implemented

- Time-weighted balance eligibility with duration enforcement and checkpoint deduplication.
- Ed25519 challenge receipts bound to issuer, wallet, campaign, action, nonce, evidence, provenance, and expiry.
- Single-use nonce protection and deterministic mint idempotency keys.
- Deterministic branching evolution selection.
- Exact basis-point fee routing with smallest-unit remainder handling.
- Versioned Web `Request`/`Response` API handler suitable for a Node.js Function.
- Immutable campaign version hash chains and strict NEAR account/campaign validation.
- Idempotent mint-command preparation with a public append-only audit feed.
- Portable Postgres schema for campaigns, checkpoints, receipts, commands, and audit events.
- NEAR RPC client that pins NEP-141 balance observations to one finalized block hash.
- NEP-413 authentication verifier with Borsh domain separation, state/nonce replay protection, and live full-access-key confirmation.
- Concrete Postgres repository using atomic upserts and conflict-safe command creation.
- Versioned HTTP handlers for campaign creation, eligibility evaluation, idempotent mint preparation, and public audit events.

## Deliberate boundary

`MemoryNonceStore` is test/demo-only. Production must atomically consume nonces and idempotency keys in durable storage or onchain. Checkpoint observations must carry NEAR block height/hash and an indexer provenance record. The contract remains authoritative for minting, evolution, and treasury movement.

## Next adapters

1. Bind the Postgres repository to the selected serverless pool/driver.
2. Add HTTP routes for NEP-413 auth challenge/verification.
3. Add oracle issuer registry and receipt persistence.
4. Rust contracts for campaign registry, identity NFT, and bounded treasury routing.
