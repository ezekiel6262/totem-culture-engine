use near_sdk::collections::LookupMap;
use near_sdk::json_types::Base58CryptoHash;
use near_sdk::serde_json::{self, Value};
use near_sdk::{env, ext_contract, near, require, AccountId, BorshStorageKey, CryptoHash, Gas, NearToken, PanicOnDefault, Promise, PromiseError};

const INIT_GAS: Gas = Gas::from_tgas(100);
const CALLBACK_GAS: Gas = Gas::from_tgas(20);

#[derive(BorshStorageKey)]
#[near]
enum StorageKey { Launches }

#[near(serializers=[borsh, json])]
#[derive(Clone, PartialEq)]
pub enum TemplateKind { Token, Nft }

#[near(serializers=[borsh, json])]
#[derive(Clone)]
pub struct LaunchRecord {
    pub creator_id: AccountId,
    pub contract_id: AccountId,
    pub template: TemplateKind,
    pub attached_deposit: NearToken,
    pub instance_deposit: NearToken,
    pub service_fee: NearToken,
    pub status: String,
}

#[ext_contract(ext_self)]
trait FactoryCallbacks {
    fn finish_launch(&mut self, contract_id: AccountId, #[callback_result] result: Result<(), PromiseError>) -> bool;
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct TotemFactory {
    owner_id: AccountId,
    treasury_id: AccountId,
    token_code_hash: Base58CryptoHash,
    nft_code_hash: Base58CryptoHash,
    token_fee: NearToken,
    nft_fee: NearToken,
    launches: LookupMap<AccountId, LaunchRecord>,
}

#[near]
impl TotemFactory {
    #[init]
    pub fn new(owner_id: AccountId, treasury_id: AccountId, token_code_hash: Base58CryptoHash, nft_code_hash: Base58CryptoHash, token_fee: NearToken, nft_fee: NearToken) -> Self {
        require!(!env::state_exists(), "Already initialized");
        Self { owner_id, treasury_id, token_code_hash, nft_code_hash, token_fee, nft_fee, launches: LookupMap::new(StorageKey::Launches) }
    }

    pub fn quote(&self, template: TemplateKind, instance_deposit: NearToken) -> NearToken {
        NearToken::from_yoctonear(instance_deposit.as_yoctonear() + self.fee(&template).as_yoctonear())
    }

    pub fn get_launch(&self, contract_id: AccountId) -> Option<LaunchRecord> { self.launches.get(&contract_id) }

    #[payable]
    pub fn launch(&mut self, slug: String, template: TemplateKind, instance_deposit: NearToken, init_args: String) -> Promise {
        require!(valid_slug(&slug), "Invalid launch slug");
        require!(init_args.len() <= 16_384, "Initialization arguments are too large");
        let creator_id = env::predecessor_account_id();
        let contract_id: AccountId = format!("{}.{}", slug, env::current_account_id()).parse().expect("Invalid derived account");
        require!(self.launches.get(&contract_id).is_none(), "Launch account already reserved");
        let value: Value = serde_json::from_str(&init_args).expect("Initialization arguments must be JSON");
        require!(value.get("owner_id").and_then(Value::as_str) == Some(creator_id.as_str()), "owner_id must match the caller");
        let service_fee = self.fee(&template);
        let attached = env::attached_deposit();
        let required = instance_deposit.as_yoctonear().checked_add(service_fee.as_yoctonear()).expect("Deposit overflow");
        require!(attached.as_yoctonear() >= required, "Attached deposit does not cover launch quote");
        self.launches.insert(&contract_id, &LaunchRecord { creator_id: creator_id.clone(), contract_id: contract_id.clone(), template: template.clone(), attached_deposit: attached, instance_deposit, service_fee, status: "pending".into() });
        let code_hash: CryptoHash = match template { TemplateKind::Token => (&self.token_code_hash).into(), TemplateKind::Nft => (&self.nft_code_hash).into() };
        Promise::new(contract_id.clone())
            .create_account()
            .transfer(instance_deposit)
            .use_global_contract(code_hash)
            .function_call("new", init_args.into_bytes(), NearToken::from_yoctonear(0), INIT_GAS)
            .then(ext_self::ext(env::current_account_id()).with_static_gas(CALLBACK_GAS).finish_launch(contract_id))
    }

    #[private]
    pub fn finish_launch(&mut self, contract_id: AccountId, #[callback_result] result: Result<(), PromiseError>) -> bool {
        let mut record = self.launches.get(&contract_id).expect("Unknown launch callback");
        // The instance transfer may already have executed when a later initialization action fails.
        // Never double-refund it here; reconciliation verifies the child account before recovery.
        let spent = record.instance_deposit.as_yoctonear() + if result.is_ok() { record.service_fee.as_yoctonear() } else { 0 };
        let refund = record.attached_deposit.as_yoctonear().saturating_sub(spent);
        if result.is_ok() {
            record.status = "deployed".into();
            Promise::new(self.treasury_id.clone()).transfer(record.service_fee).detach();
        } else {
            record.status = "failed_recovery_pending".into();
        }
        self.launches.insert(&contract_id, &record);
        if refund > 0 { Promise::new(record.creator_id).transfer(NearToken::from_yoctonear(refund)).detach(); }
        result.is_ok()
    }

    fn fee(&self, template: &TemplateKind) -> NearToken { match template { TemplateKind::Token => self.token_fee, TemplateKind::Nft => self.nft_fee } }
}

fn valid_slug(value: &str) -> bool {
    let bytes=value.as_bytes();
    (2..=32).contains(&bytes.len()) && bytes[0].is_ascii_alphanumeric() && bytes[bytes.len()-1].is_ascii_alphanumeric() && bytes.iter().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || *b==b'-')
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;
    fn account(v:&str)->AccountId{v.parse().unwrap()}
    fn hash()->Base58CryptoHash{Base58CryptoHash::from([7;32])}
    #[test]
    fn quote_keeps_protocol_funding_separate_from_fee(){
        testing_env!(VMContextBuilder::new().current_account_id(account("launch.totem.testnet")).build());
        let factory=TotemFactory::new(account("owner.testnet"),account("treasury.testnet"),hash(),hash(),NearToken::from_near(1),NearToken::from_near(2));
        assert_eq!(factory.quote(TemplateKind::Token,NearToken::from_millinear(100)).as_millinear(),1100);
    }
    #[test]
    fn slug_validation_is_restrictive(){assert!(valid_slug("good-token"));assert!(!valid_slug("Bad_Token"));assert!(!valid_slug("-bad"));}
}
