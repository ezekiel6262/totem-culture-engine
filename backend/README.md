# Totem backend

This package is deliberately frontend-independent. It provides the deterministic policy core that a web app, indexer, NEAR contract adapter, or SDK can call.

## Implemented

- Time-weighted balance eligibility with duration enforcement and checkpoint deduplication.
- Ed25519 challenge receipts bound to issuer, wallet, campaign, action, nonce, evidence, provenance, and expiry.
- Single-use nonce protection and deterministic mint idempotency keys.
- Deterministic branching evolution selection.
- Exact basis-point fee routing with smallest-unit remainder handling.
- Versioned Web `Request`/`Response` API handler suitable for a Node.js Function.

## Deliberate boundary

`MemoryNonceStore` is test/demo-only. Production must atomically consume nonces and idempotency keys in durable storage or onchain. Checkpoint observations must carry NEAR block height/hash and an indexer provenance record. The contract remains authoritative for minting, evolution, and treasury movement.

## Next adapters

1. Postgres repository with unique constraints for receipts, transitions, and mint commands.
2. NEAR RPC/indexer checkpoint ingestion with finality confirmation.
3. NEP-413 wallet authentication and oracle issuer registry.
4. Rust contracts for campaign registry, identity NFT, and bounded treasury routing.
