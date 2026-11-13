// Builds the Totem demo video from the captured stills and the narration track.
//
// Motion is made here rather than at capture time: a 1920 wide crop window drifts across a
// taller still, which gives a perfectly smooth scroll at 30fps, where capturing frames from
// a live scroll would have given two or three a second. Shots that are only viewport tall
// get a focus rectangle instead, scaled up to fill the frame, so the text is readable.
//
// Each segment is cut half a second longer than its narration line and the segments are
// crossfaded by that half second, which puts every cut exactly on a sentence boundary.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const SP = resolve(process.argv[2] ?? '.')
const SHOTS = resolve(SP, 'shots')
const VO = resolve(SP, 'vo')
const WORK = resolve(SP, 'work')
const OUT = resolve(SP, 'totem-demo.mp4')
const FPS = 30
const XFADE = 0.5

const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-v', 'error', ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
const seconds = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim())

// line   which narration line this segment carries, and how much of it
// pan    [from, to] top of the crop window, for stills taller than the frame
// focus  [x, y, w, h] region to fill the frame with, for viewport tall stills
const PLAN = [
  { img: 'home-a',    line: 1, part: 0.344, focus: [0, 0, 1920, 1080] },
  { img: 'home-b',    line: 1, part: 0.332, focus: [0, 0, 1920, 1080] },
  { img: 'home-c',    line: 1, part: 0.324, focus: [0, 0, 1920, 1080] },
  { img: 'home-d',    line: 2, part: 0.502, focus: [0, 0, 1920, 1080] },
  { img: 'home-e',    line: 2, part: 0.498, focus: [0, 0, 1920, 1080] },
  { img: 'nft',       line: 3, focus: [360, 100, 1220, 686] },
  { img: 'nft',       line: 4, focus: [360, 225, 1240, 698] },
  { img: 'totem',     line: 5, pan: [0, 635] },
  { img: 'arenas',    line: 6, pan: [0, 344] },
  { img: 'arena',     line: 7, focus: [0, 58, 1920, 1022], zoom: 0 },
  { img: 'rules',     line: 8, pan: [0, 780] },
  { img: 'explore',   line: 9, focus: [180, 50, 1600, 900] },
  { img: 'arenas-op', line: 10, focus: [330, 380, 1250, 703] },
  { img: 'launch',    line: 11, pan: [0, 720] },
  { img: 'launch',    line: 12, focus: [200, 55, 1520, 855] },
  { img: 'home-a',    line: 13, focus: [0, 0, 1920, 1080] }
]

rmSync(WORK, { recursive: true, force: true })
mkdirSync(WORK, { recursive: true })

// Narration first: every segment is cut to the length of the line it carries.
const lineFile = (n) => resolve(VO, `line-${String(n).padStart(2, '0')}.wav`)
const lineLength = new Map()
for (const { line } of PLAN) if (!lineLength.has(line)) lineLength.set(line, seconds(lineFile(line)))

const segments = PLAN.map((shot, index) => {
  const whole = lineLength.get(shot.line)
  const duration = whole * (shot.part ?? 1)
  return { ...shot, index, duration }
})
const spoken = segments.reduce((total, s) => total + s.duration, 0)
console.log(`narration ${spoken.toFixed(2)}s across ${segments.length} segments`)

// One clip per segment, each half a second long for the crossfade to eat.
for (const segment of segments) {
  const source = resolve(SHOTS, `${segment.img}.jpg`)
  const length = (segment.duration + XFADE).toFixed(3)
  let filter

  if (segment.pan) {
    // Drift the crop window down the tall still. Easing in and out stops the scroll from
    // starting and stopping abruptly, which is what makes a pan look mechanical.
    const [from, to] = segment.pan
    const travel = to - from
    const ease = `(1-cos(PI*min(t/${length},1)))/2`
    filter = `crop=1920:1080:0:'${from}+${travel}*${ease}'`
  } else {
    // Fill the frame with the focus rectangle, then push in very slightly across the shot.
    const [x, y, w, h] = segment.focus
    const zoom = segment.zoom ?? 0.04
    const ease = `(1-cos(PI*min(t/${length},1)))/2`
    const cw = `${w}-${(w * zoom).toFixed(2)}*${ease}`
    const ch = `${h}-${(h * zoom).toFixed(2)}*${ease}`
    filter = `crop='${cw}':'${ch}':'${x}+${(w * zoom / 2).toFixed(2)}*${ease}':'${y}+${(h * zoom / 2).toFixed(2)}*${ease}',scale=1920:1080:flags=lanczos`
  }

  const out = resolve(WORK, `seg-${String(segment.index).padStart(2, '0')}.mp4`)
  ff(['-loop', '1', '-framerate', String(FPS), '-t', length, '-i', source,
    '-vf', `${filter},format=yuv420p,setsar=1`,
    '-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-y', out])
  segment.clip = out
  console.log(`  ${String(segment.index).padStart(2, '0')} ${segment.img.padEnd(10)} line ${String(segment.line).padStart(2)}  ${segment.duration.toFixed(2)}s`)
}

// The narration, in order, as one track.
const listFile = resolve(WORK, 'audio.txt')
const ordered = []
for (const segment of segments) if (!ordered.includes(segment.line)) ordered.push(segment.line)
writeFileSync(listFile, ordered.map(n => `file '${lineFile(n).replace(/\\/g, '/')}'`).join('\n'))
const voice = resolve(WORK, 'voice.wav')
ff(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', '-y', voice])

// Chain the crossfades. Each transition starts where the previous lines have finished, so
// every cut lands on a sentence boundary rather than drifting away from the voice.
const inputs = segments.flatMap(s => ['-i', s.clip])
const steps = []
let label = '0:v'
let elapsed = 0
for (let at = 1; at < segments.length; at++) {
  elapsed += segments[at - 1].duration
  const next = at === segments.length - 1 ? 'vx' : `v${at}`
  steps.push(`[${label}][${at}:v]xfade=transition=fade:duration=${XFADE}:offset=${elapsed.toFixed(3)}[${next}]`)
  label = next
}
const total = spoken + XFADE
steps.push(`[${label}]fade=t=in:st=0:d=0.6,fade=t=out:st=${(total - 0.8).toFixed(2)}:d=0.8[v]`)
steps.push(`[${segments.length}:a]afade=t=in:st=0:d=0.3,afade=t=out:st=${(spoken - 0.5).toFixed(2)}:d=0.5[a]`)

console.log('\nrendering...')
ff([...inputs, '-i', voice,
  '-filter_complex', steps.join(';'),
  '-map', '[v]', '-map', '[a]',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
  '-t', total.toFixed(3), '-y', OUT])

const final = seconds(OUT)
console.log(`\n${OUT}`)
console.log(`${Math.floor(final / 60)}:${String(Math.round(final % 60)).padStart(2, '0')}  ${(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=size', '-of', 'csv=p=0', OUT]).toString().trim() / 1e6).toFixed(1)} MB`)
