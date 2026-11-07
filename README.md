# Totem

**Pair a token with a living NFT culture—or turn an NFT culture into a programmable economy.**

Totem is a programmable culture engine for NEAR. Any community can connect or launch a memecoin and NFT collection as one **Culture Pair** with shared rules, treasury, Rites, Arena seasons, social identity, access, credentials, inventory, and gameplay. `$TOTEM` and its Totem collection are the flagship example—not the platform boundary.

## Why it is different

Totem works in both directions: token → NFT culture, NFT culture → token, or a twin launch. Its differentiator is ownership with behavior: anti-snapshot eligibility, programmable Culture Accounts, provenance-bound Rites, branching evolution, Arena economies, social-money coordination, gated utility, and auditable treasury routing.

## Run locally

Serve `dist/` with any static server, for example `npx serve dist`.

The current vertical slice is intentionally deterministic and client-side. Token acquisition, elapsed time, and oracle approval are clearly labeled simulations. The rule transitions, replay/idempotency model, evolution branches, fee math, and gated experience are represented faithfully for the demo.

See [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Backend

The backend core lives in `backend/`. It currently provides deterministic domain services and a versioned Web API handler without coupling to any frontend or database vendor.

```powershell
npm test
npm run backend:demo
```
