import {invariant} from './errors.js'

const YOCTO=10n**24n
const parseNear=value=>{
  const text=String(value??'0').trim()
  invariant(/^\d+(?:\.\d{1,24})?$/.test(text),'LAUNCH_AMOUNT_INVALID','NEAR amounts must be positive decimal strings with at most 24 decimal places')
  const [whole,fraction='']=text.split('.')
  return BigInt(whole)*YOCTO+BigInt((fraction+'0'.repeat(24)).slice(0,24))
}
const formatNear=value=>{
  const whole=value/YOCTO,fraction=(value%YOCTO).toString().padStart(24,'0').replace(/0+$/,'')
  return fraction?`${whole}.${fraction}`:whole.toString()
}
const sum=items=>items.reduce((total,item)=>total+BigInt(item.amountYocto),0n)

export class LaunchQuoteService{
  constructor({rpc,network,fees={}}){
    this.rpc=rpc;this.network=network
    this.fees={token:parseNear(fees.token??'0.5'),nft:parseNear(fees.nft??'0.75'),twin:parseNear(fees.twin??'1'),pool:parseNear(fees.pool??'0.25')}
  }
  async quote(input={}){
    const kind=input.kind
    invariant(['token','nft','twin'].includes(kind),'LAUNCH_KIND_INVALID','kind must be token, nft, or twin')
    const includePool=Boolean(input.includePool)
    invariant(!includePool||kind!=='nft','LAUNCH_POOL_INVALID','A liquidity pool requires a fungible token launch')
    const liquidity=parseNear(input.liquidityNear??'0')
    invariant(!includePool||liquidity>0n,'LAUNCH_LIQUIDITY_REQUIRED','liquidityNear is required when creating a pool')
    const protocol=await this.rpc.protocolConfig()
    const storagePerByte=BigInt(protocol.storageAmountPerByte)
    const artifactBytes={token:205419n,nft:350858n}
    const components=[]
    // Direct WASM deployment remains the executable path until the audited factory is deployed.
    if(kind==='token'||kind==='twin')components.push({code:'token_contract_storage',category:'protocol_reserve',amountYocto:(artifactBytes.token*storagePerByte).toString(),refundable:false})
    if(kind==='nft'||kind==='twin')components.push({code:'nft_contract_storage',category:'protocol_reserve',amountYocto:(artifactBytes.nft*storagePerByte).toString(),refundable:false})
    const initialState=parseNear(kind==='twin'?'0.12':kind==='nft'?'0.07':'0.05')
    components.push({code:'initial_state_and_gas_reserve',category:'execution_reserve',amountYocto:initialState.toString(),refundable:true})
    if(includePool){
      const [rhea,wrap]=await Promise.all([
        this.rpc.callFunctionFinal({contractId:'v2.ref-finance.near',methodName:'storage_balance_bounds'}),
        this.rpc.callFunctionFinal({contractId:'wrap.near',methodName:'storage_balance_bounds'})
      ])
      components.push({code:'rhea_registration',category:'protocol_reserve',amountYocto:String(rhea.min),refundable:true})
      components.push({code:'wnear_registration',category:'protocol_reserve',amountYocto:String(wrap.min),refundable:true})
      // The launched FT exposes this exact value after deployment; reserve the NEP-145
      // standard account-registration amount and reconcile it before execution.
      components.push({code:'token_exchange_registration',category:'protocol_reserve',amountYocto:parseNear('0.00125').toString(),refundable:true})
      components.push({code:'pool_storage_and_gas_reserve',category:'execution_reserve',amountYocto:parseNear('0.06').toString(),refundable:true})
      components.push({code:'initial_liquidity',category:'liquidity_capital',amountYocto:liquidity.toString(),refundable:false})
    }
    const serviceFee=this.fees[kind]+(includePool?this.fees.pool:0n)
    components.push({code:'totem_service_fee',category:'platform_fee',amountYocto:serviceFee.toString(),refundable:false})
    const total=sum(components)
    return{network:this.network,kind,includePool,architecture:'direct_wasm_pending_factory',currency:'NEAR',components:components.map(x=>({...x,amountNear:formatNear(BigInt(x.amountYocto))})),totalYocto:total.toString(),totalNear:formatNear(total),expiresAt:new Date(Date.now()+60_000).toISOString(),executable:false,reason:'Factory and global-contract deployment are not audited or enabled yet.'}
  }
}

export {parseNear,formatNear}
