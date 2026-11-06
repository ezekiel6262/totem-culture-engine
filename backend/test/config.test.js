import test from 'node:test'
import assert from 'node:assert/strict'
import {loadConfig} from '../src/index.js'
test('production configuration fails closed',()=>{assert.throws(()=>loadConfig({NODE_ENV:'production'}),/DATABASE_URL or TOTEM_DYNAMODB_TABLE/);const config=loadConfig({NODE_ENV:'production',TOTEM_DYNAMODB_TABLE:'totem',TOTEM_AUTH_RECIPIENT:'totem.app',NEAR_RPC_URL:'https://rpc.near.org'});assert.equal(config.production,true);assert.equal(config.dynamoTable,'totem');assert.equal(config.seedDemo,false)})
