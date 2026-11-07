import test from 'node:test'
import assert from 'node:assert/strict'
import { createTotemApi, MemoryTotemRepository, TotemService } from '../src/index.js'
const DAY = 86400000, NOW = Date.UTC(2026, 10, 6)
const campaign = { id:'totem-genesis', creatorAccountId:'creator.near', subjectContractId:'totem.demo.near', mode:'token_first', startsAt:NOW-DAY, endsAt:NOW+30*DAY, status:'active', rule:{kind:'time_weighted_balance',minimumBalance:10000,windowDays:7,minimumCoveredDays:7}, evolutionBranches:[{id:'guardian',role:'Guardian',priority:20,requirements:[{signal:'holdingDays',minimum:7}]},{id:'maker',role:'Maker',priority:10,requirements:[{signal:'challengeReceipts',minimum:1}]}], feePolicy:{routes:[{destination:'quests.near',basisPoints:3000},{destination:'treasury.near',basisPoints:3000},{destination:'creator.near',basisPoints:2500},{destination:'liquidity.near',basisPoints:1500}]} }
const checkpoints = Array.from({length:7},(_,i)=>({period:'d'+i,balance:12000,observedAt:NOW-(6-i)*DAY}))
const post=(url,body)=>new Request(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
test('HTTP API completes the campaign-to-mint flow', async()=>{
  const repository=new MemoryTotemRepository(), api=createTotemApi({repository,service:new TotemService(repository,()=>NOW)})
  assert.equal((await api.createCampaign(post('https://totem.test/api/v1/campaigns',campaign))).status,200)
  const cultures=await(await api.listCampaigns(new Request('https://totem.test/api/v1/campaigns?limit=10'))).json()
  assert.equal(cultures.data[0].culturePair.tokenContractId,'totem.demo.near')
  const evaluation=await(await api.evaluateEligibility(post('https://totem.test/api/v1/eligibility/evaluate',{campaignId:campaign.id,accountId:'member.near',checkpoints}))).json()
  assert.equal(evaluation.data.eligible,true)
  const input={campaignId:campaign.id,accountId:'member.near',eligibilityEpoch:1,checkpoints,signals:{holdingDays:7}}
  assert.equal((await(await api.prepareMint(post('https://totem.test/api/v1/mints/prepare',input))).json()).data.replay,false)
  assert.equal((await(await api.prepareMint(post('https://totem.test/api/v1/mints/prepare',input))).json()).data.replay,true)
  const events=await(await api.listEvents(new Request('https://totem.test/api/v1/events?campaignId=totem-genesis'))).json()
  assert.deepEqual(events.data.map(event=>event.type),['campaign.version_created','identity.mint_prepared'])
})
test('HTTP API rejects bad methods and cursors',async()=>{
  const repository=new MemoryTotemRepository(), api=createTotemApi({repository,service:new TotemService(repository,()=>NOW)})
  const method=await api.createCampaign(new Request('https://totem.test/api/v1/campaigns'))
  const cursor=await api.listEvents(new Request('https://totem.test/api/v1/events?campaignId=totem-genesis&afterSequence=-1'))
  assert.equal((await method.json()).error.code,'METHOD_NOT_ALLOWED')
  assert.equal((await cursor.json()).error.code,'CURSOR_INVALID')
})
