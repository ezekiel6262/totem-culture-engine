# Threat Model

| Threat | Control |
|---|---|
| Flash borrow / snapshot gaming | Rolling checkpoints, minimum covered duration, time-weighted accumulator, finality delay, discontinuity handling. |
| Sybil farming | Per-campaign issuance caps, account age/optional personhood signals, stake or reputation thresholds where appropriate, graph/rate heuristics, manual appeals. Never claim perfect Sybil resistance. |
| Forged social or event proof | Scoped issuer keys, provenance hashes, expiry, subject/campaign/action binding, issuer rotation and revocation. |
| Receipt replay / duplicate mint | Consumed nonce set plus deterministic mint idempotency key. |
| Malicious creator change | Immutable active policy versions; timelocked successor versions; participant-visible diffs; opt-out before activation. |
| Treasury drain | Fixed/allowlisted destinations, per-epoch caps, pull payments, timelock, multisig/DAO authority, no arbitrary calls. |
| Oracle manipulation | Published issuer registry, quorum for high-impact events, provenance, challenge window, emergency freeze limited to new transitions. |
| NFT seizure or utility rug | Ownership cannot be revoked by eligibility failure; utility state is separate, explicit, and recoverable after grace/requalification. |
| Callback/reentrancy failure | Checks-effects-interactions, private callbacks, promise-result validation, bounded gas, reconciliation state. |
| Storage/gas griefing | Deposits, record caps, pagination, bounded rule depth/fanout, pruning and archival policy. |
| Admin compromise | Least-privilege roles, hardware-backed multisig, rotation, delay, public logs, guardian can pause but not redirect funds. |
| Game manipulation | Deterministic resolution, commitment/reveal where secrecy matters, no paid random outcomes in MVP. |

Emergency controls pause new campaign registration, receipt acceptance, mint, evolution, or routing independently. They cannot transfer user assets. Recovery requires role-separated approval and produces a public incident record.
