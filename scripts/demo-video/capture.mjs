// Captures the shots for the Totem demo video straight from the live site.
//
// Edge is Chromium, so it is driven over the DevTools protocol with nothing installed:
// Node 24 has a global WebSocket and that is the whole dependency list. Each shot is one
// still, either the viewport or the full page captured beyond it, and ffmpeg makes the
// motion afterwards by panning or easing across the image. Capturing a tall still and
// panning it gives a perfectly smooth scroll, which capturing frames at two or three per
// second never would.
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 9222
const SITE = 'https://mytotem.buzz/'
const OUT = resolve(process.argv[2] ?? 'shots')
const PROFILE = resolve(OUT, '..', 'edge-profile')
const WIDTH = 1920
const HEIGHT = 1080

// route     the hash to show
// scroll    pixels down the page before capturing
// full      capture the whole page rather than the viewport, for shots that pan
// settle    extra milliseconds for three.js and the chain reads to finish
const SHOTS = [
  { id: 'home-a',    route: 'home',    scroll: 0 },
  { id: 'home-b',    route: 'home',    scroll: 900 },
  { id: 'home-c',    route: 'home',    scroll: 1900 },
  { id: 'home-d',    route: 'home',    scroll: 2900 },
  { id: 'home-e',    route: 'home',    scroll: 3900 },
  { id: 'home-f',    route: 'home',    scroll: 4900 },
  { id: 'nft',       route: 'nft-1',   scroll: 0,    settle: 4500 },
  { id: 'nft-foot',  route: 'nft-1',   scroll: 240,  settle: 4500 },
  { id: 'totem',     route: 'totem',   full: true,   settle: 4000 },
  { id: 'arenas',    route: 'arenas',  full: true,   settle: 4500 },
  { id: 'arenas-op', route: 'arenas',  scroll: 1500, settle: 4500 },
  { id: 'arena',     route: 'arena',   full: true,   settle: 5000, enterArena: true },
  { id: 'kart',      route: 'play',    scroll: 0,    settle: 6000, enterArena: true },
  { id: 'paint',     route: 'paint',   scroll: 0,    settle: 6000, enterArena: true },
  { id: 'rules',     route: 'rules',   full: true,   settle: 3000 },
  { id: 'explore',   route: 'explore', full: true,   settle: 5000 },
  { id: 'launch',    route: 'launch',  full: true,   settle: 4000 },
  { id: 'market',    route: 'market',  full: true,   settle: 4500 }
]

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

async function targets () {
  const response = await fetch(`http://127.0.0.1:${PORT}/json/list`)
  return response.json()
}

class Devtools {
  #socket; #id = 0; #waiting = new Map()
  static async open (url) {
    const self = new Devtools()
    self.#socket = new WebSocket(url)
    await new Promise((ok, fail) => {
      self.#socket.addEventListener('open', ok, { once: true })
      self.#socket.addEventListener('error', fail, { once: true })
    })
    self.#socket.addEventListener('message', (event) => {
      const payload = JSON.parse(event.data)
      const pending = self.#waiting.get(payload.id)
      if (!pending) return
      self.#waiting.delete(payload.id)
      payload.error ? pending.fail(new Error(JSON.stringify(payload.error))) : pending.ok(payload.result)
    })
    return self
  }

  send (method, params = {}) {
    const id = ++this.#id
    this.#socket.send(JSON.stringify({ id, method, params }))
    return new Promise((ok, fail) => {
      this.#waiting.set(id, { ok, fail })
      setTimeout(() => this.#waiting.has(id) && (this.#waiting.delete(id), fail(new Error(`${method} timed out`))), 60000)
    })
  }

  async evaluate (expression) {
    const { result } = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    return result.value
  }

  close () { this.#socket.close() }
}

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
rmSync(PROFILE, { recursive: true, force: true })

const edge = spawn(EDGE, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`,
  `--window-size=${WIDTH},${HEIGHT}`,
  '--hide-scrollbars',
  '--force-device-scale-factor=1',
  // The site draws its Totems with three.js, so WebGL has to work without a GPU.
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--mute-audio',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  SITE
], { stdio: 'ignore' })

const manifest = []
try {
  let list = []
  for (let attempt = 0; attempt < 40 && !list.some(t => t.type === 'page'); attempt++) {
    await sleep(500)
    try { list = await targets() } catch (error) { list = [] }
  }
  const page = list.find(t => t.type === 'page')
  if (!page) throw new Error('Edge never exposed a page target')

  const cdp = await Devtools.open(page.webSocketDebuggerUrl)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false })
  await cdp.send('Page.navigate', { url: SITE + '#home' })
  await sleep(9000)

  for (const shot of SHOTS) {
    // Hash routing means a same document change, so the route is set rather than navigated.
    //
    // The game screens sit behind the Arena gate, and the demo keeps "I am in an Arena" in
    // localStorage rather than on any window global, so entering is a matter of writing the
    // same state a visitor writes by clicking in, then reloading onto the route. The piece
    // count is set to 1 to match what Totem #1 actually holds on chain.
    if (shot.enterArena) {
      await cdp.evaluate(`localStorage.setItem('totem-demo-state-1', JSON.stringify({ arena: 'totem', arenaPaused: false, pieces: 1 })); location.hash = ${JSON.stringify('#' + shot.route)}; location.reload(); null`)
    } else {
      await cdp.evaluate(`location.hash = ${JSON.stringify('#' + shot.route)}; null`)
    }
    await sleep(shot.settle ?? 2500)
    await cdp.evaluate(`window.scrollTo(0, ${shot.scroll ?? 0}); null`)
    await sleep(1400)

    // The onchain drawer and its pill are fixed to the viewport. In a capture that reaches
    // beyond the viewport they are painted into the middle of the tall image instead of
    // pinned to a corner, so they are hidden for those shots only.
    await cdp.evaluate("document.getElementById('chainClose')?.click(); null")
    if (shot.full) await cdp.evaluate("for (const id of ['chainDrawer', 'chainBtn']) { const el = document.getElementById(id); if (el) el.style.visibility = 'hidden' } null")
    await sleep(600)
    const metrics = await cdp.evaluate('JSON.stringify({ h: document.documentElement.scrollHeight, y: window.scrollY })')
    const { h } = JSON.parse(metrics)
    // The home page is 500vh of sticky canvas, so a full page capture of it would be a
    // column of empty space. Only genuinely tall, ordinary pages are captured whole.
    const tall = shot.full ? Math.min(h, 6000) : HEIGHT
    const params = { format: 'jpeg', quality: 94, captureBeyondViewport: Boolean(shot.full) }
    if (shot.full) params.clip = { x: 0, y: 0, width: WIDTH, height: tall, scale: 1 }

    const { data } = await cdp.send('Page.captureScreenshot', params)
    const file = resolve(OUT, `${shot.id}.jpg`)
    writeFileSync(file, Buffer.from(data, 'base64'))
    manifest.push({ id: shot.id, route: shot.route, file, width: WIDTH, height: tall, pageHeight: h })
    console.log(`${shot.id.padEnd(10)} ${shot.route.padEnd(8)} ${WIDTH}x${tall}  page ${h}px`)
  }
  cdp.close()
} finally {
  edge.kill()
}

writeFileSync(resolve(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2))
console.log(`\n${manifest.length} shots in ${OUT}`)
