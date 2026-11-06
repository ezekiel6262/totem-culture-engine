import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { createTotemApi, encodeBase58, MemoryAuthRepository, MemoryTotemRepository, nep413Digest, TotemAuthService, TotemService } from '../src/index.js'
const NOW=Date.UTC(2026,10,6), post=(url,body)=>new Request(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
test('NEP-413 HTTP flow issues a bearer session',async()=>{
  const {publicKey,privateKey}=generateKeyPairSync('ed25519')
  const key='ed25519:'+encodeBase58(publicKey.export({type:'spki',format:'der'}).subarray(-32))
  const repository=new MemoryTotemRepository(), authRepository=new MemoryAuthRepository()
  const auth=new TotemAuthService({repository:authRepository,recipient:'totem.example',clock:()=>NOW,rpc:{viewAccessKey:async()=>({permission:'FullAccess',blockHeight:42,blockHash:'final'})}})
  const api=createTotemApi({repository,service:new TotemService(repository,()=>NOW),auth})
  const challenge=(await(await api.createAuthChallenge(post('https://totem.test/api/v1/auth/challenge',{accountId:'member.near'}))).json()).data
  const signature=sign(null,nep413Digest({message:challenge.message,nonce:challenge.nonce,recipient:challenge.recipient}),privateKey).toString('base64')
  const verified=(await(await api.verifyAuth(post('https://totem.test/api/v1/auth/verify',{accountId:'member.near',publicKey:key,signature,state:challenge.state}))).json()).data
  assert.ok(verified.token)
  const session=await(await api.getSession(new Request('https://totem.test/api/v1/auth/session',{headers:{authorization:'Bearer '+verified.token}}))).json()
  assert.equal(session.data.accountId,'member.near')
  const denied=await api.createCampaign(post('https://totem.test/api/v1/campaigns',{creatorAccountId:'other.near'}))
  assert.equal((await denied.json()).error.code,'AUTH_REQUIRED')
})
test('authentication challenge cannot be replayed',async()=>{
  const {publicKey,privateKey}=generateKeyPairSync('ed25519'), key='ed25519:'+encodeBase58(publicKey.export({type:'spki',format:'der'}).subarray(-32))
  const repository=new MemoryTotemRepository(), authRepository=new MemoryAuthRepository()
  const auth=new TotemAuthService({repository:authRepository,recipient:'totem.example',clock:()=>NOW,rpc:{viewAccessKey:async()=>({permission:'FullAccess'})}})
  const api=createTotemApi({repository,service:new TotemService(repository,()=>NOW),auth})
  const challenge=(await(await api.createAuthChallenge(post('https://x/auth',{accountId:'member.near'}))).json()).data
  const body={accountId:'member.near',publicKey:key,state:challenge.state,signature:sign(null,nep413Digest({message:challenge.message,nonce:challenge.nonce,recipient:challenge.recipient}),privateKey).toString('base64')}
  assert.equal((await api.verifyAuth(post('https://x/verify',body))).status,200)
  assert.equal((await api.verifyAuth(post('https://x/verify',body))).status,400)
})
