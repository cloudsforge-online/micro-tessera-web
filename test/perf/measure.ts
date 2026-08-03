/**
 * THE MEASUREMENT. `pnpm measure`.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS IS FOR
 *
 * docs/ecosystem/23-tessera.md §13, "What I could not verify":
 *
 *   > **Browser rendering performance for a densely built parcel.** No prototype exists. The
 *   > object caps in §6.2 are reasoned from tile counts, not measured. **This is the riskiest
 *   > unmeasured number in the document**, and measuring it should be the first thing phase 1
 *   > does — if 640 sprites in a Plot does not hold 60 fps on a mid laptop, the caps change and
 *   > several other numbers move with them.
 *
 * This is that measurement, and it was written before the client's screens were, so the client's
 * shape is settled around the answer rather than around the assumption.
 *
 * ── What is real here, and what is not. Said first, because it decides what the numbers mean ──
 *
 * REAL:
 *   - A real Chromium, driven by playwright-core, painting to a real compositor.
 *   - The REAL renderer — `src/render/renderer.ts`, imported and bundled, not a benchmark
 *     rewritten to be fast. If the renderer is slow, this reports it.
 *   - REAL sprite bytes: the 512×512 FLUX 2 Pro generations in
 *     `micro-tessera-assets/assets/objects/` and the 256×128 projected tiles in
 *     `assets/tiles/`, served over HTTP and decoded by the browser's own PNG decoder.
 *   - `requestAnimationFrame` timing, so the number is frames the compositor actually presented.
 *
 * NOT REAL, and named rather than smoothed over:
 *   - The object sprites are not yet cut out to alpha. `cutout.py` is a derive step
 *     `micro-tessera-assets` has written but not yet run over set 3, so the PNGs on disk are RGB
 *     on the pinned `#12100f` ground. Alpha is therefore keyed IN THE BROWSER at load time, once,
 *     which produces exactly the RGBA texture production will decode — the per-frame cost measured
 *     is a blend of a 512×512 RGBA texture either way. What is NOT measured is the decode cost of
 *     the real cut-out PNG, which will differ in file size and therefore in load time, not in
 *     frame time.
 *   - Nineteen distinct object sprites exist so far, not ninety-six. They are cycled. A GPU
 *     texture cache is friendlier to nineteen textures than to ninety-six, so the reported numbers
 *     are optimistic on cache pressure by an amount this run cannot bound. §"Texture pressure"
 *     below measures the direction and size of that effect by re-running with the sprites
 *     multiplied into distinct bitmaps.
 *   - One machine. The hardware is recorded in the output. "A mid laptop" is the design's bar and
 *     this is not one; the CPU-throttled pass exists to approximate one.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import { createServer } from 'node:http'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { cpus, totalmem } from 'node:os'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { chromium } from 'playwright-core'
import { chromePath } from './harness.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')
const ASSETS = resolve(REPO, '..', 'tessera-assets', 'assets')

/* ── the scenarios ─────────────────────────────────────────────────────────────────────────── */

interface Scenario {
  readonly name: string
  /** What the design says about this case, so the output is readable next to the doc. */
  readonly claim: string
  /** Side of the square parcel, in tiles. */
  readonly side: number
  /** Objects placed on it. */
  readonly objects: number
  /** 'fit' zooms so the whole parcel is on screen; a number is a literal zoom. */
  readonly zoom: 'fit' | number
  /** Distinct textures, to separate draw-call cost from texture-cache pressure. */
  readonly textures?: number
}

/**
 * Every case the caps in §6.2 actually make a claim about, plus the two the design does not talk
 * about and which the projection maths says are the ones that matter.
 */
