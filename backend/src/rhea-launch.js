import {invariant} from './errors.js'
import {parseNear} from './launch-quotes.js'

const GAS='30000000000000',ONE_YOCTO='1'
const call=(receiverId,methodName,args,deposit='0',gas=GAS)=>({receiverId,actions:[{type:'FunctionCall',params:{methodName,args,deposit,gas}}]})

export class RheaLaunchPlanner{
  constructor({rpc,network}){
    this.rpc=rpc;this.network=network
    this.exchangeId=network==='mainnet'?'v2.ref-finance.near':'ref-finance-101.testnet'
    this.wrapId=network==='mainnet'?'wrap.near':'wrap.testnet'
  }
  async plan(input={}){
    const {creatorId,tokenContractId,tokenAmount,poolId=null}=input
    invariant(/^[a-z0-9._-]{2,64}$/.test(creatorId??''),'RHEA_CREATOR_INVALID','A valid creatorId is required')
    invariant(/^[a-z0-9._-]{2,64}$/.test(tokenContractId??''),'RHEA_TOKEN_INVALID','A valid tokenContractId is required')
    invariant(/^\d+$/.test(String(tokenAmount??''))&&BigInt(tokenAmount)>0n,'RHEA_TOKEN_AMOUNT_INVALID','tokenAmount must be a positive smallest-unit integer')
    const nearAmount=parseNear(input.nearAmount)
    invariant(nearAmount>0n,'RHEA_NEAR_AMOUNT_INVALID','nearAmount must be positive')
    const [exchangeStorage,wrapStorage,tokenStorage,protocol]=await Promise.all([
      this.rpc.callFunctionFinal({contractId:this.exchangeId,methodName:'storage_balance_bounds'}),
      this.rpc.callFunctionFinal({contractId:this.wrapId,methodName:'storage_balance_bounds'}),
      this.rpc.callFunctionFinal({contractId:tokenContractId,methodName:'storage_balance_bounds'}),
      this.rpc.protocolConfig()
    ])
    const tokens=[tokenContractId,this.wrapId].sort(),amountByToken={[tokenContractId]:String(tokenAmount),[this.wrapId]:nearAmount.toString()}
    const transactions=[
      call(this.exchangeId,'storage_deposit',{account_id:creatorId,registration_only:true},String(exchangeStorage.min),'30000000000000'),
      call(tokenContractId,'storage_deposit',{account_id:this.exchangeId,registration_only:true},String(tokenStorage.min),'30000000000000'),
      call(this.wrapId,'storage_deposit',{account_id:creatorId,registration_only:true},String(wrapStorage.min),'30000000000000'),
      call(this.wrapId,'near_deposit',{},nearAmount.toString(),'30000000000000'),
      call(this.exchangeId,'register_tokens',{token_ids:tokens},'0','30000000000000'),
      call(tokenContractId,'ft_transfer_call',{receiver_id:this.exchangeId,amount:String(tokenAmount),memo:'Totem initial liquidity',msg:''},ONE_YOCTO,'50000000000000'),
      call(this.wrapId,'ft_transfer_call',{receiver_id:this.exchangeId,amount:nearAmount.toString(),memo:'Totem initial liquidity',msg:''},ONE_YOCTO,'50000000000000')
    ]
    if(poolId===null){
      const poolStorage=(300n*BigInt(protocol.storageAmountPerByte)).toString()
      transactions.push(call(this.exchangeId,'add_simple_pool',{tokens,fee:Number(input.feeBps??30)},poolStorage,'50000000000000'))
      return{network:this.network,exchangeId:this.exchangeId,tokens,transactions,checkpoint:'pool_creation_finality',requiresPoolId:true,warning:'Resume only with the finalized pool ID returned by add_simple_pool.'}
    }
    invariant(Number.isSafeInteger(poolId)&&poolId>=0,'RHEA_POOL_ID_INVALID','poolId must be a non-negative integer')
    transactions.push(call(this.exchangeId,'add_liquidity',{pool_id:poolId,amounts:tokens.map(id=>amountByToken[id])},'0','50000000000000'))
    return{network:this.network,exchangeId:this.exchangeId,tokens,transactions,checkpoint:'liquidity_finality',requiresPoolId:false,poolId}
  }
}
