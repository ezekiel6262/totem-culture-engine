import test from 'node:test'
import assert from 'node:assert/strict'
import {loadConfig} from '../src/index.js'
test('production configuration fails closed',()=>{assert.throws(()=>loadConfig({NODE_ENV:'production'}),/DATABASE_URL/);const config=loadConfig({NODE_ENV:'production',DATABASE_URL:'postgres://db',TOTEM_AUTH_RECIPIENT:'totem.app',NEAR_RPC_URL:'https://rpc.near.org'});assert.equal(config.production,true);assert.equal(config.seedDemo,false)})