const SCENARIOS: readonly Scenario[] = [
  {
    name: 'plot-full-zoom',
    claim: '§6.2 Plot: 32×32, cap 640. At zoom 1 the viewport holds ~127 tiles, so the cap cannot',
    side: 32,
    objects: 640,
    zoom: 1,
  },
  {
    name: 'plot-fitted',
    claim: '§6.2 Plot at the zoom where the whole 32×32 claim is on screen — the cap fully spent',
    side: 32,
    objects: 640,
    zoom: 'fit',
  },
  {
    name: 'court-fitted',
    claim: '§6.2 Court: 64×64, cap 2,560, whole claim on screen',
    side: 64,
    objects: 2560,
    zoom: 'fit',
  },
  {
    name: 'quarter-fitted',
    claim: '§6.2 Quarter: 128×128, cap 10,240, whole claim on screen',
    side: 128,
    objects: 10240,
    zoom: 'fit',
  },
  {
    name: 'ward-quarter-density',
    claim: 'THE CASE §6.2 DOES NOT COVER: a ward at the uniform 5-per-8-tile density, camera at ' +
      'the zoom a player pans a neighbourhood at (0.35). Not one parcel — many.',
    side: 256,
    objects: Math.round(256 * 256 * (5 / 8)),
    zoom: 0.35,
  },
  {
    name: 'ward-fitted',
    claim: 'A whole 256×256 ward on screen at 5-per-8 density — 40,960 objects. What "zoom out ' +
      'to see the ward" costs if the world view is allowed to become the ward map.',
    side: 256,
    objects: Math.round(256 * 256 * (5 / 8)),
    zoom: 'fit',
  },
  {
    name: 'plot-fitted-96-textures',
    claim: 'plot-fitted again with 96 distinct textures rather than 19 — the full seed set (§2.6), ' +
      'to separate draw-call cost from texture-cache pressure',
    side: 32,
    objects: 640,
    zoom: 'fit',
    textures: 96,
  },
]

/** Viewports: a laptop, and the phone the design says this is played on as much as a desk. */
const VIEWPORTS = [
  { name: '1440x900', width: 1440, height: 900, dpr: 2 },
  { name: '390x844', width: 390, height: 844, dpr: 3 },
] as const

/* ── serving the bundle and the real bytes ─────────────────────────────────────────────────── */

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
}

async function bundle(): Promise<string> {
  const result = await build({
    entryPoints: [join(HERE, 'page.ts')],
    bundle: true,
    format: 'esm',
    target: 'es2022',
    write: false,
    // Production settings, because a debug build's numbers are a debug build's numbers.
    minify: true,
    sourcemap: false,
  })
  const file = result.outputFiles?.[0]
  if (!file) throw new Error('esbuild produced no output')
  return file.text
}

async function spriteManifest(): Promise<{ objects: string[]; tiles: string[] }> {
  const objects = (await readdir(join(ASSETS, 'objects')))
    .filter((f) => f.endsWith('.png'))
    .sort()
    .map((f) => `/assets/objects/${f}`)
  const tiles = (await readdir(join(ASSETS, 'tiles')))
    .filter((f) => f.endsWith('.png'))
    .sort()
    .map((f) => `/assets/tiles/${f}`)
  if (objects.length === 0 || tiles.length === 0) {
    throw new Error(
      `No sprites under ${ASSETS}. This measurement is worthless against synthetic rectangles — ` +
        'it exists to measure the cost of the real 512x512 FLUX bytes.',
    )
  }
  return { objects, tiles }
}

/* ── the run ───────────────────────────────────────────────────────────────────────────────── */

interface Result extends Scenario {
  readonly viewport: string
  readonly dpr: number
  readonly throttle: number
  readonly zoomUsed: number
  readonly visible: number
  readonly drawn: number
  readonly p50: number
  readonly p95: number
  readonly worst: number
  readonly fps: number
  readonly degraded: boolean
  readonly loadMs: number
}

