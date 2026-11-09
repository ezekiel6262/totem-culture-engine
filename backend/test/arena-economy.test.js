import test from 'node:test'
import assert from 'node:assert/strict'
import {ArenaEconomyService} from '../src/arena-economy.js'

const service=()=>new ArenaEconomyService({network:'testnet',agentContractId:'agent.totem.testnet',marketContractId:'market.totem.testnet'})

test('season evolution is deterministic and derived only from finalized metrics',()=>{
  const input={finalized:true,communityId:'totem',previousSeasonId:'totem-s1',seasonNumber:1,participation:{activePlayers:128,questsAttempted:500,questsCompleted:380},treasury:{availableYocto:'100000000000000000000000000'},market:{volumeYocto:'25000000000000000000000000'}}
  const first=service().evolveSeason(input),second=service().evolveSeason(input)
  assert.deepEqual(first,second);assert.equal(first.rulesFrozen,true);assert.equal(first.derivedFrom,'totem-s1');assert.ok(first.difficulty>=1&&first.difficulty<=10);assert.ok(first.quests.every(q=>q.proofRequired))
})

test('season evolution refuses unfinalized observations',()=>{
  assert.throws(()=>service().evolveSeason({finalized:false,communityId:'totem',previousSeasonId:'s1'}),/finalized data/)
})

test('agent reward preparation enforces action, payment and daily caps',()=>{
  const policy={approvedActions:['quest_reward'],maxPaymentYocto:'1000',dailyRemainingYocto:'1500',requireAllowlistedRecipient:true,approvedRecipients:['alice.testnet']}
  const tx=service().prepareAgentReward({accountId:'alice.testnet',questId:'q1',amountYocto:'900',policy})
  assert.equal(tx.receiverId,'agent.totem.testnet');assert.equal(tx.methodName,'pay_reward');assert.equal(tx.policyDecision.allowed,true)
  assert.throws(()=>service().prepareAgentReward({accountId:'alice.testnet',questId:'q2',amountYocto:'1001',policy}),/per-payment cap/)
  assert.throws(()=>service().prepareAgentReward({accountId:'mallory.testnet',questId:'q3',amountYocto:'10',policy}),/allowlisted/)
})

test('market listing plan keeps NFT in player custody until purchase',()=>{
  const plan=service().prepareMarketListing({ownerId:'alice.testnet',nftContractId:'nft.totem.testnet',tokenId:'shard-1',priceYocto:'2000000000000000000000000',approvalId:7})
  assert.equal(plan.transactions[0].methodName,'nft_approve');assert.equal(plan.transactions[1].methodName,'list');assert.equal(plan.transactions[1].args.approval_id,7)
})
