/**
 * The renderer's constants, held to the measurement that produced them.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS TEST IS FOR, AND WHAT IT IS CAREFUL NOT TO BE
 *
 * It is NOT a performance test. It runs no browser and times nothing; `pnpm measure` does that,
 * takes minutes, and is hardware-dependent, which is why it is a deliberate act rather than
 * something a CI run silently re-decides.
 *
 * What this asserts is that `DRAW_BUDGET`, `SPRITE_MIN_ZOOM` and `GROUND_MIN_ZOOM` still follow
 * from `docs/render-budget.json` — the rows the last real run wrote. So the constants cannot
 * drift away from their evidence in silence, and a run that produces different numbers turns this
 * red until somebody reconciles the two.
 *
 * ── The trap this file is written around ──────────────────────────────────────────────────────
 *
 * The obvious version of this test compares the constants against numbers typed into the test —
 * which is the self-referential assertion this estate found tonight, where a page was compared
 * against the same constant it rendered from. Both sides came from the same place, so it could not
 * fail.
 *
 * So every expectation below is DERIVED FROM THE MEASURED ROWS by arithmetic, and never typed. The
 * budget is computed from the measured microseconds per draw; the zoom floor is computed from the
 * measured zoom at which a Plot fits. If the JSON changes, the expectations change with it, and
 * the constants have to move to match.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, type TestContext } from 'node:test'
import { DRAW_BUDGET, GROUND_MIN_ZOOM, SPRITE_MIN_ZOOM } from '../src/render/renderer.ts'
import { zoomToFit } from '../src/render/iso.ts'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const JSON_PATH = join(REPO, 'docs', 'render-budget.json')

interface Row {
  name: string
  viewport: string
  throttle: number
  drawn: number
  ground: number
  zoomUsed: number
  p50: number
  framep50: number
  fps: number
}

interface Run {
  measuredAt: string
  machine: { cpu: string; rasteriser: string; softwareRaster: boolean }
  results: Row[]
}

function load(t: TestContext): Run | null {
  if (!existsSync(JSON_PATH)) {
    // A skip, never a `return`. Six tests in this estate tonight `return`ed instead of skipping
    // and therefore passed.
    t.skip('docs/render-budget.json is absent — run `pnpm measure`')
    return null
  }
  return JSON.parse(readFileSync(JSON_PATH, 'utf8')) as Run
}

const pick = (run: Run, name: string, throttle: number, viewport = '1440x900'): Row => {
  const row = run.results.find(
    (r) => r.name === name && r.throttle === throttle && r.viewport === viewport,
  )
  assert.ok(row, `no measured row for ${name} at ${throttle}x ${viewport}`)
  return row
}

test('the numbers came from a GPU, not a software rasteriser', (t: TestContext) => {
  const run = load(t)
  if (!run) return
  // ══════════════════════════════════════════════════════════════════════════════════════════
  // The single most important thing about the run. Headless Chromium rasterises on the CPU by
  // default, and a Canvas 2D number taken that way describes a machine nobody plays on — the
  // first complete run of this harness reported 200 microseconds per draw for exactly that
  // reason. The rasteriser is READ BACK from the page rather than inferred from the flags.
  // ══════════════════════════════════════════════════════════════════════════════════════════
  assert.equal(
    run.machine.softwareRaster,
    false,
    `the recorded run used a software rasteriser (${run.machine.rasteriser}), so its numbers ` +
      'describe a CPU. Re-run `pnpm measure` on a machine where the GPU flags take.',
  )
  assert.match(run.machine.rasteriser, /\S/, 'no rasteriser was recorded at all')
})

test('DRAW_BUDGET follows from the measured cost per draw', (t: TestContext) => {
  const run = load(t)
  if (!run) return

  // 4×, because that is the Lighthouse proxy for the "mid laptop" §13 sets as the bar, and the
  // verdict is taken from it.
  const plot = pick(run, 'plot-fitted', 4)
  const court = pick(run, 'court-fitted', 4)

  const perDraw = (r: Row): number => (r.p50 * 1000) / (r.drawn + r.ground)
  const a = perDraw(plot)
  const b = perDraw(court)

  // The model this budget rests on: cost per draw is FLAT across scale. If a future run shows it
  // is not, the division below stops being a valid way to set a budget and this says so.
  assert.ok(
    Math.abs(a - b) / a < 0.25,
    `cost per draw is not flat across scale (${a.toFixed(1)}µs at ${plot.drawn + plot.ground} ` +
      `draws, ${b.toFixed(1)}µs at ${court.drawn + court.ground}). DRAW_BUDGET is derived by ` +
      'dividing a frame by this number, which only works while it is flat.',
  )

  // A 60 fps frame is 16.6 ms. The affordable draw count is that divided by the measured cost.
  const affordable = 16_600 / a
  assert.ok(
    DRAW_BUDGET <= affordable,
    `DRAW_BUDGET is ${DRAW_BUDGET} but the measurement affords only ${Math.round(affordable)} ` +
      'draws in a 60 fps frame at 4x throttle',
  )
  // And not absurdly conservative either — a budget far below what was measured is a budget that
  // degrades screens which would have been fine, which is its own defect.
  assert.ok(
    DRAW_BUDGET >= affordable * 0.7,
    `DRAW_BUDGET is ${DRAW_BUDGET}, well under the ${Math.round(affordable)} the measurement ` +
      'affords — screens that would render fine will be degraded',
  )
})

test('the zoom floor does not degrade a fitted Plot — the case it was set wrong for', (t: TestContext) => {
  const run = load(t)
  if (!run) return

  // ══════════════════════════════════════════════════════════════════════════════════════════
  // THIS IS THE ASSERTION THAT CAUGHT THE FIRST VALUE. The floor was 0.18; a Plot fits a
  // 1440×900 viewport at 0.1758. A floor above the fit means a player looking at their own
  // fully-built Plot sees bare ground — on the one screen the whole tier exists for.
  //
  // The fit is taken from the MEASURED row rather than recomputed, so this compares two
  // independent things: what the renderer will refuse, and what the run actually drove it at.
  // ══════════════════════════════════════════════════════════════════════════════════════════
  const plot = pick(run, 'plot-fitted', 4)
  assert.ok(
    SPRITE_MIN_ZOOM <= plot.zoomUsed,
    `SPRITE_MIN_ZOOM is ${SPRITE_MIN_ZOOM} and a fitted Plot is ${plot.zoomUsed} — a fully built ` +
      'Plot would render as bare ground',
  )
  assert.ok(GROUND_MIN_ZOOM <= plot.zoomUsed, 'a fitted Plot would render with no ground at all')

  // And the projection agrees with the measurement about what that zoom is, which is what makes
  // the row above evidence rather than a number the harness happened to print.
  const computed = zoomToFit(32, { width: 1440, height: 900 })
  assert.ok(
    Math.abs(computed - plot.zoomUsed) < 1e-6,
    `the harness drove a Plot at ${plot.zoomUsed} and zoomToFit says ${computed}`,
  )
})

test('the floor is above a Court fit, so a Court is walked rather than looked at', (t: TestContext) => {
  const run = load(t)
  if (!run) return
  const court = pick(run, 'court-fitted', 4)

  // The Court cap does NOT hold at 4x — 20 fps — so the client must not offer the zoom that puts
  // a whole Court on screen. That is a client decision and this is where it is pinned.
  assert.ok(court.fps < 60, `a fitted Court now runs at ${court.fps} fps; the floor may be relaxed`)
  assert.ok(
    SPRITE_MIN_ZOOM > court.zoomUsed,
    `SPRITE_MIN_ZOOM is ${SPRITE_MIN_ZOOM} and a fitted Court is ${court.zoomUsed} — the client ` +
      `would offer a zoom that measured ${court.fps} fps`,
  )
})

test('the Plot cap survives, and the record says so in the numbers', (t: TestContext) => {
  const run = load(t)
  if (!run) return
  const plot = pick(run, 'plot-fitted', 4)

  // §13's exact question: "if 640 sprites in a Plot does not hold 60 fps on a mid laptop, the caps
  // change and several other numbers move with them."
  assert.equal(plot.drawn, 640, 'the Plot scenario no longer places the full cap')
  assert.ok(
    plot.fps >= 58,
    `640 sprites in a Plot measured ${plot.fps} fps at 4x throttle. §6.2's Plot cap does NOT ` +
      'survive, and docs/RENDER-BUDGET.md says the opposite — reconcile them.',
  )
})

test('texture count is not a factor, which is why 96 seed objects are safe', (t: TestContext) => {
  const run = load(t)
  if (!run) return
  const few = pick(run, 'plot-fitted', 4)
  const many = pick(run, 'plot-fitted-96-textures', 4)
  // The seed set is 96 objects (§2.6) and only some of them existed when this was measured, so
  // the run synthesises the rest as genuinely distinct bitmaps. If a future run shows texture
  // pressure appearing, the 96-object seed set becomes a rendering decision and not just an art
  // one — and this is where that would first be visible.
  assert.ok(
    many.p50 < few.p50 * 1.3,
    `96 distinct textures cost ${many.p50}ms against ${few.p50}ms for the smaller set — texture ` +
      'pressure has appeared and docs/RENDER-BUDGET.md claims it has not',
  )
})
