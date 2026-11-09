use near_sdk::collections::UnorderedMap;
use near_sdk::json_types::U128;
use near_sdk::{env, ext_contract, near, require, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseError};
use std::collections::HashMap;

const NFT_GAS: Gas = Gas::from_tgas(35);
const CALLBACK_GAS: Gas = Gas::from_tgas(25);

#[derive(BorshStorageKey)] #[near] enum StorageKey { Listings }

#[near(serializers=[borsh, json])] #[derive(Clone)]
pub struct Listing { pub id:String, pub nft_contract_id:AccountId, pub token_id:String, pub seller_id:AccountId, pub approval_id:u64, pub price:NearToken, pub created_at_ms:u64 }
#[near(serializers=[json])] pub struct Payout { pub payout:HashMap<AccountId,U128> }

#[ext_contract(ext_nft)] trait Nft { fn nft_transfer_payout(&mut self, receiver_id:AccountId, token_id:String, approval_id:Option<u64>, memo:Option<String>, balance:U128, max_len_payout:Option<u32>) -> Payout; }
#[ext_contract(ext_self)] trait Callbacks { fn settle(&mut self, listing:Listing, buyer_id:AccountId, #[callback_result] result:Result<Payout,PromiseError>) -> bool; }

#[near(contract_state)] #[derive(PanicOnDefault)]
pub struct TotemMarket { owner_id:AccountId, fee_receiver_id:AccountId, fee_bps:u16, listings:UnorderedMap<String,Listing> }

#[near]
impl TotemMarket {
    #[init] pub fn new(owner_id:AccountId, fee_receiver_id:AccountId, fee_bps:u16)->Self{require!(fee_bps<=500,"Fee exceeds 5%");Self{owner_id,fee_receiver_id,fee_bps,listings:UnorderedMap::new(StorageKey::Listings)}}
    pub fn get_listing(&self,id:String)->Option<Listing>{self.listings.get(&id)}
    pub fn listings(&self,from_index:Option<U128>,limit:Option<u64>)->Vec<Listing>{let start=from_index.unwrap_or(U128(0)).0 as usize;self.listings.values().skip(start).take(limit.unwrap_or(50).min(100) as usize).collect()}
    #[payable] pub fn list(&mut self,nft_contract_id:AccountId,token_id:String,approval_id:u64,price:NearToken)->Listing{
        require!(price.as_yoctonear()>0,"Price must be positive");require!(!token_id.trim().is_empty()&&token_id.len()<=128,"Invalid token id");let seller_id=env::predecessor_account_id();let id=format!("{}:{}",nft_contract_id,token_id);require!(self.listings.get(&id).is_none(),"Already listed");
        let before=env::storage_usage();let listing=Listing{id:id.clone(),nft_contract_id,token_id,seller_id,approval_id,price,created_at_ms:env::block_timestamp_ms()};self.listings.insert(&id,&listing);let cost=env::storage_byte_cost().saturating_mul(env::storage_usage().saturating_sub(before).into());require!(env::attached_deposit()>=cost,"Attach storage deposit");let refund=env::attached_deposit().saturating_sub(cost);if refund.as_yoctonear()>1{Promise::new(env::predecessor_account_id()).transfer(refund).detach()}listing
    }
    pub fn cancel(&mut self,id:String)->Listing{let listing=self.listings.get(&id).expect("Listing not found");require!(env::predecessor_account_id()==listing.seller_id,"Seller only");self.listings.remove(&id);listing}
    #[payable] pub fn buy(&mut self,id:String)->Promise{let listing=self.listings.remove(&id).expect("Listing not found");let buyer_id=env::predecessor_account_id();require!(buyer_id!=listing.seller_id,"Seller cannot buy own listing");require!(env::attached_deposit()>=listing.price,"Attached deposit is below price");let excess=env::attached_deposit().saturating_sub(listing.price);if excess.as_yoctonear()>1{Promise::new(buyer_id.clone()).transfer(excess).detach()}
        ext_nft::ext(listing.nft_contract_id.clone()).with_attached_deposit(NearToken::from_yoctonear(1)).with_static_gas(NFT_GAS).nft_transfer_payout(buyer_id.clone(),listing.token_id.clone(),Some(listing.approval_id),Some("Totem player-owned market sale".into()),U128(listing.price.as_yoctonear()),Some(10)).then(ext_self::ext(env::current_account_id()).with_static_gas(CALLBACK_GAS).settle(listing,buyer_id))}
    #[private] pub fn settle(&mut self,listing:Listing,buyer_id:AccountId,#[callback_result] result:Result<Payout,PromiseError>)->bool{let Ok(payout)=result else{self.listings.insert(&listing.id,&listing);Promise::new(buyer_id).transfer(listing.price).detach();return false};let fee=listing.price.as_yoctonear().saturating_mul(u128::from(self.fee_bps))/10_000;let mut remaining=listing.price.as_yoctonear().saturating_sub(fee);for(account,amount)in payout.payout{let value=amount.0.min(remaining);if value>0{Promise::new(account).transfer(NearToken::from_yoctonear(value)).detach();remaining-=value}}if fee+remaining>0{Promise::new(self.fee_receiver_id.clone()).transfer(NearToken::from_yoctonear(fee+remaining)).detach()}true}
}

#[cfg(test)] mod tests{use super::*;use near_sdk::test_utils::VMContextBuilder;use near_sdk::testing_env;fn a(v:&str)->AccountId{v.parse().unwrap()}#[test]fn lists_player_asset(){testing_env!(VMContextBuilder::new().predecessor_account_id(a("alice.testnet")).attached_deposit(NearToken::from_near(1)).build());let mut m=TotemMarket::new(a("owner.testnet"),a("fees.testnet"),250);let l=m.list(a("nft.testnet"),"shard-1".into(),7,NearToken::from_near(2));assert_eq!(l.seller_id,a("alice.testnet"));}}
