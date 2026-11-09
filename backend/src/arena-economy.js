import {createHash} from 'node:crypto'
import {invariant} from './errors.js'

const YOCTO=10n**24n
const asBig=value=>{try{return BigInt(value)}catch{throw new Error('Invalid integer amount')}}
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n))
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex')

export class ArenaEconomyService{
  constructor({network='testnet',agentContractId=null,marketContractId=null}={}){this.network=network;this.agentContractId=agentContractId;this.marketContractId=marketContractId}
  evolveSeason(input){
    invariant(input?.finalized===true,'SNAPSHOT_NOT_FINAL','Season evolution requires finalized data')
    invariant(input.communityId&&input.previousSeasonId,'SEASON_INPUT_INVALID','Community and previous season are required')
    const players=Number(input.participation?.activePlayers??0),completed=Number(input.participation?.questsCompleted??0),attempted=Number(input.participation?.questsAttempted??0),volume=asBig(input.market?.volumeYocto??0),treasury=asBig(input.treasury?.availableYocto??0)
    invariant([players,completed,attempted].every(Number.isSafeInteger),'SEASON_METRICS_INVALID','Participation metrics must be integers')
    invariant(players>=0&&completed>=0&&attempted>=completed,'SEASON_METRICS_INVALID','Participation metrics are inconsistent')
    const completion=attempted?completed/attempted:0,activityScore=clamp(Math.log2(players+1)/8,0,1),velocityScore=clamp(Number(volume/(YOCTO/100n))/10_000,0,1)
    const difficulty=clamp(Math.round(1+completion*4+activityScore*3+velocityScore*2),1,10)
    const rewardPool=treasury/10n,perQuestCap=players?rewardPool/BigInt(Math.max(players,10)):rewardPool/10n
    const questCount=clamp(Math.round(3+activityScore*5+(completion>.7?2:0)),3,10)
    const seasonId=`${input.communityId}-s${Number(input.seasonNumber??1)+1}`
    const seed=hash({communityId:input.communityId,previousSeasonId:input.previousSeasonId,players,completed,attempted,volume:String(volume),treasury:String(treasury)})
    const questKinds=['remix','ritual','bagwork','liquidity-defense','creator-bounty','migration']
    const quests=Array.from({length:questCount},(_,i)=>({id:`${seasonId}-q${i+1}`,kind:questKinds[parseInt(seed.slice(i*2,i*2+2),16)%questKinds.length],difficulty,baseRewardYocto:String(perQuestCap),proofRequired:true}))
    return{seasonId,communityId:input.communityId,derivedFrom:input.previousSeasonId,snapshotHash:seed,difficulty,questCount,rewardPoolYocto:String(rewardPool),perQuestCapYocto:String(perQuestCap),rulesFrozen:true,quests}
  }
  prepareAgentReward({accountId,questId,action='quest_reward',amountYocto,policy}){
    invariant(this.agentContractId,'AGENT_NOT_CONFIGURED','Community agent contract is not configured')
    invariant(accountId&&questId,'REWARD_INPUT_INVALID','Reward recipient and quest are required')
    invariant(policy?.approvedActions?.includes(action),'AGENT_ACTION_DENIED','Agent policy does not approve this action')
    const amount=asBig(amountYocto),max=asBig(policy.maxPaymentYocto),remaining=asBig(policy.dailyRemainingYocto)
    invariant(amount>0n&&amount<=max,'AGENT_PAYMENT_CAP','Reward exceeds the per-payment cap')
    invariant(amount<=remaining,'AGENT_DAILY_CAP','Reward exceeds the remaining daily cap')
    if(policy.requireAllowlistedRecipient)invariant(policy.approvedRecipients?.includes(accountId),'AGENT_RECIPIENT_DENIED','Recipient is not allowlisted')
    return{network:this.network,receiverId:this.agentContractId,methodName:'pay_reward',deposit:'0',gas:'50000000000000',args:{quest_id:questId,action,receiver_id:accountId,amount:String(amount)},policyDecision:{allowed:true,maxPaymentYocto:String(max),dailyRemainingYocto:String(remaining)}}
  }
  prepareMarketListing({ownerId,nftContractId,tokenId,priceYocto,approvalId}){
    invariant(this.marketContractId,'MARKET_NOT_CONFIGURED','Player market contract is not configured')
    invariant(ownerId&&nftContractId&&tokenId,'LISTING_INPUT_INVALID','Owner, NFT contract and token are required')
    const price=asBig(priceYocto);invariant(price>0n,'LISTING_PRICE_INVALID','Listing price must be positive')
    return{network:this.network,ownerId,transactions:[{receiverId:nftContractId,methodName:'nft_approve',deposit:'1',gas:'30000000000000',args:{token_id:tokenId,account_id:this.marketContractId,msg:null}},{receiverId:this.marketContractId,methodName:'list',deposit:String(YOCTO/100n),gas:'50000000000000',args:{nft_contract_id:nftContractId,token_id:tokenId,approval_id:approvalId,price:String(price)}}]}
  }
}
