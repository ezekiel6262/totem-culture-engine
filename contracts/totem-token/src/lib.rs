use near_contract_standards::fungible_token::{FungibleToken, FungibleTokenCore, FungibleTokenResolver};
use near_contract_standards::fungible_token::metadata::{
    FT_METADATA_SPEC, FungibleTokenMetadata, FungibleTokenMetadataProvider,
};
use near_sdk::collections::LazyOption;
use near_sdk::json_types::U128;
use near_contract_standards::storage_management::{StorageBalance, StorageBalanceBounds, StorageManagement};
use near_sdk::{AccountId, BorshStorageKey, NearToken, PanicOnDefault, PromiseOrValue, log, near};

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Token,
    Metadata,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct TotemToken {
    token: FungibleToken,
    metadata: LazyOption<FungibleTokenMetadata>,
    owner_id: AccountId,
}

#[near]
impl TotemToken {
    #[init]
    pub fn new(owner_id: AccountId, total_supply: U128, name: String, symbol: String, decimals: u8) -> Self {
        let metadata = FungibleTokenMetadata {
            spec: FT_METADATA_SPEC.to_string(),
            name,
            symbol,
            icon: None,
            reference: None,
            reference_hash: None,
            decimals,
        };
        metadata.assert_valid();
        let mut token = FungibleToken::new(StorageKey::Token);
        token.internal_register_account(&owner_id);
        token.internal_deposit(&owner_id, total_supply.0);
        Self {
            token,
            metadata: LazyOption::new(StorageKey::Metadata, Some(&metadata)),
            owner_id,
        }
    }

    pub fn owner_id(&self) -> AccountId {
        self.owner_id.clone()
    }
}

#[near]
impl FungibleTokenCore for TotemToken {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.token.ft_transfer(receiver_id, amount, memo)
    }
    #[payable]
    fn ft_transfer_call(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>, msg: String) -> PromiseOrValue<U128> {
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }
    fn ft_total_supply(&self) -> U128 { self.token.ft_total_supply() }
    fn ft_balance_of(&self, account_id: AccountId) -> U128 { self.token.ft_balance_of(account_id) }
}

#[near]
impl FungibleTokenResolver for TotemToken {
    #[private]
    fn ft_resolve_transfer(&mut self, sender_id: AccountId, receiver_id: AccountId, amount: U128) -> U128 {
        let (used, burned) = self.token.internal_ft_resolve_transfer(&sender_id, receiver_id, amount);
        if burned > 0 { log!("Account @{} burned {}", sender_id, burned); }
        used.into()
    }
}

#[near]
impl StorageManagement for TotemToken {
    #[payable]
    fn storage_deposit(&mut self, account_id: Option<AccountId>, registration_only: Option<bool>) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }
    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance { self.token.storage_withdraw(amount) }
    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        if let Some((account_id, balance)) = self.token.internal_storage_unregister(force) {
            log!("Closed @{} with {}", account_id, balance);
            true
        } else { false }
    }
    fn storage_balance_bounds(&self) -> StorageBalanceBounds { self.token.storage_balance_bounds() }
    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> { self.token.storage_balance_of(account_id) }
}

#[near]
impl FungibleTokenMetadataProvider for TotemToken {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        self.metadata.get().unwrap()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_contract_standards::fungible_token::core::FungibleTokenCore;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    fn account(value: &str) -> AccountId { value.parse().unwrap() }

    #[test]
    fn initializes_fixed_supply_and_metadata() {
        let owner = account("owner.testnet");
        testing_env!(VMContextBuilder::new().predecessor_account_id(owner.clone()).build());
        let contract = TotemToken::new(owner.clone(), U128(1_000_000_000 * 10u128.pow(18)), "Totem".into(), "TOTEM".into(), 18);
        assert_eq!(contract.ft_metadata().symbol, "TOTEM");
        assert_eq!(contract.ft_total_supply().0, 1_000_000_000 * 10u128.pow(18));
        assert_eq!(contract.ft_balance_of(owner).0, contract.ft_total_supply().0);
    }
}
