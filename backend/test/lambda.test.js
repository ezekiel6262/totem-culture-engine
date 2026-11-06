import test from 'node:test'
import assert from 'node:assert/strict'
process.env.NODE_ENV='development'
const {handler}=await import('../lambda.js')
test('Lambda adapter serves health and 404',async()=>{const event=path=>({rawPath:path,requestContext:{http:{method:'GET'}},headers:{}});assert.equal((await handler(event('/api/health'))).statusCode,200);assert.equal((await handler(event('/api/nope'))).statusCode,404)})
