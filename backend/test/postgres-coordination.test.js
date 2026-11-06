import test from 'node:test'
import assert from 'node:assert/strict'
import {PostgresCoordinationRepository} from '../src/index.js'
test('Postgres coordination toggles in a transaction',async()=>{const calls=[];const sql={transaction:async action=>action({query:async(text,values)=>{calls.push({text,values});return text.startsWith('delete')?{rowCount:0,rows:[]}:{rowCount:1,rows:[]}}})};const repo=new PostgresCoordinationRepository(sql);assert.equal((await repo.toggleVote({space:'arena',subjectId:'m1',accountId:'ada.near',choice:'bbc',weight:3,createdAt:1})).active,true);assert.match(calls[0].text,/delete/);assert.match(calls[1].text,/insert/)})
