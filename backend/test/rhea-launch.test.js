import test from 'node:test'
import assert from 'node:assert/strict'
import {RheaLaunchPlanner} from '../src/rhea-launch.js'
const rpc={protocolConfig:async()=>({storageAmountPerByte:'10000000000000000000'}),callFunctionFinal:async({contractId})=>({min:contractId==='v2.ref-finance.near'?'1020000000000000000000':'1250000000000000000000'})}
test('RHEA plan stops for finalized pool id before adding liquidity',async()=>{
  const plan=await new RheaLaunchPlanner({rpc,network:'mainnet'}).plan({creatorId:'creator.near',tokenContractId:'meme.launch.near',tokenAmount:'1000',nearAmount:'2',feeBps:30})
  assert.equal(plan.requiresPoolId,true)
  assert.equal(plan.transactions.at(-1).actions[0].params.methodName,'add_simple_pool')
  assert.equal(plan.transactions.at(-1).actions[0].params.deposit,'3000000000000000000000')
})
test('RHEA resume orders amounts according to canonical token order',async()=>{
  const plan=await new RheaLaunchPlanner({rpc,network:'mainnet'}).plan({creatorId:'creator.near',tokenContractId:'z-token.near',tokenAmount:'1000',nearAmount:'2',poolId:42})
  const args=plan.transactions.at(-1).actions[0].params.args
  assert.equal(args.pool_id,42);assert.deepEqual(args.amounts,['2000000000000000000000000','1000'])
})
