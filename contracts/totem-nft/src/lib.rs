use near_contract_standards::non_fungible_token::metadata::{
    NFT_METADATA_SPEC, NonFungibleTokenMetadataProvider, NFTContractMetadata, TokenMetadata,
};
use near_contract_standards::non_fungible_token::{
    NonFungibleToken, NonFungibleTokenApproval,
    NonFungibleTokenEnumeration, NonFungibleTokenResolver, Token, TokenId,
};
use near_contract_standards::non_fungible_token::core::NonFungibleTokenCore;
use near_sdk::collections::{LazyOption, LookupMap};
use near_sdk::json_types::U128;
use near_sdk::{AccountId, BorshStorageKey, PanicOnDefault, Promise, PromiseOrValue, env, near, require};
use std::collections::HashMap;

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Tokens,
    TokenMetadata,
    Enumeration,
    Approval,
    ContractMetadata,
    Eligibility,
    TokenByOwner,
    Evolution,
    Votes,
    Tallies,
    Inventory,
    Credentials,
    ArenaRecords,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct EligibilityPermit {
    pub branch: String,
    pub expires_at_ms: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, PartialEq, Debug)]
pub struct Evolution {
    pub branch: String,
    pub tier: u8,
    pub frozen: bool,
}

#[near(serializers = [json])]
pub struct VoteTally {
    pub yes: u64,
    pub no: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Default)]
pub struct ArenaRecord {
    pub points: u64,
    pub wins: u32,
    pub seasons: u32,
}

#[near(serializers = [json])]
pub struct CultureAccount {
    pub token_id: TokenId,
    pub owner_id: AccountId,
    pub evolution: Evolution,
    pub inventory: Vec<String>,
    pub credentials: Vec<String>,
    pub arena: ArenaRecord,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct TotemNft {
    tokens: NonFungibleToken,
    metadata: LazyOption<NFTContractMetadata>,
    owner_id: AccountId,
    eligibility: LookupMap<AccountId, EligibilityPermit>,
    token_by_owner: LookupMap<AccountId, TokenId>,
    evolution: LookupMap<TokenId, Evolution>,
    votes: LookupMap<String, bool>,
    tallies: LookupMap<String, (u64, u64)>,
    inventory: LookupMap<TokenId, Vec<String>>,
    credentials: LookupMap<AccountId, Vec<String>>,
    arena_records: LookupMap<TokenId, ArenaRecord>,
    next_token_id: u64,
}

#[near]
impl TotemNft {
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        let metadata = NFTContractMetadata {
            spec: NFT_METADATA_SPEC.to_string(),
            name: "Totem Culture Identity".to_string(),
            symbol: "TOTEM".to_string(),
            icon: None,
            base_uri: None,
            reference: None,
            reference_hash: None,
        };
        metadata.assert_valid();
        Self {
            tokens: NonFungibleToken::new(
                StorageKey::Tokens,
                owner_id.clone(),
                Some(StorageKey::TokenMetadata),
                Some(StorageKey::Enumeration),
                Some(StorageKey::Approval),
            ),
            metadata: LazyOption::new(StorageKey::ContractMetadata, Some(&metadata)),
            owner_id,
            eligibility: LookupMap::new(StorageKey::Eligibility),
            token_by_owner: LookupMap::new(StorageKey::TokenByOwner),
            evolution: LookupMap::new(StorageKey::Evolution),
            votes: LookupMap::new(StorageKey::Votes),
            tallies: LookupMap::new(StorageKey::Tallies),
            inventory: LookupMap::new(StorageKey::Inventory),
            credentials: LookupMap::new(StorageKey::Credentials),
            arena_records: LookupMap::new(StorageKey::ArenaRecords),
            next_token_id: 1,
        }
    }

    pub fn approve_eligibility(&mut self, account_id: AccountId, branch: String, expires_at_ms: u64) {
        self.assert_owner();
        require!(Self::valid_branch(&branch), "Unsupported evolution branch");
        require!(expires_at_ms > env::block_timestamp_ms(), "Eligibility must expire in the future");
        self.eligibility.insert(&account_id, &EligibilityPermit { branch, expires_at_ms });
    }

