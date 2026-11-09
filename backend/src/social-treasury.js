import { createHash } from 'node:crypto'
import { invariant } from './errors.js'

const ACCOUNT=/^(?=.{2,64}$)[a-z0-9]+(?:[._-][a-z0-9]+)*$/
const asYocto=(value,field)=>{const text=String(value??'');invariant(/^\d+$/.test(text)&&BigInt(text)>0n,'TREASURY_AMOUNT_INVALID',`${field} must be a positive yoctoNEAR integer`);return text}
const account=(value,field)=>{const text=String(value??'').toLowerCase();invariant(ACCOUNT.test(text),'TREASURY_ACCOUNT_INVALID',`${field} must be a valid NEAR account`);return text}
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex')

export class SocialTreasuryService{
  constructor({network='testnet'}={}){this.network=network}
  prepare(input){
    const provider=String(input.provider??'sputnik').toLowerCase()
    invariant(['sputnik','trezu'].includes(provider),'TREASURY_PROVIDER_INVALID','provider must be sputnik or trezu')
    const daoAccountId=account(input.daoAccountId,'daoAccountId'),proposerAccountId=account(input.proposerAccountId,'proposerAccountId')
    const proposalBondYocto=asYocto(input.proposalBondYocto,'proposalBondYocto'),amount=asYocto(input.amountYocto,'amountYocto'),cap=asYocto(input.maxCampaignBudgetYocto,'maxCampaignBudgetYocto')
    invariant(BigInt(amount)<=BigInt(cap),'TREASURY_CAP_EXCEEDED','Proposal exceeds the campaign spending cap')
    const tokenId=input.tokenId?account(input.tokenId,'tokenId'):''
    const allowedTokens=input.policy?.allowedTokens??['']
    invariant(allowedTokens.includes(tokenId),'TREASURY_TOKEN_NOT_ALLOWED','Token is not allowed by the treasury policy')
    const description=String(input.description??'').trim()
    invariant(description.length>=8&&description.length<=500,'TREASURY_DESCRIPTION_INVALID','description must be 8 to 500 characters')
    let kind
    if(input.kind==='bounty'){
      const times=Number(input.times??1),maxDeadline=Number(input.maxDeadlineNanoseconds)
      invariant(Number.isSafeInteger(times)&&times>0&&times<=100,'TREASURY_BOUNTY_INVALID','times must be between 1 and 100')
      invariant(Number.isSafeInteger(maxDeadline)&&maxDeadline>0,'TREASURY_BOUNTY_INVALID','maxDeadlineNanoseconds must be a positive integer')
      kind={AddBounty:{bounty:{description,token:tokenId,amount,times,max_deadline:String(maxDeadline)}}}
    }else{
      invariant(input.kind==='transfer','TREASURY_KIND_INVALID','kind must be transfer or bounty')
      const receiverId=account(input.receiverId,'receiverId'),recipients=input.policy?.approvedRecipients??[]
      invariant(!recipients.length||recipients.includes(receiverId),'TREASURY_RECIPIENT_NOT_ALLOWED','Recipient is not approved by the treasury policy')
      kind={Transfer:{token_id:tokenId,receiver_id:receiverId,amount,msg:String(input.message??'')}}
    }
    const metadata={schema:'totem.social-money.v1',provider,campaignId:String(input.campaignId??''),agentId:String(input.agentId??''),policyHash:digest({cap,allowedTokens,approvedRecipients:input.policy?.approvedRecipients??[]})}
    const proposal={description:`${description}\n\nTOTEM:${JSON.stringify(metadata)}`,kind}
    const transaction={signerId:proposerAccountId,receiverId:daoAccountId,actions:[{type:'FunctionCall',methodName:'add_proposal',args:{proposal},gas:'300000000000000',deposit:proposalBondYocto}]}
    return{network:this.network,provider,execution:'DAO_APPROVAL_REQUIRED',custody:'DAO',proposalHash:digest(proposal),budget:{amountYocto:amount,capYocto:cap},transaction,trezu:provider==='trezu'?{surface:'Trezu Treasury',daoAccountId,operation:'Create Sputnik proposal'}:null}
  }
  finalize(input){
    const daoAccountId=account(input.daoAccountId,'daoAccountId'),proposalId=Number(input.proposalId)
    invariant(Number.isSafeInteger(proposalId)&&proposalId>=0,'TREASURY_PROPOSAL_INVALID','proposalId must be a non-negative integer')
    invariant(input.status==='Approved','TREASURY_PROPOSAL_NOT_APPROVED','Only an approved DAO proposal can become a reward receipt')
    invariant(/^[A-Za-z0-9_-]{20,100}$/.test(String(input.transactionHash??'')),'TREASURY_TRANSACTION_INVALID','A finalized NEAR transaction hash is required')
    invariant(/^[a-f0-9]{64}$/.test(String(input.proposalHash??'')),'TREASURY_PROPOSAL_INVALID','proposalHash must bind the prepared proposal')
    const bound={daoAccountId,proposalId,transactionHash:input.transactionHash,proposalHash:input.proposalHash}
    return{schema:'totem.treasury-receipt.v1',network:this.network,...bound,status:'approved',arenaRewardEligible:true,receiptHash:digest(bound)}
  }
}
