import test from 'node:test'
import assert from 'node:assert/strict'
import {createTotemServer} from '../server.js'
test('application server exposes product and API from one origin',async t=>{const server=createTotemServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port;assert.deepEqual(await(await fetch(base+'/api/health')).json(),{status:'ok',service:'totem',version:'v1'});const landing=await fetch(base+'/');assert.equal(landing.status,200);assert.match(await landing.text(),/CULTURE PAIRS/);assert.match(await (await fetch(base+'/')).text(),/Make the meme playable/);assert.equal((await fetch(base+'/api/v1/events?campaignId=totem-genesis')).status,200)})