    #[payable]
    pub fn mint(&mut self) -> Token {
        let receiver_id = env::predecessor_account_id();
        require!(self.token_by_owner.get(&receiver_id).is_none(), "One Totem per account");
        let permit = self.eligibility.get(&receiver_id).expect("Eligibility approval required");
        require!(permit.expires_at_ms >= env::block_timestamp_ms(), "Eligibility approval expired");
        let token_id = self.next_token_id.to_string();
        self.next_token_id += 1;
        let metadata = TokenMetadata {
            title: Some(format!("Totem #{}", token_id)),
            description: Some(format!("Evolving culture identity · {}", permit.branch)),
            media: None,
            media_hash: None,
            copies: Some(1),
            issued_at: Some(env::block_timestamp_ms().to_string()),
            expires_at: None,
            starts_at: None,
            updated_at: None,
            extra: Some(format!("{{\"branch\":\"{}\",\"tier\":1}}", permit.branch)),
            reference: None,
            reference_hash: None,
        };
        let token = self.tokens.internal_mint_with_refund(
            token_id.clone(), receiver_id.clone(), Some(metadata), None,
        );
        self.token_by_owner.insert(&receiver_id, &token_id);
        self.evolution.insert(&token_id, &Evolution { branch: permit.branch, tier: 1, frozen: false });
        self.inventory.insert(&token_id, &Vec::new());
        self.arena_records.insert(&token_id, &ArenaRecord::default());
        self.eligibility.remove(&receiver_id);
        token
    }

    pub fn evolve(&mut self, token_id: TokenId, branch: String, tier: u8) -> Evolution {
        self.assert_token_owner(&token_id);
        require!(Self::valid_branch(&branch), "Unsupported evolution branch");
        require!((1..=3).contains(&tier), "Tier must be between 1 and 3");
        let current = self.evolution.get(&token_id).expect("Evolution state missing");
        require!(!current.frozen, "Frozen Totems cannot evolve");
        require!(tier >= current.tier, "Evolution tier cannot decrease");
        let next = Evolution { branch, tier, frozen: false };
        self.evolution.insert(&token_id, &next);
        next
    }

    pub fn freeze(&mut self, token_id: TokenId) -> Evolution {
        self.assert_token_owner(&token_id);
        let mut state = self.evolution.get(&token_id).expect("Evolution state missing");
        state.frozen = true;
        self.evolution.insert(&token_id, &state);
        state
    }

    pub fn vote(&mut self, proposal_id: String, token_id: TokenId, choice: String) -> VoteTally {
        self.assert_token_owner(&token_id);
        require!(choice == "yes" || choice == "no", "Choice must be yes or no");
        let state = self.evolution.get(&token_id).expect("Evolution state missing");
        require!(!state.frozen, "Frozen Totems have no voting weight");
        let key = format!("{}:{}", proposal_id, token_id);
        require!(self.votes.get(&key).is_none(), "Token already voted on this proposal");
        let (mut yes, mut no) = self.tallies.get(&proposal_id).unwrap_or((0, 0));
        let weight = state.tier as u64;
        if choice == "yes" { yes += weight } else { no += weight }
        self.votes.insert(&key, &true);
        self.tallies.insert(&proposal_id, &(yes, no));
        VoteTally { yes, no }
    }

    pub fn get_evolution(&self, token_id: TokenId) -> Option<Evolution> { self.evolution.get(&token_id) }
    pub fn get_token_for_owner(&self, account_id: AccountId) -> Option<TokenId> { self.token_by_owner.get(&account_id) }
    pub fn get_tally(&self, proposal_id: String) -> VoteTally {
        let (yes, no) = self.tallies.get(&proposal_id).unwrap_or((0, 0));
        VoteTally { yes, no }
    }

    pub fn award_inventory(&mut self, token_id: TokenId, item: String) -> Vec<String> {
        self.assert_owner();
        require!(self.tokens.owner_by_id.get(&token_id).is_some(), "Token not found");
        require!(!item.trim().is_empty() && item.len() <= 64, "Invalid inventory item");
        let mut items = self.inventory.get(&token_id).unwrap_or_default();
        require!(items.len() < 32, "Inventory is full");
        require!(!items.contains(&item), "Inventory item already awarded");
        items.push(item);
        self.inventory.insert(&token_id, &items);
        items
    }

    pub fn grant_credential(&mut self, account_id: AccountId, credential: String) -> Vec<String> {
        self.assert_owner();
        require!(!credential.trim().is_empty() && credential.len() <= 64, "Invalid credential");
        let mut credentials = self.credentials.get(&account_id).unwrap_or_default();
        require!(credentials.len() < 32, "Credential list is full");
        require!(!credentials.contains(&credential), "Credential already granted");
        credentials.push(credential);
        self.credentials.insert(&account_id, &credentials);
        credentials
    }