async function main(): Promise<void> {
  const [js, sprites, exe] = await Promise.all([bundle(), spriteManifest(), chromePath()])

  const page = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:#12100f;overflow:hidden}
    canvas{display:block}
  </style></head><body><script type="module">${js}</script></body></html>`

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': MIME['.html'] as string }).end(page)
      return
    }
    if (url.pathname === '/favicon.ico') {
      // 204, not 404. Chromium asks for this unprompted, and the run treats a console error as a
      // broken page — correctly. A 404 the harness itself caused would abort a valid measurement,
      // and "allow this one error" is how a real 404 gets allowed six months later.
      res.writeHead(204).end()
      return
    }
    if (url.pathname === '/sprites.json') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(sprites))
      return
    }
    if (url.pathname.startsWith('/assets/')) {
      // No `..` can escape: the path is joined onto ASSETS and then checked to still be under it.
      const file = join(ASSETS, url.pathname.slice('/assets/'.length))
      if (!file.startsWith(ASSETS)) {
        res.writeHead(403).end()
        return
      }
      readFile(file).then(
        (buf) =>
          res
            .writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
            .end(buf),
        () => res.writeHead(404).end(),
      )
      return
    }
    res.writeHead(404).end()
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('no port')
  const origin = `http://127.0.0.1:${address.port}`

  const browser = await chromium.launch({ executablePath: exe, headless: true })
  const results: Result[] = []

  try {
    for (const throttle of [1, 4]) {
      for (const viewport of VIEWPORTS) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: viewport.dpr,
        })
        const tab = await context.newPage()
        const errors: string[] = []
        tab.on('pageerror', (e) => void errors.push(String(e)))
        tab.on('console', (m) => {
          if (m.type() === 'error') errors.push(m.text())
        })

        // CPU throttling through CDP. 4× is the multiplier Lighthouse uses to approximate a
        // mid-range machine from a development one, and "a mid laptop" is the bar §13 sets.
        const cdp = await context.newCDPSession(tab)
        if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle })

        await tab.goto(origin, { waitUntil: 'load' })
        await tab.waitForFunction('window.__tesseraReady === true', undefined, { timeout: 120_000 })

        for (const scenario of SCENARIOS) {
          const measured = (await tab.evaluate(
            (s) => (window as unknown as TesseraWindow).__tesseraRun(s),
            scenario as unknown as Record<string, unknown>,
          )) as Omit<Result, keyof Scenario | 'viewport' | 'dpr' | 'throttle'>
          results.push({
            ...scenario,
            viewport: viewport.name,
            dpr: viewport.dpr,
            throttle,
            ...measured,
          })
          process.stdout.write(
            `${throttle}x ${viewport.name} ${scenario.name.padEnd(26)} ` +
              `p50 ${measured.p50.toFixed(2)}ms  p95 ${measured.p95.toFixed(2)}ms  ` +
              `${measured.fps.toFixed(0)} fps  drawn ${measured.drawn}` +
              `${measured.degraded ? '  [DEGRADED]' : ''}\n`,
          )
        }

        if (errors.length > 0) {
          throw new Error(
            `The measurement page produced console errors, so its numbers describe a broken ` +
              `page: ${errors.slice(0, 3).join(' | ')}`,
          )
        }
        await context.close()
      }
    }
  } finally {
    await browser.close()
    server.close()
  }

  await writeFile(join(REPO, 'docs', 'render-budget.json'), JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      machine: {
        platform: process.platform,
        arch: process.arch,
        cpu: cpus()[0]?.model ?? 'unknown',
        cores: cpus().length,
        memGB: Math.round(totalmem() / 1e9),
        chrome: exe,
      },
      spriteCount: { objects: sprites.objects.length, tiles: sprites.tiles.length },
      results,
    },
    null,
    2,
  ) + '\n')
  process.stdout.write(`\nwrote docs/render-budget.json (${results.length} rows)\n`)
}

interface TesseraWindow {
  __tesseraRun(s: Record<string, unknown>): Promise<Record<string, number | boolean>>
}

await main()
