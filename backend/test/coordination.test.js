import test from 'node:test'
import assert from 'node:assert/strict'
import {CoordinationService,MemoryCoordinationRepository} from '../src/index.js'
test('tier-weighted votes toggle',async()=>{const s=new CoordinationService(new MemoryCoordinationRepository(),()=>1),i={space:'council',subjectId:'p-07',accountId:'ada.near',choice:'yes',tier:3};const a=await s.vote(i);assert.equal(a.tally.yes,3);const b=await s.vote(i);assert.equal(b.tally.yes,0)})
test('a Culture Account can switch but not duplicate its Arena choice',async()=>{const s=new CoordinationService(new MemoryCoordinationRepository(),()=>1),base={space:'arena',subjectId:'season-1-round-2',accountId:'ada.near',tier:3};const first=await s.vote({...base,choice:'totem'});assert.equal(first.tally.totem,3);const switched=await s.vote({...base,choice:'doggo'});assert.equal(switched.replaced,'totem');assert.deepEqual(switched.tally,{yes:0,no:0,totem:0,doggo:3})})
test('frozen totems cannot vote',async()=>{const s=new CoordinationService(new MemoryCoordinationRepository());await assert.rejects(()=>s.vote({space:'arena',subjectId:'match',accountId:'ada.near',choice:'totem',tier:'frozen'}),/no voting weight/)})
