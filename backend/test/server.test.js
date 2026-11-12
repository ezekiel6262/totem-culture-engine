import test from 'node:test'
import assert from 'node:assert/strict'
import {createTotemServer} from '../server.js'

test('application server exposes product and API from one origin', async t => {
  const server = createTotemServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  const base = 'http://127.0.0.1:' + server.address().port

  assert.deepEqual(await (await fetch(base + '/api/health')).json(), { status: 'ok', service: 'totem', version: 'v1' })

  const landing = await fetch(base + '/')
  assert.equal(landing.status, 200)
  const html = await landing.text()
  assert.match(html, /NFTs that hold the meme/)
  assert.match(html, /Enter the Arena/)
  assert.match(html, /rel="icon"/)

  assert.equal((await fetch(base + '/api/v1/events?campaignId=totem-genesis')).status, 200)
})

test('application server serves the product routes the frontend calls', async t => {
  const server = createTotemServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  const base = 'http://127.0.0.1:' + server.address().port

  const totem = await fetch(base + '/api/v1/totems/417')
  assert.equal(totem.status, 200)
  const body = await totem.json()
  assert.equal(body.data.totem.pieces, 3)
  assert.equal(body.data.totem.account, '417.totem.near')

  const arenas = await fetch(base + '/api/v1/arenas')
  assert.equal(arenas.status, 200)
  assert.ok((await arenas.json()).data.arenas.length > 0)

  const write = await fetch(base + '/api/v1/totems/417/pieces', { method: 'POST' })
  assert.equal(write.status, 400)
  assert.equal((await write.json()).error.code, 'AUTH_REQUIRED')
})
