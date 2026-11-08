# Totem NEAR contracts

This workspace contains the fixed-supply `$TOTEM` NEP-141 token and the evolving Totem identity NEP-171 NFT. Both use `near-sdk` 5.30.1 and Rust 1.95.

## Build and verify

```powershell
rustup target add wasm32-unknown-unknown
npm run test:contracts
npm run build:contracts
```

Release artifacts are copied into `contracts/artifacts/`. Verify them before deployment:

```powershell
Get-FileHash contracts/artifacts/*.wasm -Algorithm SHA256
```

## Testnet deployment

Use two dedicated testnet accounts. Replace the example account names below with accounts controlled by the project owner.

```powershell
near contract deploy token.totem.testnet use-file contracts/artifacts/totem_token.wasm with-init-call new json-args '{"owner_id":"totem.testnet","total_supply":"1000000000000000000000000000","name":"Totem","symbol":"TOTEM","decimals":18,"allocations":[{"account_id":"community.totem.testnet","amount":"400000000000000000000000000","unlock_at_ms":null},{"account_id":"liquidity.totem.testnet","amount":"250000000000000000000000000","unlock_at_ms":null},{"account_id":"treasury.totem.testnet","amount":"200000000000000000000000000","unlock_at_ms":null},{"account_id":"creator.totem.testnet","amount":"150000000000000000000000000","unlock_at_ms":1798761600000}]}' prepaid-gas '100 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send
near contract deploy nft.totem.testnet use-file contracts/artifacts/totem_nft.wasm with-init-call new json-args '{"owner_id":"totem.testnet","name":"Totem Culture Identity","symbol":"TOTEM","base_uri":null,"max_supply":10000,"mint_price":"2000000000000000000000000","primary_sale_receiver_id":"treasury.totem.testnet","creator_royalty_bps":500,"creator_royalty_receiver_id":"totem.testnet","treasury_royalty_bps":250,"treasury_royalty_receiver_id":"treasury.totem.testnet"}' prepaid-gas '100 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send
```

The NFT mint flow intentionally requires two signatures:

1. The contract owner calls `approve_eligibility` using the operator transaction returned by `/api/v1/mints/prepare`.
2. The eligible member signs the returned `memberMint` transaction in their own wallet.

Set `TOTEM_TOKEN_CONTRACT_ID` and `TOTEM_NFT_CONTRACT_ID` to the deployed accounts before publishing the backend/frontend configuration.

