/**
 * The measurement page: what actually runs inside Chromium.
 *
 * It imports the REAL renderer from `src/render/`. Nothing here is a re-implementation tuned to
 * look fast — if `WorldRenderer.draw` is slow, this reports it slow. That is the whole point:
 * a benchmark of a benchmark measures the benchmark.
 *
 * The one deliberate difference from production: {@link SPRITE_BUDGET} and {@link SPRITE_MIN_ZOOM}
 * are the thresholds this measurement EXISTS to choose, so the scenarios drive the renderer with
 * degradation disabled. Measuring a renderer that refuses to draw past its budget would produce a
 * flat line at the budget and prove nothing about where the budget belongs.
 */
import { WorldRenderer } from '../../src/render/renderer.ts'
import { zoomToFit } from '../../src/render/iso.ts'
import type { Placement, Scene } from '../../src/render/scene.ts'

interface ScenarioIn {
  name: string
  side: number
  objects: number
  zoom: 'fit' | number
  textures?: number
}

const canvas = document.createElement('canvas')
document.body.appendChild(canvas)
const ctx = canvas.getContext('2d', { alpha: false })
if (!ctx) throw new Error('no 2d context')

/* ── real bytes ─────────────────────────────────────────────────────────────────────────────── */

/**
 * Key the pinned `#12100f` ground to alpha, in the browser.
 *
 * `cutout.py` is `micro-tessera-assets`' derive step and it has not been run over set 3 yet, so
 * the object PNGs on disk are RGB on the pinned ground rather than RGBA. Doing the key here
 * produces the same RGBA texture the browser will decode in production — which is what the
 * per-frame cost depends on. It is a LOAD-time cost and is excluded from every frame timing
 * below; `loadMs` reports it separately so the two are never conflated.
 *
 * The threshold is generous (a Manhattan distance of 24 from the target) because the ground is
 * normalised to `#12100f` numerically rather than exactly — `brand/normalise_ground.py:27` states
 * the target and the reason: FLUX will not hit an exact hex.
 */
function keyToAlpha(source: ImageBitmap, tint: number): ImageBitmap | Promise<ImageBitmap> {
  const off = new OffscreenCanvas(source.width, source.height)
  const octx = off.getContext('2d')
  if (!octx) throw new Error('no offscreen 2d context')
  octx.drawImage(source, 0, 0)
  const data = octx.getImageData(0, 0, off.width, off.height)
  const px = data.data
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i] as number
    const g = px[i + 1] as number
    const b = px[i + 2] as number
    if (Math.abs(r - 0x12) + Math.abs(g - 0x10) + Math.abs(b - 0x0f) < 24) {
      px[i + 3] = 0
    } else if (tint !== 0) {
      // Make an otherwise-identical texture distinct, for the texture-pressure scenario. A
      // one-channel shift is enough that the GPU cannot alias two uploads to one entry, and small
      // enough that it does not change what is being drawn.
      px[i] = (r + tint) & 0xff
    }
  }
  octx.putImageData(data, 0, 0)
  return createImageBitmap(off)
}

const objectSprites: ImageBitmap[] = []
const tileSprites: ImageBitmap[] = []
let loadMs = 0

async function load(): Promise<void> {
  const started = performance.now()
  const manifest = (await (await fetch('/sprites.json')).json()) as {
    objects: string[]
    tiles: string[]
  }
  const fetchBitmap = async (url: string): Promise<ImageBitmap> =>
    createImageBitmap(await (await fetch(url)).blob())

  const rawObjects = await Promise.all(manifest.objects.map(fetchBitmap))
  const rawTiles = await Promise.all(manifest.tiles.map(fetchBitmap))
  for (const bmp of rawObjects) objectSprites.push(await keyToAlpha(bmp, 0))
  // Ground tiles are opaque by construction — a ground tile IS the ground — so they are used as
  // decoded. Keying them would punch holes in the floor.
  for (const bmp of rawTiles) tileSprites.push(bmp)
  loadMs = performance.now() - started
}

/** Grow the object set to `count` DISTINCT textures, for the texture-pressure scenario. */
async function widenTextures(count: number): Promise<ImageBitmap[]> {
  const out: ImageBitmap[] = [...objectSprites]
  let tint = 1
  while (out.length < count) {
    const base = objectSprites[out.length % objectSprites.length] as ImageBitmap
    out.push(await keyToAlpha(base, tint))
    tint = (tint % 60) + 1
  }
  return out.slice(0, count)
}

/* ── building a dense parcel ────────────────────────────────────────────────────────────────── */

/**
 * A representative dense parcel.
 *
 * Deterministic, so two runs measure the same picture. The distribution is chosen to be HARDER
 * than a real parcel rather than easier, in the two ways that cost:
 *
 *   - Objects are spread over the whole claim rather than clustered, so the viewport-space cull
 *     rejects as little as possible and the depth sort has the widest key range.
 *   - One in eight is 2×2 and one in two faces -1, so the mirrored path — a save/translate/
 *     scale/restore around every drawImage — is exercised at the rate the world will exercise it.
 *     A measurement that only drew the cheap path would be measuring half the renderer.
 */