    pub fn record_arena_result(&mut self, token_id: TokenId, points: u64, won: bool) -> ArenaRecord {
        self.assert_owner();
        require!(self.tokens.owner_by_id.get(&token_id).is_some(), "Token not found");
        let mut record = self.arena_records.get(&token_id).unwrap_or_default();
        record.points = record.points.checked_add(points).expect("Arena points overflow");
        record.seasons = record.seasons.checked_add(1).expect("Arena seasons overflow");
        if won { record.wins = record.wins.checked_add(1).expect("Arena wins overflow"); }
        self.arena_records.insert(&token_id, &record);
        record
    }

    pub fn get_culture_account(&self, token_id: TokenId) -> Option<CultureAccount> {
        let owner_id = self.tokens.owner_by_id.get(&token_id)?;
        Some(CultureAccount {
            token_id: token_id.clone(),
            owner_id: owner_id.clone(),
            evolution: self.evolution.get(&token_id)?,
            inventory: self.inventory.get(&token_id).unwrap_or_default(),
            credentials: self.credentials.get(&owner_id).unwrap_or_default(),
            arena: self.arena_records.get(&token_id).unwrap_or_default(),
        })
    }

    fn assert_owner(&self) { require!(env::predecessor_account_id() == self.owner_id, "Owner only") }
    fn assert_token_owner(&self, token_id: &TokenId) {
        require!(self.tokens.owner_by_id.get(token_id) == Some(env::predecessor_account_id()), "Token owner only")
    }
    fn valid_branch(branch: &str) -> bool {
        matches!(branch, "diamond-holder" | "liquidity-guardian" | "meme-commander" | "community-builder")
    }
}

#[near]
impl NonFungibleTokenCore for TotemNft {
    #[payable]
    fn nft_transfer(&mut self, receiver_id: AccountId, token_id: TokenId, approval_id: Option<u64>, memo: Option<String>) {
        require!(self.token_by_owner.get(&receiver_id).is_none(), "One Totem per account");
        let previous_owner = self.tokens.owner_by_id.get(&token_id).expect("Token not found");
        self.tokens.nft_transfer(receiver_id.clone(), token_id.clone(), approval_id, memo);
        self.token_by_owner.remove(&previous_owner);
        self.token_by_owner.insert(&receiver_id, &token_id);
    }

    #[payable]
    fn nft_transfer_call(&mut self, receiver_id: AccountId, token_id: TokenId, approval_id: Option<u64>, memo: Option<String>, msg: String) -> PromiseOrValue<bool> {
        require!(self.token_by_owner.get(&receiver_id).is_none(), "One Totem per account");
        let previous_owner = self.tokens.owner_by_id.get(&token_id).expect("Token not found");
        let result = self.tokens.nft_transfer_call(receiver_id.clone(), token_id.clone(), approval_id, memo, msg);
        self.token_by_owner.remove(&previous_owner);
        self.token_by_owner.insert(&receiver_id, &token_id);
        result
    }

    fn nft_token(&self, token_id: TokenId) -> Option<Token> { self.tokens.nft_token(token_id) }
}

#[near]
impl NonFungibleTokenResolver for TotemNft {
    #[private]
    fn nft_resolve_transfer(&mut self, previous_owner_id: AccountId, receiver_id: AccountId, token_id: TokenId, approved_account_ids: Option<HashMap<AccountId, u64>>) -> bool {
        let kept = self.tokens.nft_resolve_transfer(previous_owner_id.clone(), receiver_id.clone(), token_id.clone(), approved_account_ids);
        self.token_by_owner.remove(&previous_owner_id);
        self.token_by_owner.remove(&receiver_id);
        if let Some(final_owner) = self.tokens.owner_by_id.get(&token_id) {
            self.token_by_owner.insert(&final_owner, &token_id);
        }
        kept
    }
}

#[near]
impl NonFungibleTokenApproval for TotemNft {
    #[payable]
    fn nft_approve(&mut self, token_id: TokenId, account_id: AccountId, msg: Option<String>) -> Option<Promise> {
        self.tokens.nft_approve(token_id, account_id, msg)
    }
    #[payable]
    fn nft_revoke(&mut self, token_id: TokenId, account_id: AccountId) { self.tokens.nft_revoke(token_id, account_id) }
    #[payable]
    fn nft_revoke_all(&mut self, token_id: TokenId) { self.tokens.nft_revoke_all(token_id) }
    fn nft_is_approved(&self, token_id: TokenId, approved_account_id: AccountId, approval_id: Option<u64>) -> bool {
        self.tokens.nft_is_approved(token_id, approved_account_id, approval_id)
    }
}

