import test from 'node:test'
import assert from 'node:assert/strict'
import {LaunchQuoteService} from '../src/launch-quotes.js'

const rpc={
  protocolConfig:async()=>({protocolVersion:88,storageAmountPerByte:'10000000000000000000'}),
  callFunctionFinal:async({contractId})=>contractId==='wrap.near'?{min:'1250000000000000000000'}:{min:'1020000000000000000000'}
}

test('quotes a token launch with liquidity without treating liquidity as a fee',async()=>{
  const quote=await new LaunchQuoteService({rpc,network:'mainnet'}).quote({kind:'token',includePool:true,liquidityNear:'2'})
  assert.equal(quote.executable,false)
  assert.equal(quote.components.find(x=>x.code==='initial_liquidity').category,'liquidity_capital')
  assert.equal(quote.components.find(x=>x.code==='totem_service_fee').amountNear,'0.75')
  assert.equal(quote.totalNear,'4.91771')
})

test('rejects NFT pools and missing liquidity',async()=>{
  const service=new LaunchQuoteService({rpc,network:'mainnet'})
  await assert.rejects(()=>service.quote({kind:'nft',includePool:true,liquidityNear:'1'}),/liquidity pool/i)
  await assert.rejects(()=>service.quote({kind:'token',includePool:true}),/liquidityNear/i)
})