function buildScene(side: number, objects: number, textureCount: number): Scene {
  const ground: Scene['ground'] = Array.from({ length: side * side }, (_, i) => ({
    tile: { tx: i % side, ty: Math.floor(i / side) },
    sprite: `t${i % tileSprites.length}`,
  }))

  const placements: Placement[] = []
  // A cheap deterministic hash, so the layout is the same every run without carrying a PRNG.
  let h = 0x9e3779b9
  const next = (): number => {
    h ^= h << 13
    h ^= h >>> 17
    h ^= h << 5
    return (h >>> 0) / 0x100000000
  }
  const seen = new Set<number>()
  while (placements.length < objects) {
    const tx = Math.floor(next() * side)
    const ty = Math.floor(next() * side)
    const key = ty * side + tx
    if (seen.has(key)) continue
    seen.add(key)
    placements.push({
      id: `p${placements.length}`,
      tile: { tx, ty },
      footprint: placements.length % 8 === 0 ? '2x2' : '1x1',
      facing: placements.length % 2 === 0 ? 1 : -1,
      sprite: `o${placements.length % textureCount}`,
    })
  }
  return { wardId: 'measure', ground, placements }
}

/* ── the run ────────────────────────────────────────────────────────────────────────────────── */

const FRAMES = 90
/**
 * Frames discarded before sampling starts.
 *
 * Thirty rather than a handful, because the first pass over a scene pays three one-off costs that
 * are not steady state and are large: uploading every texture to the GPU, baking every visible
 * ground chunk, and growing the draw list array to its final length. The first version of this
 * file discarded twenty and still reported a p95 of 415 ms against a p50 of 14 — a distribution
 * that is not a frame time at all, it is a frame time with a texture upload in the tail.
 */
const WARMUP = 30

async function run(scenario: ScenarioIn): Promise<Record<string, number | boolean>> {
  const dpr = window.devicePixelRatio
  const width = window.innerWidth
  const height = window.innerHeight
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`

  const textureCount = scenario.textures ?? objectSprites.length
  const textures = textureCount > objectSprites.length
    ? await widenTextures(textureCount)
    : objectSprites

  const sceneStarted = performance.now()
  const scene = buildScene(scenario.side, scenario.objects, textures.length)
  const sceneMs = performance.now() - sceneStarted

  const renderer = new WorldRenderer(ctx as CanvasRenderingContext2D, {
    makeCanvas: (w, h) => {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      return c
    },
    dpr,
    // Degradation OFF, actually rather than in a comment. See RendererOptions.spriteBudget for
    // what the first version of this file did instead, and why the knob is passed rather than
    // asserted.
    spriteBudget: Number.POSITIVE_INFINITY,
    spriteMinZoom: 0,
  })
  renderer.setScene(scene)

  const sprites = {
    get(path: string): ImageBitmap | undefined {
      return path.charCodeAt(0) === 111 // 'o'
        ? textures[Number(path.slice(1)) % textures.length]
        : tileSprites[Number(path.slice(1)) % tileSprites.length]
    },
  }

  const zoom =
    scenario.zoom === 'fit' ? zoomToFit(scenario.side, { width, height }) : scenario.zoom
  // Centre on the middle of the claim, in world pixels.
  const mid = scenario.side / 2
  const camera = { x: 0, y: mid * 2 * (128 / 2), zoom }
  const viewport = { width, height }

  const samples: number[] = []
  let visible = 0
  let drawn = 0
  let degraded = false

  // DEGRADATION IS DISABLED for the measurement, by driving `draw` at a camera the renderer would
  // have degraded and reading its stats anyway — the budget constants are what this run exists to
  // choose, so measuring a renderer that already enforces them measures the guess.
  const forced = { ...camera, zoom: Math.max(zoom, 1e-6) }

  for (let i = 0; i < FRAMES + WARMUP; i += 1) {
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
    const t0 = performance.now()
    const stats = renderer.draw(forced, viewport, sprites)
    // Force the frame to actually land rather than sit in the command queue: reading one pixel is
    // a synchronous flush of everything queued. Without it a Canvas 2D benchmark measures how fast
    // JavaScript can ENQUEUE draw calls, which is not the number anybody cares about.
    ;(ctx as CanvasRenderingContext2D).getImageData(0, 0, 1, 1)
    const ms = performance.now() - t0
    if (i >= WARMUP) samples.push(ms)
    visible = stats.visible
    drawn = stats.sprites
    degraded = stats.degraded
  }

  samples.sort((a, b) => a - b)
  const at = (q: number): number => samples[Math.min(samples.length - 1, Math.floor(q * samples.length))] as number
  const p50 = at(0.5)
  return {
    zoomUsed: zoom,
    visible,
    drawn,
    p50,
    p95: at(0.95),
    worst: samples[samples.length - 1] as number,
    fps: p50 > 0 ? 1000 / p50 : 0,
    degraded,
    loadMs,
    sceneBuildMs: sceneMs,
  }
}

;(window as unknown as Record<string, unknown>)['__tesseraRun'] = run
await load()
;(window as unknown as Record<string, unknown>)['__tesseraReady'] = true
