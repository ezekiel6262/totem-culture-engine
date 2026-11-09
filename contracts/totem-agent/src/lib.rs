use near_sdk::collections::{LookupMap, UnorderedSet};
use near_sdk::{env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise};

#[derive(BorshStorageKey)]
#[near]
enum StorageKey { Actions, Recipients, Paid }

#[near(serializers=[borsh, json])]
#[derive(Clone)]
pub struct AgentPolicy {
    pub max_payment: NearToken,
    pub daily_cap: NearToken,
    pub require_allowlisted_recipient: bool,
    pub paused: bool,
}

#[near(serializers=[borsh, json])]
#[derive(Clone)]
pub struct RewardReceipt {
    pub quest_id: String,
    pub action: String,
    pub receiver_id: AccountId,
    pub amount: NearToken,
    pub day: u64,
    pub paid_at_ms: u64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct TotemAgent {
    owner_id: AccountId,
    operator_id: AccountId,
    community_id: String,
    policy: AgentPolicy,
    approved_actions: UnorderedSet<String>,
    approved_recipients: UnorderedSet<AccountId>,
    spent_by_day: LookupMap<u64, NearToken>,
    paid_quests: LookupMap<String, RewardReceipt>,
}

#[near]
impl TotemAgent {
    #[init]
    pub fn new(owner_id: AccountId, operator_id: AccountId, community_id: String, max_payment: NearToken, daily_cap: NearToken, approved_actions: Vec<String>) -> Self {
        require!(!community_id.trim().is_empty() && community_id.len() <= 64, "Invalid community id");
        require!(max_payment.as_yoctonear() > 0 && daily_cap >= max_payment, "Invalid spending limits");
        let mut actions = UnorderedSet::new(StorageKey::Actions);
        for action in approved_actions { require!(valid_action(&action), "Invalid action"); actions.insert(&action); }
        require!(!actions.is_empty(), "At least one action is required");
        Self { owner_id, operator_id, community_id, policy: AgentPolicy { max_payment, daily_cap, require_allowlisted_recipient: false, paused: false }, approved_actions: actions, approved_recipients: UnorderedSet::new(StorageKey::Recipients), spent_by_day: LookupMap::new(StorageKey::Paid), paid_quests: LookupMap::new(b"q") }
    }

    pub fn get_policy(&self) -> AgentPolicy { self.policy.clone() }
    pub fn get_reward(&self, quest_id: String) -> Option<RewardReceipt> { self.paid_quests.get(&quest_id) }
    pub fn available_budget(&self) -> NearToken { env::account_balance().saturating_sub(env::storage_byte_cost().saturating_mul(env::storage_usage().into())) }

    pub fn set_policy(&mut self, max_payment: NearToken, daily_cap: NearToken, require_allowlisted_recipient: bool, paused: bool) {
        self.assert_owner(); require!(max_payment.as_yoctonear() > 0 && daily_cap >= max_payment, "Invalid spending limits");
        self.policy = AgentPolicy { max_payment, daily_cap, require_allowlisted_recipient, paused };
    }
    pub fn set_action(&mut self, action: String, approved: bool) { self.assert_owner(); require!(valid_action(&action), "Invalid action"); if approved { self.approved_actions.insert(&action); } else { self.approved_actions.remove(&action); } }
    pub fn set_recipient(&mut self, account_id: AccountId, approved: bool) { self.assert_owner(); if approved { self.approved_recipients.insert(&account_id); } else { self.approved_recipients.remove(&account_id); } }

    pub fn pay_reward(&mut self, quest_id: String, action: String, receiver_id: AccountId, amount: NearToken) -> Promise {
        require!(env::predecessor_account_id() == self.operator_id, "Operator only");
        require!(!self.policy.paused, "Agent is paused"); require!(valid_quest(&quest_id), "Invalid quest id");
        require!(self.approved_actions.contains(&action), "Action is not approved");
        require!(!self.policy.require_allowlisted_recipient || self.approved_recipients.contains(&receiver_id), "Recipient is not approved");
        require!(amount.as_yoctonear() > 0 && amount <= self.policy.max_payment, "Payment exceeds per-payment cap");
        require!(self.paid_quests.get(&quest_id).is_none(), "Quest reward already paid");
        let day = env::block_timestamp_ms() / 86_400_000;
        let spent = self.spent_by_day.get(&day).unwrap_or(NearToken::from_yoctonear(0));
        let next = NearToken::from_yoctonear(spent.as_yoctonear().checked_add(amount.as_yoctonear()).expect("Spend overflow"));
        require!(next <= self.policy.daily_cap, "Daily spending cap exceeded"); require!(amount <= self.available_budget(), "Insufficient safe treasury balance");
        let receipt = RewardReceipt { quest_id: quest_id.clone(), action, receiver_id: receiver_id.clone(), amount, day, paid_at_ms: env::block_timestamp_ms() };
        self.spent_by_day.insert(&day, &next); self.paid_quests.insert(&quest_id, &receipt);
        Promise::new(receiver_id).transfer(amount)
    }
    fn assert_owner(&self) { require!(env::predecessor_account_id() == self.owner_id, "Owner only") }
}

fn valid_action(value:&str)->bool { matches!(value,"quest_reward"|"creator_reward"|"market_sponsorship"|"season_bounty") }
fn valid_quest(value:&str)->bool { !value.trim().is_empty() && value.len() <= 96 }

#[cfg(test)]
mod tests {
    use super::*; use near_sdk::test_utils::VMContextBuilder; use near_sdk::testing_env;
    fn a(v:&str)->AccountId{v.parse().unwrap()}
    fn context(predecessor:&AccountId, balance:NearToken, ms:u64){testing_env!(VMContextBuilder::new().current_account_id(a("agent.testnet")).predecessor_account_id(predecessor.clone()).account_balance(balance).block_timestamp(ms*1_000_000).build())}
    fn agent()->TotemAgent{TotemAgent::new(a("owner.testnet"),a("operator.testnet"),"totem".into(),NearToken::from_near(1),NearToken::from_near(2),vec!["quest_reward".into()])}
    #[test] fn records_bounded_reward(){let op=a("operator.testnet");context(&op,NearToken::from_near(10),1_000);let mut c=agent();c.pay_reward("q1".into(),"quest_reward".into(),a("alice.testnet"),NearToken::from_millinear(500));assert!(c.get_reward("q1".into()).is_some());}
    #[test] #[should_panic(expected="Payment exceeds per-payment cap")] fn rejects_large_payment(){let op=a("operator.testnet");context(&op,NearToken::from_near(10),1_000);agent().pay_reward("q1".into(),"quest_reward".into(),a("alice.testnet"),NearToken::from_near(2));}
}
