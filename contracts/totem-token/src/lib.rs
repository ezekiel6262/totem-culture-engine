use near_contract_standards::fungible_token::{FungibleToken, FungibleTokenCore, FungibleTokenResolver};
use near_contract_standards::fungible_token::metadata::{
    FT_METADATA_SPEC, FungibleTokenMetadata, FungibleTokenMetadataProvider,
};
use near_sdk::collections::{LazyOption, LookupMap};
use near_sdk::json_types::U128;
use near_contract_standards::storage_management::{StorageBalance, StorageBalanceBounds, StorageManagement};
use near_sdk::{AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise, PromiseOrValue, env, log, near, require};

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Token,
    Metadata,
    Locks,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct InitialAllocation {
    pub account_id: AccountId,
    pub amount: U128,
    pub unlock_at_ms: Option<u64>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct TokenLock {
    pub amount: U128,
    pub unlock_at_ms: u64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct TotemToken {
    token: FungibleToken,
    metadata: LazyOption<FungibleTokenMetadata>,
    owner_id: AccountId,
    locks: LookupMap<AccountId, TokenLock>,
}

#[near]
impl TotemToken {
    #[init]
    pub fn new(owner_id: AccountId, total_supply: U128, name: String, symbol: String, decimals: u8, allocations: Vec<InitialAllocation>) -> Self {
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
        require!(!allocations.is_empty() && allocations.len() <= 32, "Initial allocations are required");
        let allocated = allocations.iter().try_fold(0u128, |sum, allocation| sum.checked_add(allocation.amount.0)).expect("Allocation overflow");
        require!(allocated == total_supply.0, "Allocations must equal total supply");
        let mut token = FungibleToken::new(StorageKey::Token);
        let mut locks = LookupMap::new(StorageKey::Locks);
        for allocation in allocations {
            require!(allocation.amount.0 > 0, "Allocation amount must be positive");
            require!(!token.accounts.contains_key(&allocation.account_id), "Duplicate allocation account");
            token.internal_register_account(&allocation.account_id);
            token.internal_deposit(&allocation.account_id, allocation.amount.0);
            if let Some(unlock_at_ms) = allocation.unlock_at_ms {
                require!(unlock_at_ms > env::block_timestamp_ms(), "Lock must end in the future");
                locks.insert(&allocation.account_id, &TokenLock { amount: allocation.amount, unlock_at_ms });
            }
        }
        Self {
            token,
            metadata: LazyOption::new(StorageKey::Metadata, Some(&metadata)),
            owner_id,
            locks,
        }
    }

    pub fn owner_id(&self) -> AccountId {
        self.owner_id.clone()
    }

    pub fn get_lock(&self, account_id: AccountId) -> Option<TokenLock> { self.locks.get(&account_id) }

    pub fn available_native_balance(&self) -> NearToken {
        let required = env::storage_byte_cost().saturating_mul(env::storage_usage().into());
        env::account_balance().saturating_sub(required)
    }

    pub fn withdraw_surplus(&mut self, amount: NearToken, receiver_id: Option<AccountId>) -> Promise {
        require!(env::predecessor_account_id() == self.owner_id, "Only the owner can withdraw surplus");
        require!(amount <= self.available_native_balance(), "Amount exceeds available native balance");
        Promise::new(receiver_id.unwrap_or_else(|| self.owner_id.clone())).transfer(amount)
    }

    fn assert_transferable(&self, account_id: &AccountId, amount: u128) {
        let locked = self.locks.get(account_id).filter(|lock| env::block_timestamp_ms() < lock.unlock_at_ms).map(|lock| lock.amount.0).unwrap_or(0);
        let balance = self.token.accounts.get(account_id).unwrap_or(0);
        require!(balance.saturating_sub(locked) >= amount, "Allocation is still vested");
    }
}

#[near]
impl FungibleTokenCore for TotemToken {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.assert_transferable(&env::predecessor_account_id(), amount.0);
        self.token.ft_transfer(receiver_id, amount, memo)
    }
    #[payable]
    fn ft_transfer_call(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>, msg: String) -> PromiseOrValue<U128> {
        self.assert_transferable(&env::predecessor_account_id(), amount.0);
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
        let account_id = env::predecessor_account_id();
        require!(!self.locks.get(&account_id).is_some_and(|lock| env::block_timestamp_ms() < lock.unlock_at_ms), "Locked allocation cannot unregister");
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
        let supply = 1_000_000_000 * 10u128.pow(18);
        let contract = TotemToken::new(owner.clone(), U128(supply), "Totem".into(), "TOTEM".into(), 18, vec![InitialAllocation { account_id: owner.clone(), amount: U128(supply), unlock_at_ms: None }]);
        assert_eq!(contract.ft_metadata().symbol, "TOTEM");
        assert_eq!(contract.ft_total_supply().0, 1_000_000_000 * 10u128.pow(18));
        assert_eq!(contract.ft_balance_of(owner).0, contract.ft_total_supply().0);
    }


    #[test]
    #[should_panic(expected = "Allocation is still vested")]
    fn locked_allocation_cannot_transfer_before_cliff() {
        let owner = account("owner.testnet");
        let receiver = account("receiver.testnet");
        let unlock_at_ms = 10_000;
        testing_env!(VMContextBuilder::new().predecessor_account_id(owner.clone()).block_timestamp(1_000_000_000).attached_deposit(NearToken::from_yoctonear(1)).build());
        let mut contract = TotemToken::new(owner.clone(), U128(100), "Culture".into(), "CULT".into(), 0, vec![InitialAllocation { account_id: owner, amount: U128(100), unlock_at_ms: Some(unlock_at_ms) }]);
        contract.ft_transfer(receiver, U128(1), None);
    }

    #[test]
    fn allocation_unlocks_after_cliff() {
        let owner = account("owner.testnet");
        let receiver = account("receiver.testnet");
        let unlock_at_ms = 10_000;
        testing_env!(VMContextBuilder::new().predecessor_account_id(owner.clone()).block_timestamp(1_000_000_000).build());
        let mut contract = TotemToken::new(owner.clone(), U128(100), "Culture".into(), "CULT".into(), 0, vec![InitialAllocation { account_id: owner.clone(), amount: U128(100), unlock_at_ms: Some(unlock_at_ms) }]);
        testing_env!(VMContextBuilder::new().predecessor_account_id(owner.clone()).block_timestamp(11_000_000_000).attached_deposit(NearToken::from_yoctonear(1)).build());
        contract.ft_transfer(receiver.clone(), U128(25), None);
        assert_eq!(contract.ft_balance_of(receiver).0, 25);
    }
}