#[near]
impl NonFungibleTokenEnumeration for TotemNft {
    fn nft_total_supply(&self) -> U128 { self.tokens.nft_total_supply() }
    fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> { self.tokens.nft_tokens(from_index, limit) }
    fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 { self.tokens.nft_supply_for_owner(account_id) }
    fn nft_tokens_for_owner(&self, account_id: AccountId, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.tokens.nft_tokens_for_owner(account_id, from_index, limit)
    }
}

#[near]
impl NonFungibleTokenMetadataProvider for TotemNft {
    fn nft_metadata(&self) -> NFTContractMetadata { self.metadata.get().unwrap() }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::NearToken;
    use near_sdk::testing_env;

    fn account(value: &str) -> AccountId { value.parse().unwrap() }
    fn context(predecessor: &AccountId, deposit: NearToken, timestamp_ms: u64) {
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(predecessor.clone())
            .attached_deposit(deposit)
            .block_timestamp(timestamp_ms * 1_000_000)
            .build());
    }

    #[test]
    fn eligibility_mint_evolution_and_weighted_vote() {
        let owner = account("owner.testnet");
        let alice = account("alice.testnet");
        context(&owner, NearToken::from_near(0), 1_000);
        let mut contract = TotemNft::new(owner.clone());
        contract.approve_eligibility(alice.clone(), "meme-commander".into(), 10_000);
        context(&alice, NearToken::from_near(1), 2_000);
        let token = contract.mint();
        assert_eq!(contract.get_token_for_owner(alice.clone()), Some(token.token_id.clone()));
        let evolved = contract.evolve(token.token_id.clone(), "community-builder".into(), 3);
        assert_eq!(evolved.tier, 3);
        let tally = contract.vote("season-1".into(), token.token_id.clone(), "yes".into());
        assert_eq!(tally.yes, 3);
    }

    #[test]
    #[should_panic(expected = "One Totem per account")]
    fn enforces_one_totem_per_account() {
        let owner = account("owner.testnet");
        let alice = account("alice.testnet");
        context(&owner, NearToken::from_near(0), 1_000);
        let mut contract = TotemNft::new(owner.clone());
        contract.approve_eligibility(alice.clone(), "diamond-holder".into(), 10_000);
        context(&alice, NearToken::from_near(1), 2_000);
        contract.mint();
        context(&owner, NearToken::from_near(0), 3_000);
        contract.approve_eligibility(alice.clone(), "diamond-holder".into(), 10_000);
        context(&alice, NearToken::from_near(1), 4_000);
        contract.mint();
    }

    #[test]
    #[should_panic(expected = "Frozen Totems have no voting weight")]
    fn frozen_totem_cannot_vote() {
        let owner = account("owner.testnet");
        let alice = account("alice.testnet");
        context(&owner, NearToken::from_near(0), 1_000);
        let mut contract = TotemNft::new(owner.clone());
        contract.approve_eligibility(alice.clone(), "diamond-holder".into(), 10_000);
        context(&alice, NearToken::from_near(1), 2_000);
        let token = contract.mint();
        contract.freeze(token.token_id.clone());
        contract.vote("season-1".into(), token.token_id, "yes".into());
    }

    #[test]
    fn culture_account_separates_transferable_inventory_from_owner_credentials() {
        let owner = account("owner.testnet");
        let alice = account("alice.testnet");
        let bob = account("bob.testnet");
        context(&owner, NearToken::from_near(0), 1_000);
        let mut contract = TotemNft::new(owner.clone());
        contract.approve_eligibility(alice.clone(), "meme-commander".into(), 10_000);
        context(&alice, NearToken::from_near(1), 2_000);
        let token = contract.mint();
        context(&owner, NearToken::from_near(0), 3_000);
        contract.award_inventory(token.token_id.clone(), "season-1-trophy".into());
        contract.grant_credential(alice.clone(), "founding-member".into());
        let arena = contract.record_arena_result(token.token_id.clone(), 240, true);
        assert_eq!(arena.wins, 1);
        let before = contract.get_culture_account(token.token_id.clone()).unwrap();
        assert_eq!(before.inventory, vec!["season-1-trophy"]);
        assert_eq!(before.credentials, vec!["founding-member"]);

        context(&alice, NearToken::from_yoctonear(1), 4_000);
        contract.nft_transfer(bob.clone(), token.token_id.clone(), None, None);
        let after = contract.get_culture_account(token.token_id).unwrap();
        assert_eq!(after.owner_id, bob);
        assert_eq!(after.inventory, vec!["season-1-trophy"]);
        assert!(after.credentials.is_empty());
        assert_eq!(after.arena.points, 240);
    }
}
