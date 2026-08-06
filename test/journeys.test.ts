/**
 * The browser journeys of this surface, tiers 1 and 2, run for real into `happy-dom`.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE ONE RULE. Doc 22 §3: **a browser scenario may never assert a business rule.**
 *
 * The reason is a recorded incident: a game client withheld four SKUs from its UI while the
 * payment routes stayed live and chargeable, and a client-side test of the hidden catalogue would
 * have passed, green, against the defect — because hiding them WAS the entire control.
 *
 * So every scenario below asserts one of exactly three things (§3.1): what a human can see
 * RELATIVE TO WHAT THE API RETURNED IN THE SAME RUN, what this client SENT, or where the browser
 * ended up. Where an outcome turns on a rule the server enforces, `test/journeys.ts` carries an
 * `ownedBy` path to the test that owns it, and the meta-tests at the bottom of this file refuse
 * the suite when one is missing.
 *
 * The corollary this file obeys: several scenarios end in a refusal. In every case the assertion
 * is on the SENTENCE THE USER IS SHOWN, never on the refusal itself.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Each test is named with its id. `test/journeys.ts` is the catalogue, the ones that cannot be
 * written here carry their blocker, and the meta-tests assert the two agree — so a scenario cannot
 * be dropped by deleting its test, and a blocker cannot go stale without something going red.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, test } from 'node:test'
import { createElement as h, type ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'

import { withScreen, type Routes, type Screen as Rendered } from './dom.ts'
import { assetSetAvailable, receiptFromManifest } from './asset-set.ts'
import {
  LISTING,
  OBJECT,
  PARCEL,
  RANKED,
  SIGNED_IN,
  TERMS,
  WARD,
  parcelOfTier,
  placements,
} from './fixtures.ts'
import {
  SCENARIOS,
  SCREENS,
  checkCatalogue,
  homeOf,
  isImplemented,
  resolve,
  type Scenario,
} from './journeys.ts'
import { App } from '../src/app.tsx'
import { DiscoverPage } from '../src/pages/discover.tsx'
import { KilnPage } from '../src/pages/kiln.tsx'
import { LandPage } from '../src/pages/land.tsx'
import { WardsPage } from '../src/pages/wards.tsx'
import { WorkshopPage } from '../src/pages/workshop.tsx'
import { WorldPage } from '../src/pages/world.tsx'
import { ROUTES, routeFor } from '../src/lib/routes.ts'

const ORIGIN = 'https://tessera.cloudsforge.online'
const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url))
const SESSION = { storage: { ...SIGNED_IN } } as const

/** A page under a router at `path`. Every page reaches for `useSearchParams` or a `<Link>`. */
const page = (element: ReactElement, path = '/'): ReactElement =>
  h(MemoryRouter, { initialEntries: [path] }, element)

/**
 * The world screen's own options: a recording 2D context, and a DECLARED viewport.
 *
 * 1440×900 is the viewport `docs/render-budget.json` was measured at, and it is stated rather than
 * left to `WorldCanvas`'s own 960×540 fallback because the zoom floor is a comparison against the
 * zoom a parcel FITS at: a Plot fits 1440×900 at 0.176 and 960×540 at 0.117, and the floor is
 * 0.170. One of those two screens degrades a fully-built Plot and the other does not.
 */
const WORLD = { canvas2d: true, viewport: { width: 1440, height: 900 } } as const

/** Ground and object sprites 404, which is what a checkout with no assets served really does. */
const NO_SPRITES: Routes = { 'GET /world-assets/': { status: 404 } }

/**
 * The real materialised set, served the way an nginx mount serves it.
 *
 * The receipt at `SET.json`, a 200 for exactly the paths it names, and a 404 for everything else
 * — which is `tessera-web/nginx.conf`, `try_files $uri =404` with no fallback. Both sides come
 * from `micro-tessera-assets`' own files, so nothing here is a third spelling of the convention.
 */
function mountedSet(): Routes {
  const receipt = receiptFromManifest()
  const served = new Set(receipt.files.map((f) => f.path))
  return {
    'GET /world-assets/': (wire) => {
      const path = wire.path.replace(/^\/world-assets\//, '')
      if (path === 'SET.json') return { body: receipt }
      return served.has(path) ? { body: {} } : { status: 404 }
    },
  }
}

/** The live region beside the canvas — the only textual account of what the renderer decided. */
const frameLine = (s: Rendered): string =>
  s.textOf(s.document.querySelector('.tw-world__stats'))

/** The other one: how much floor the renderer actually put down. Zero is a world of holes. */
const groundLine = (s: Rendered): string =>
  s.textOf(s.document.querySelector('.tw-world__ground'))

/**
 * One table row, read as `{ column header → cell }`.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * SCOPE THE LITERAL TO THE CELL, NOT TO THE ROW — AND THE ROW WAS ALREADY TOO WIDE.
 *
 * The first version of BJ-TES-22 matched `\b7 Sparks` against the row's whole text, which
 * `textOf` collapses to `…400 Sparks7 Sparks13 Sparks380 Sparks…` because adjacent cells have no
 * whitespace between them in the DOM. There is no word boundary between `s` and `7`, so the
 * assertion went red against correct markup — and the version that would have "fixed" it by
 * dropping the boundary would have let the fee assertion be satisfied by the ROYALTY column.
 *
 * A money assertion that cannot tell one column from the next is not a money assertion. So the
 * cells are keyed by their own column header, which is also the only addressing that survives a
 * column being inserted.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
function cellsOf(s: Rendered, row: Element): Record<string, string> {
  const table = row.closest('table')
  assert.ok(table, 'the row is not inside a table')
  const headers = [...table.querySelectorAll('thead th')].map((th) => s.textOf(th))
  const cells = [...row.querySelectorAll('th,td')].map((c) => s.textOf(c))
  assert.equal(
    cells.length,
    headers.length,
    `the row has ${cells.length} cells and the head has ${headers.length} columns`,
  )
  return Object.fromEntries(headers.map((name, i) => [name, cells[i] as string]))
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   The world — a Canvas 2D isometric renderer, and the parcel standing under it
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('BJ-TES — the world', () => {
  /**
   * ── HOW THE ZOOM FLOOR IS GUARDED WITHOUT RE-MEASURING ────────────────────────────────────
   *
   * `test/render-budget.test.ts` already holds `SPRITE_MIN_ZOOM` to the measured row: the floor
   * must be at or below the zoom at which a Plot fits. That is an assertion about two NUMBERS.
   *
   * It leaves a gap, and the gap is the half a user experiences. The floor is only meaningful
   * because `WorldCanvas` opens a parcel FITTED — `zoomToFit(parcel.size, viewport)` — and nothing
   * held those two facts together. Change the initial camera, or the clamp around it, and the
   * constant would still satisfy its measurement while a player looking at their own Plot saw
   * bare ground. So this scenario drives the real component at the real viewport and reads the
   * sentence the renderer produced.
   *
   * It re-measures nothing: no timing, no browser, no GPU. The recording context draws no pixels.
   * What it reads back is `FrameStats.degraded`, which is a COMPARISON the renderer made between
   * its own floor and its own camera, rendered into a live region as text.
   */
  it('★ BJ-TES-01 [T1/presentation] a fitted Plot is drawn as a place, not as bare ground', async () => {
    const parcel = parcelOfTier('plot')
    const routes: Routes = {
      ...NO_SPRITES,
      'GET /v1/wards': { body: { wards: [WARD] } },
      'GET /v1/parcels/': { body: { parcel, placements: placements(640) } },
    }
    await withScreen(page(h(WorldPage), `/?parcel=${parcel.id}`), { ...SESSION, ...WORLD, routes }, async (s) => {
      // The loop ran. Without this the scenario could pass against a component that never called
      // the renderer at all — which is exactly what happens when `getContext('2d')` answers null,
      // and is the reason `canvas2d` exists.
      assert.ok(s.canvas.fillRect > 0, 'the renderer never drew a frame, so nothing was decided')

      // The non-degraded sentence, which names BOTH numbers: what it drew, and what is there. The
      // gap between them is the missing sprites, and a screen that could not say there was a gap
      // would be a screen on which a hole is invisible.
      assert.match(
        frameLine(s),
        /^\d+ of 640 objects in view\.$/,
        'a fully built Plot reported itself as degraded — the zoom floor is above the zoom a ' +
          'Plot fits at, so the one screen the Plot tier exists for renders as empty ground',
      )
    })
  })

  it('BJ-TES-02 [T1/presentation] a Court says its objects are not drawn, and what to do', async () => {
    const parcel = parcelOfTier('court')
    const routes: Routes = {
      ...NO_SPRITES,
      'GET /v1/wards': { body: { wards: [WARD] } },
      'GET /v1/parcels/': { body: { parcel, placements: placements(900) } },
    }
    await withScreen(page(h(WorldPage), `/?parcel=${parcel.id}`), { ...SESSION, ...WORLD, routes }, async (s) => {
      assert.ok(s.canvas.fillRect > 0, 'the renderer never drew a frame')

      // The other side of BJ-TES-01, and the reason that one is not passing because degradation is
      // simply broken. A Court fits at 0.088, well under the floor, and §6.4 already puts the
      // overview on a different screen — so this is the renderer agreeing with the design.
      const line = frameLine(s)
      assert.match(line, /too many to draw at this zoom/, 'a Court silently rendered as bare ground')
      assert.match(
        line,
        /Zoom in to see what is standing here/,
        'the page says the objects are not drawn and does not say what would draw them',
      )
      // And it still says HOW MANY are there, so "empty" and "too much to show" are distinguishable.
      assert.match(line, /900 objects in view/, 'the count of what is standing here is not stated')
    })
  })

  it('★ BJ-TES-03 [T1/presentation] a sprite that will not load is named and counted, never substituted', async () => {
    const parcel = parcelOfTier('plot')
    const three = placements(3)
    const routes: Routes = {
      ...NO_SPRITES,
      'GET /v1/wards': { body: { wards: [WARD] } },
      'GET /v1/parcels/': { body: { parcel, placements: three } },
    }
    await withScreen(page(h(WorldPage), `/?parcel=${parcel.id}`), { ...SESSION, ...WORLD, routes }, async (s) => {
      // Drawn versus present, from the response's own count. `0 of 3` is the honest reading of a
      // parcel whose sprites all 404: the objects are there and none of them could be painted.
      assert.match(frameLine(s), /^0 of 3 objects in view\.$/, 'the hole is not countable')

      const alert = s.byRole('alert', /could not be loaded/)
      const text = s.textOf(alert)
      assert.match(
        text,
        /nothing has been substituted for them/,
        'the page does not say that no placeholder was drawn',
      )
      // Named, not merely counted — by the id the world stores, so the hole is findable.
      assert.ok(
        three.some((p) => text.includes(`objects/${p.objectId}`)),
        `no unresolved sprite was named: ${text}`,
      )
    })
  })

  /**
   * ── THE SCENARIO EVERY OTHER WORLD SCENARIO IS THE MIRROR OF ──────────────────────────────
   *
   * BJ-TES-01 to -03 all run against `NO_SPRITES`: `/world-assets/` 404s and they assert the
   * shape of a world with no art in it. That is a real state and worth asserting, and it is also
   * why thirty-eight implemented scenarios could not see the defect that mattered — NOT ONE OF
   * THEM EVER SERVED A SPRITE. The client asked for `tiles/ashfield-ground-a.png` while the set
   * held `tiles/ashfield-ground-a-256x128.png`, and against a 404-everything mount those two are
   * the same request.
   *
   * So this one serves the REAL set: the receipt built from `micro-tessera-assets`' own
   * `MANIFEST.json`, keyed by its own `providers.json`, and a 200 for exactly the paths that
   * receipt names — 404 for everything else, which is what a real nginx mount does. A client that
   * spells a filename gets nothing. What is asserted is `FrameStats.ground`, the renderer's count
   * of tiles it ACTUALLY DREW, which is zero for a world of holes.
   *
   * It needs the sibling repository and SKIPS without it, per `test/citations.test.ts`. A skipped
   * test catches nothing and says so; `test/red.sh` declares the sibling as required so it is not
   * reported as a guard that works when it did not run.
   */
  it('★ BJ-TES-37 [T1/presentation] a mounted set draws ground, at the names the set itself gives', async (t) => {
    if (!assetSetAvailable()) {
      t.skip('../tessera-assets is not checked out — this scenario cannot drive a real set')
      return
    }
    const parcel = parcelOfTier('plot')
    const routes: Routes = {
      ...mountedSet(),
      'GET /v1/wards': { body: { wards: [WARD] } },
      'GET /v1/parcels/': { body: { parcel, placements: [] } },
    }
    await withScreen(
      page(h(WorldPage), `/?parcel=${parcel.id}`),
      { ...SESSION, ...WORLD, decodeImages: true, routes },
      async (s) => {
        // The loop ran and it put something on the canvas. `fillRect` alone is the background,
        // which a world of holes also draws.
        assert.ok(s.canvas.drawImage > 0, 'not one drawImage — the canvas is a blank field')

        // THE BAR: the floor is drawn. Not that a path resolves, not that a file exists.
        const drawn = Number(groundLine(s).replace(/[^\d]/g, ''))
        assert.match(
          groundLine(s),
          /^[\d,]+ ground tiles drawn\.$/,
          `the world drew no ground: "${groundLine(s)}"`,
        )
        assert.ok(drawn > 0, 'the ground count is zero, so every tile is a hole')

        // And no ground tile is missing. This is the assertion that was false for as long as the
        // client spelled its own filenames, against a mount that was complete.
        const alert = s.queryByRole('alert', /could not be loaded/)
        const holes = alert ? s.textOf(alert) : ''
        assert.ok(!holes.includes('tiles/'), `a ground tile could not be loaded: ${holes}`)

        // ══════════════════════════════════════════════════════════════════════════════════════
        // ON THE WIRE, WHICH IS WHERE THE DEFECT WAS: the request carries the set's own filename,
        // and no request carries a name this bundle composed. `<identity>.png` is the exact shape
        // of the old construction, so a regression re-appears here as well as in the ground count.
        // ══════════════════════════════════════════════════════════════════════════════════════
        const asked = s.api.matching('GET /world-assets/').map((w) => w.path)
        assert.ok(
          asked.includes('/world-assets/SET.json'),
          'the receipt was never read, so the paths came from somewhere else',
        )
        assert.ok(
          asked.some((p) => p.endsWith('/tiles/ashfield-ground-a-256x128.png')),
          `the set's own path for tiles/ashfield-ground-a was never requested: ${asked.join(' ')}`,
        )
        assert.deepEqual(
          asked.filter((p) => /\/tiles\/[a-z-]+\.png$/.test(p)),
          [],
          'a sprite was requested at <identity>.png — this client is composing filenames again',
        )
      },
    )
  })

  /**
   * ── AND THE TWO WAYS AN EMPTY WORLD HAPPENS, TOLD APART ───────────────────────────────────
   *
   * A mount that was never mapped and a mount whose names this client cannot resolve produce the
   * same picture — nothing — and they have different owners: the first is `micro-deploy`, the
   * second is this bundle and `micro-tessera-assets` disagreeing about what an asset is called.
   * For one night the estate could not distinguish them from the screen. Now the screen says.
   *
   * No sibling needed: the subject is the sentence, and the receipt here is deliberately a small
   * one that names an asset the scene does not use.
   */
  it('BJ-TES-38 [T1/presentation] an empty world says whether the art is absent or merely unnameable', async () => {
    const parcel = parcelOfTier('homestead')
    const receipt = {
      provider: 'flux-2-pro',
      files: [{ key: 'tiles/somewhere-else-ground-a@256x128', path: 'tiles/x-256x128.png' }],
    }
    const routes: Routes = {
      'GET /world-assets/SET.json': { body: receipt },
      'GET /world-assets/': { status: 404 },
      'GET /v1/wards': { body: { wards: [WARD] } },
      'GET /v1/parcels/': { body: { parcel, placements: [] } },
    }
    await withScreen(
      page(h(WorldPage), `/?parcel=${parcel.id}`),
      { ...SESSION, ...WORLD, decodeImages: true, routes },
      async (s) => {
        assert.match(
          groundLine(s),
          /no floor under it/,
          'a world with no ground under it reports a floor',
        )
        const text = s.textOf(s.byRole('alert', /could not be loaded/))
        assert.match(
          text,
          /mounted flux-2-pro set names/,
          'the page does not say a set IS mounted, so an unresolvable name reads as a missing ' +
            'deploy — which is the wrong repository to send somebody to',
        )
        // A set that is mounted was not asked for a single sprite it does not name: the receipt
        // already answered, and a 404 nobody sees is how this defect stayed invisible.
        assert.deepEqual(
          s.api.matching('GET /world-assets/').map((w) => w.path),
          ['/world-assets/SET.json'],
          'the client requested a path the mounted set does not name',
        )
      },
    )
  })

  it('★ BJ-TES-04 [T1/client-request] leaving records one visit, with a dwell and no visitor', async () => {
    const parcel = parcelOfTier('plot')
    const routes: Routes = {
      ...NO_SPRITES,
      'GET /v1/wards': { body: { wards: [WARD] } },
      'GET /v1/wards/': { body: { parcels: [parcel] } },
      'GET /v1/parcels/': { body: { parcel, placements: placements(4) } },
      'POST /v1/parcels/': { status: 204 },
    }
    await withScreen(page(h(WorldPage), `/?parcel=${parcel.id}`), { ...SESSION, ...WORLD, routes }, async (s) => {
      assert.equal(
        s.api.matching('POST /v1/parcels/').length,
        0,
        'a visit was recorded on ARRIVAL — the dwell would then be a number this client picked ' +
          'on the way in rather than the time actually spent',
      )

      await s.click(s.byRole('button', 'Leave this place'))

      const sent = s.api.matching('POST /v1/parcels/')
      assert.equal(sent.length, 1, 'leaving did not record exactly one visit')
      const call = sent[0]
      assert.ok(call, 'no visit was sent')
      assert.match(call.path, /\/visits$/, 'the visit did not go to the visits route')
      assert.ok(call.path.includes(parcel.id), 'the visit named a different parcel')

      // ════════════════════════════════════════════════════════════════════════════════════════
      // THE ABSENCE THAT MATTERS, ASSERTED ON THE WIRE. §8.6 forbids synthetic footfall outright
      // and footfall is half the ranking function (§6.5), so a body-supplied visitor would be the
      // single most abusable field in this client. The service reads the authenticated subject
      // and this checks that nothing else is offered to it.
      // ════════════════════════════════════════════════════════════════════════════════════════
      const body = call.json as Record<string, unknown>
      assert.deepEqual(Object.keys(body), ['dwellSeconds'], 'the visit carried more than a dwell')
      assert.equal(typeof body['dwellSeconds'], 'number', 'the dwell is not a number')
      assert.ok((body['dwellSeconds'] as number) >= 0, 'the dwell is negative')
    })
  })

  it('BJ-TES-05 [T1/presentation] the arrivals list holds every parcel the ward returned', async () => {
    const open = parcelOfTier('plot', { id: 'aaaaaaaa-0000-4000-8000-000000000001', gateOpen: true })
    const shut = parcelOfTier('court', { id: 'aaaaaaaa-0000-4000-8000-000000000002', gateOpen: false })
    const routes: Routes = {
      'GET /v1/wards': { body: { wards: [WARD] } },
      'GET /v1/wards/': { body: { parcels: [open, shut] } },
    }
    await withScreen(page(h(WorldPage)), { ...SESSION, routes }, async (s) => {
      // One control per parcel in the response, addressed by accessible NAME rather than by
      // position — a list that dropped the shut one would leave the world looking empty while
      // being full, and §5 makes the shut gate a place you can still see.
      for (const parcel of [open, shut]) {
        s.byRole(
          'button',
          `Open the ${parcel.tier} at ${parcel.originX}, ${parcel.originY} — gate ${
            parcel.gateOpen ? 'open' : 'shut'
          }`,
        )
      }
      assert.equal(
        s.allByRole('listitem').length,
        2,
        'the arrivals list is not one entry per parcel the ward returned',
      )
    })
  })

  it('BJ-TES-06 [T1/presentation] the object cap shown is the parcel\'s own, not five per eight tiles', async () => {
    // 1,024 tiles at five per eight is 640. This parcel says 999, which no arithmetic this client
    // could do would produce — so the figure on screen proves where it came from.
    const parcel = parcelOfTier('plot', { objectCap: 999 })
    const routes: Routes = {
      ...NO_SPRITES,
      'GET /v1/wards': { body: { wards: [WARD] } },
      'GET /v1/parcels/': { body: { parcel, placements: placements(2) } },
    }
    await withScreen(page(h(WorldPage), `/?parcel=${parcel.id}`), { ...SESSION, ...WORLD, routes }, async (s) => {
      assert.match(s.text(), /of 999 this parcel can hold/, 'the cap on screen is not the response\'s')
      assert.doesNotMatch(
        s.text(),
        /of 640 this parcel can hold/,
        'the client recomputed the cap from the tile count',
      )
      assert.match(
        s.text(),
        /not purchasable at any price/,
        'the cap is not described as the rendering budget it is',
      )
    })
  })

  it('BJ-A11Y-10 [T1/presentation] an open gate and a shut one differ by a word', async () => {
    const open = parcelOfTier('plot', { id: 'aaaaaaaa-0000-4000-8000-000000000001', gateOpen: true })
    const shut = parcelOfTier('plot', { id: 'aaaaaaaa-0000-4000-8000-000000000002', gateOpen: false })
    const routes: Routes = {
      'GET /v1/wards': { body: { wards: [WARD] } },
      'GET /v1/wards/': { body: { parcels: [open, shut] } },
    }
    await withScreen(page(h(WorldPage)), { ...SESSION, routes }, async (s) => {
      // Doc 22 BJ-A11Y-10: colour is never the only channel. On this world the gate decides
      // whether you can walk in, so it is the state that must carry a word rather than a swatch —
      // and it must carry it in the ACCESSIBLE NAME, not only in a visual badge.
      const text = s.text()
      assert.match(text, /Gate open/, 'an open gate is not stated in words')
      assert.match(text, /Gate shut/, 'a shut gate is not stated in words')
      const names = s.allByRole('button').map((b) => b.getAttribute('aria-label') ?? '')
      assert.ok(
        names.some((n) => /gate open$/.test(n)) && names.some((n) => /gate shut$/.test(n)),
        `the gate state is not in any accessible name: ${names.join(' | ')}`,
      )
    })
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   The wards
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('BJ-TES — the wards', () => {
  it('BJ-TES-08 [T1/presentation] occupancy is the service\'s figure, not the tile counts divided', async () => {
    // 12,288 of 49,152 is 25%. This ward says 68%, which is what a service that counted something
    // else — reserved tiles, pending claims, a ward mid-mint — would send. 70% mints the next
    // ward, so the two numbers are a decision and not a display detail.
    const ward = { ...WARD, claimedTiles: 12288, claimableTiles: 49152, occupancy: 0.68 }
    await withScreen(
      page(h(WardsPage)),
      { ...SESSION, routes: { 'GET /v1/wards': { body: { wards: [ward] } } } },
      async (s) => {
        assert.match(s.text(), /68%/, 'the occupancy the service sent is not on screen')
        assert.doesNotMatch(
          s.text(),
          /\b25%/,
          'the client recomputed occupancy from claimedTiles / claimableTiles',
        )
        // And the tile count is still shown beside it, so the two are checkable against each other
        // by a reader rather than silently reconciled by the client.
        assert.match(s.text(), /49,152 tiles/, 'the claimable tile count is not shown')
      },
    )
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   The land — claim, gate, bank, and the fallow clock
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('BJ-TES — the land', () => {
  const landRoutes = (parcels: readonly unknown[], over: Routes = {}): Routes => ({
    'GET /v1/me/parcels': { body: { parcels } },
    'GET /v1/wards': { body: { wards: [WARD] } },
    ...over,
  })

  it('★ BJ-TES-11 [T1/presentation] every fallow state is rendered as what it means, and an unknown one as itself', async () => {
    const parcels = [
      parcelOfTier('plot', { id: 'aaaaaaaa-0000-4000-8000-000000000001', fallowState: 'live' }),
      parcelOfTier('plot', { id: 'aaaaaaaa-0000-4000-8000-000000000002', fallowState: 'banked' }),
      parcelOfTier('plot', { id: 'aaaaaaaa-0000-4000-8000-000000000003', fallowState: 'fallow' }),
      parcelOfTier('plot', { id: 'aaaaaaaa-0000-4000-8000-000000000004', fallowState: 'contestable' }),
      // A state this build has never heard of. `micro-tessera` computes fallow lazily on read and
      // its vocabulary can grow; a client that mapped an unknown state onto its default would tell
      // somebody their land was Live on the day it stopped being.
      parcelOfTier('plot', {
        id: 'aaaaaaaa-0000-4000-8000-000000000005',
        fallowState: 'sequestered' as never,
      }),
    ]
    await withScreen(page(h(LandPage)), { ...SESSION, routes: landRoutes(parcels) }, async (s) => {
      const text = s.text()
      assert.match(text, /Live\./, 'a live parcel does not say so')
      assert.match(text, /extended to 270 days/, 'a banked parcel does not say what banking bought')
      assert.match(
        text,
        /no visitor and no edit for 90 days\. Contestable after a further 30/,
        'a fallow parcel does not say what fallow means or when it gets worse',
      )
      assert.match(text, /anyone may claim this now/, 'a contestable parcel does not say so')

      // ════════════════════════════════════════════════════════════════════════════════════════
      // The one that matters. An unrecognised state falls through to ITSELF — visibly odd, which
      // is the correct outcome — rather than onto the friendliest sentence in the table.
      // ════════════════════════════════════════════════════════════════════════════════════════
      assert.match(text, /sequestered/, 'an unrecognised fallow state was not shown at all')
      assert.equal(
        (text.match(/Live\./g) ?? []).length,
        1,
        'more than one parcel reads as Live — an unrecognised state was mapped onto the default',
      )
    })
  })

  it('BJ-TES-12 [T1/client-request] banking sends the parcel and an empty body, and is offered on a banked parcel', async () => {
    const parcel = parcelOfTier('plot', { fallowState: 'banked' })
    const routes = landRoutes([parcel], {
      'POST /v1/parcels/': { body: { parcel } },
    })
    await withScreen(page(h(LandPage)), { ...SESSION, routes }, async (s) => {
      // Offered even though this parcel has already been banked. The once-a-year rule is evaluated
      // on the DATABASE clock; a client that hid the control would be counting a year on the
      // user's own, and would hide it for anybody whose machine is wrong.
      await s.click(s.byRole('button', 'Bank this parcel'))

      const sent = s.api.matching('POST /v1/parcels/')
      assert.equal(sent.length, 1, 'banking did not send exactly one request')
      assert.match(sent[0]?.path ?? '', /\/bank$/, 'the request did not go to the bank route')
      assert.ok(sent[0]?.path.includes(parcel.id), 'a different parcel was banked')
      assert.deepEqual(
        Object.keys((sent[0]?.json ?? {}) as object),
        [],
        'banking carried a field — the extension is the service\'s arithmetic and takes no input',
      )
    })
  })

  it('BJ-TES-13 [T1/client-request] the gate control sends the negation of the state the service reported', async () => {
    // The service answers every PATCH with the parcel UNCHANGED — a refusal, a stale replica, a
    // write that did not land. Two presses must therefore send the same value twice.
    const parcel = parcelOfTier('plot', { gateOpen: true })
    const routes = landRoutes([parcel], { 'PATCH /v1/parcels/': { body: { parcel } } })
    await withScreen(page(h(LandPage)), { ...SESSION, routes }, async (s) => {
      await s.click(s.byRole('button', 'Shut the gate'))
      await s.click(s.byRole('button', 'Shut the gate'))

      const sent = s.api.matching('PATCH /v1/parcels/')
      assert.equal(sent.length, 2, 'the gate was not changed twice')
      for (const [i, call] of sent.entries()) {
        assert.deepEqual(
          call.json,
          { gateOpen: false },
          `request ${i + 1} did not send the negation of the state the service last reported — a ` +
            'client toggling a local copy would send false, then true, and the second press would ' +
            'undo a change that never happened',
        )
      }
    })
  })

  it('BJ-ADV-TES-03-H1 [T1/client-request] double-pressing Claim this ground claims once', async () => {
    const routes = landRoutes([], { 'POST /v1/parcels': { status: 201, body: { parcel: PARCEL } } })
    await withScreen(page(h(LandPage)), { ...SESSION, routes }, async (s) => {
      await s.type(s.allByRole('combobox')[0] as Element, WARD.id)
      const claim = s.byRole('button', 'Claim this ground')
      // No flush between them, which is the whole hazard: `disabled={busy}` has not been committed
      // yet and neither has the state a `if (busy) return` reads.
      s.clickNoFlush(claim)
      s.clickNoFlush(claim)
      await s.settle(20)
      assert.equal(
        s.api.matching('POST /v1/parcels').length,
        1,
        'two claims were sent for one press-and-press — the second races the first for the same ' +
          'rectangle and whichever loses produces a refusal the user did not ask for',
      )
    })
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   The Kiln — prompt, 202, poll
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('BJ-TES — the Kiln', () => {
  const FIRING = { ...OBJECT, status: 'firing' as const, checksum: null }
  const FIRED = {
    ...OBJECT,
    status: 'fired' as const,
    checksum: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
  }

  const fire = async (s: Rendered): Promise<void> => {
    const prompt = s.allByRole('textbox')[0]
    assert.ok(prompt, 'there is no prompt field')
    await s.type(prompt, 'a low bench of pale scorched timber, worn smooth in the middle')
    await s.click(s.byRole('button', 'Fire it'))
  }

  it('★ BJ-TES-14 [T1/presentation] a 202 is not proof of anything — the terminal state is', async () => {
    // ══════════════════════════════════════════════════════════════════════════════════════════
    // `micro-studio` answers 202 BEFORE IT HAS TOUCHED A MODEL: `requestGeneration` opens no
    // socket and `runGeneration` executes later inside a lease. So the 202 means "enqueued" and
    // nothing else, and micro-studio's own tests grade only the terminal `fired` state.
    //
    // The defect this catches is a page that renders the 202's object as the answer: a creator is
    // told their object exists, with a prompt they can no longer change, before anything has been
    // generated — and if the job then dies they are never told.
    // ══════════════════════════════════════════════════════════════════════════════════════════
    const routes: Routes = {
      'GET /v1/objects': { body: { objects: [] } },
      // The poll: still firing, then fired. The checksum exists ONLY on the polled object, so a
      // page showing it can only have got it from the poll.
      'GET /v1/objects/': (_w, n) => ({ body: { object: n === 1 ? FIRING : FIRED } }),
      'POST /v1/kiln/firings': {
        status: 202,
        body: { object: FIRING, statusUrl: `/v1/objects/${OBJECT.id}` },
      },
    }
    await withScreen(page(h(KilnPage)), { ...SESSION, routes }, async (s) => {
      await fire(s)

      // The 202 landed and the first poll came back still firing. The page says so, and says
      // nothing about an object existing.
      assert.match(
        s.text(),
        /In the Kiln\. This takes about a minute\./,
        'a 202 was rendered as a finished firing',
      )
      assert.doesNotMatch(s.text(), /Fired\. Its identity is/, 'the page claimed a finished object')
      assert.ok(
        s.api.matching('GET /v1/objects/').length >= 1,
        'the statusUrl was never polled, so the 202 WAS the answer',
      )

      // Two seconds later the poll returns the terminal state, and only now is there an identity.
      await s.settle(2_400)
      assert.match(
        s.text(),
        new RegExp(`Fired\\. Its identity is ${FIRED.checksum}`),
        'the terminal state from the poll is not what the page reports',
      )
      assert.match(s.text(), /the sha256 of its own bytes/, 'the identity is not named as the hash')
    })
  })

  it('BJ-TES-15 [T1/presentation] a failed firing says so, and the polling stops', async () => {
    const FAILED = { ...OBJECT, status: 'failed' as const, checksum: null }
    const routes: Routes = {
      'GET /v1/objects': { body: { objects: [] } },
      'GET /v1/objects/': (_w, n) => ({ body: { object: n === 1 ? FIRING : FAILED } }),
      'POST /v1/kiln/firings': {
        status: 202,
        body: { object: FIRING, statusUrl: `/v1/objects/${OBJECT.id}` },
      },
    }
    await withScreen(page(h(KilnPage)), { ...SESSION, routes }, async (s) => {
      await fire(s)
      await s.settle(2_400)

      assert.match(s.text(), /The firing failed/, 'a failed firing is not reported')
      assert.match(
        s.text(),
        /Nothing was charged for a firing that produced nothing/,
        'the page does not say that a failure costs nothing — which is the first thing a creator ' +
          'paying per firing needs to know',
      )

      // ════════════════════════════════════════════════════════════════════════════════════════
      // AND IT STOPS. A poll with no terminal condition is a tab left open overnight making a
      // request every two seconds against a job that is never going to answer differently.
      // ════════════════════════════════════════════════════════════════════════════════════════
      const settled = s.api.matching('GET /v1/objects/').length
      await s.settle(6_000)
      assert.equal(
        s.api.matching('GET /v1/objects/').length,
        settled,
        'the client kept polling an object that had reached a terminal state',
      )
    })
  })

  it('★ BJ-ADV-TES-01-H1 [T1/client-request] double-pressing Fire it fires once', async () => {
    // ══════════════════════════════════════════════════════════════════════════════════════════
    // THIS SCENARIO FOUND A REAL DEFECT AND IS KEPT AT THE PRESSURE THAT FOUND IT.
    //
    // The form guarded itself with `if (busy) return` and `disabled={busy}`. Neither can see a
    // second click in the same tick: `busy` is read out of the render closure, `setBusy(true)`
    // only schedules a render, and `disabled` is not on the button until that render commits. Two
    // clicks produced TWO FIRINGS, and a firing has a real marginal cost in USD at the provider.
    // The fix is a ref, latched and released synchronously.
    // ══════════════════════════════════════════════════════════════════════════════════════════
    const routes: Routes = {
      'GET /v1/objects': { body: { objects: [] } },
      'GET /v1/objects/': { body: { object: FIRING } },
      'POST /v1/kiln/firings': {
        status: 202,
        body: { object: FIRING, statusUrl: `/v1/objects/${OBJECT.id}` },
      },
    }
    await withScreen(page(h(KilnPage)), { ...SESSION, routes }, async (s) => {
      const prompt = s.allByRole('textbox')[0]
      assert.ok(prompt, 'there is no prompt field')
      await s.type(prompt, 'a low bench of pale scorched timber, worn smooth in the middle')

      const button = s.byRole('button', 'Fire it')
      s.clickNoFlush(button)
      s.clickNoFlush(button)
      await s.settle(20)

      assert.equal(
        s.api.matching('POST /v1/kiln/firings').length,
        1,
        'two firings were requested for one press-and-press — that is a duplicate object and a ' +
          'second provider charge',
      )
    })
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   Discover — two signals, neither for sale
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('BJ-TES — discover', () => {
  const discoverRoutes = (parcels: readonly unknown[] = RANKED): Routes => ({
    'GET /v1/wards': { body: { wards: [WARD] } },
    'GET /v1/discover': { body: { parcels } },
  })

  it('★ BJ-TES-19 [T1/presentation] every row carries both ranking inputs beside its score, in the order the service sent', async () => {
    await withScreen(page(h(DiscoverPage)), { ...SESSION, routes: discoverRoutes() }, async (s) => {
      const rows = [...s.document.querySelectorAll('tbody tr')]
      assert.equal(rows.length, RANKED.length, 'the table is not one row per ranked parcel')

      // ════════════════════════════════════════════════════════════════════════════════════════
      // PER ROW, NOT PER PAGE. The existing check looked for "84 accounts" and "212s" anywhere in
      // the body, which a table that had lost its footfall column but kept a footnote quoting one
      // would still satisfy. What §7.1 promises is that a reader can see WHY A GIVEN PARCEL
      // RANKS, so the two inputs and the score have to be on the same row as each other.
      // ════════════════════════════════════════════════════════════════════════════════════════
      for (const [i, expected] of RANKED.entries()) {
        const text = s.textOf(rows[i])
        assert.match(
          text,
          new RegExp(`${expected.inputs.footfall} accounts`),
          `row ${i + 1} does not carry the footfall that produced its score`,
        )
        assert.match(
          text,
          new RegExp(`${expected.inputs.medianDwell}s`),
          `row ${i + 1} does not carry the median dwell — footfall alone rewards a doorway that ` +
            'tricks people in, and dwell is what punishes it',
        )
        assert.match(
          text,
          new RegExp(expected.score.toFixed(3).replace('.', '\\.')),
          `row ${i + 1} does not carry the score its inputs produced`,
        )
      }

      // ════════════════════════════════════════════════════════════════════════════════════════
      // AND THE ORDER IS THE SERVICE'S. The second fixture row has HIGHER footfall (140 against
      // 84) and a LOWER score, because its dwell is nine seconds. A client that re-sorted by any
      // column it could see would put it first — and the score column would stop explaining the
      // order, which is the whole thing this screen exists to make checkable.
      // ════════════════════════════════════════════════════════════════════════════════════════
      const first = RANKED[0]
      const second = RANKED[1]
      assert.ok(first && second, 'the ranked fixture no longer has two rows to compare')
      assert.ok(second.inputs.footfall > first.inputs.footfall, 'the fixture no longer tests order')
      s.before(
        first.parcelId.slice(0, 8),
        second.parcelId.slice(0, 8),
        'the feed was re-ordered by this client — the order must be the one the service returned',
      )
    })
  })

  it('BJ-TES-21 [T1/client-request] narrowing to one ward sends wardId and still nothing else', async () => {
    await withScreen(page(h(DiscoverPage)), { ...SESSION, routes: discoverRoutes() }, async (s) => {
      const wardSelect = s.allByRole('combobox')[0]
      assert.ok(wardSelect, 'there is no ward filter')
      await s.type(wardSelect, WARD.id)

      const calls = s.api.matching('GET /v1/discover')
      assert.ok(calls.length >= 2, 'choosing a ward did not re-read the feed')
      const last = calls[calls.length - 1]
      assert.ok(last, 'no request was made')
      const params = new URL(last.url, ORIGIN).searchParams
      assert.equal(params.get('wardId'), WARD.id, 'the ward filter was not sent')
      assert.deepEqual(
        [...params.keys()],
        ['wardId'],
        `the filtered feed carried ${[...params.keys()].join(', ')} — wardId is the only ` +
          'parameter the route reads, and a second one here is the first half of a paid ranking',
      )
    })
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   The Workshop — the terms, and the split every price makes
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('BJ-TES — the workshop', () => {
  const workshopRoutes = (over: Routes = {}): Routes => ({
    'GET /v1/terms': { body: TERMS },
    'GET /v1/listings': { body: { listings: [LISTING] } },
    'GET /v1/objects': { body: { objects: [OBJECT] } },
    ...over,
  })

  it('★ BJ-TES-22 [T1/presentation] the fee, royalty and proceeds shown are the service\'s figures', async () => {
    // ══════════════════════════════════════════════════════════════════════════════════════════
    // A LISTING WHOSE SPLIT DOES NOT FOLLOW FROM ITS OWN BASIS POINTS, ON PURPOSE.
    //
    // 400 Sparks at 250 bps is a 10-Spark fee and at 500 bps a 20-Spark royalty. This listing
    // carries 7 and 13 instead — the shape a listing gets when the rates were snapshotted at
    // creation and the platform's have moved since, which `market/src/listings.ts` does
    // deliberately so that a sale in flight cannot be re-cut.
    //
    // So the numbers on screen say where they came from. A client multiplying the price by the
    // basis points beside it would print 10 and 20 and would be showing a partition that agreed
    // with itself while the real one — the one the buyer is charged and the seller is paid —
    // differed. `fee + royalty + proceeds === price` is proved three ways server-side, including
    // by `orders_partition`; this client's only job is to print what it was handed.
    // ══════════════════════════════════════════════════════════════════════════════════════════
    const price = 400n * 1_000_000_000_000n
    const fee = 7n * 1_000_000_000_000n
    const royalty = 13n * 1_000_000_000_000n
    const proceeds = price - fee - royalty
    const listing = {
      ...LISTING,
      priceWei: price.toString(),
      split: {
        feeWei: fee.toString(),
        royaltyWei: royalty.toString(),
        proceedsWei: proceeds.toString(),
        proceedsSparks: (proceeds / 1_000_000_000_000n).toString(),
      },
    }
    await withScreen(
      page(h(WorkshopPage)),
      { ...SESSION, routes: workshopRoutes({ 'GET /v1/listings': { body: { listings: [listing] } } }) },
      async (s) => {
        const row = s.document.querySelector('tbody tr')
        assert.ok(row, 'the listing has no row')
        const cell = cellsOf(s, row)

        // Column by column, and the message names the figure a client doing its own arithmetic
        // would have printed instead — 10 Sparks at 250 bps, 20 at 500.
        assert.equal(cell['Price'], '400 Sparks', 'the price is not the one the service sent')
        assert.equal(
          cell['Platform fee'],
          '7 Sparks',
          'the fee shown is not the service\'s — a client multiplying 400 by 250 bps prints 10',
        )
        assert.equal(
          cell['Royalty'],
          '13 Sparks',
          'the royalty shown is not the service\'s — a client multiplying 400 by 500 bps prints 20',
        )
        assert.equal(
          cell['You receive'],
          '380 Sparks',
          'the proceeds shown are not the remainder the service computed',
        )
        // And the mode, because §8.5 makes custodial the only path on which the royalty exists at
        // all — an `onchain` listing records one on the order row and never posts it.
        assert.equal(cell['Settles'], 'custodial', 'the settlement mode is not shown')

        // All four are present, which is what lets a seller watch the identity hold rather than
        // take it on trust — §8.4's "the arithmetic cannot leak", made visible.
        s.before('Platform fee', 'You receive', 'the split is not laid out fee-then-proceeds')
      },
    )
  })

  it('BJ-TES-25 [T1/presentation] the royalty field offers the wire\'s range, and states the cap beside it', async () => {
    await withScreen(page(h(WorkshopPage)), { ...SESSION, routes: workshopRoutes() }, async (s) => {
      const royalty = s.document.querySelector('input[type="number"]')
      assert.ok(royalty, 'there is no royalty field')

      // ════════════════════════════════════════════════════════════════════════════════════════
      // 0–10000 IS THE WIRE'S RANGE AND NOT THE RULE. The cap is `MARKET_MAX_ROYALTY_BPS` and a
      // CHECK named `listings_terms_leave_the_seller_something`. Clamping this input to the cap
      // would be the client asserting the rule — and a test of the clamp would pass, green,
      // against a service that had stopped enforcing it. That is the four-hidden-SKUs incident
      // with a different noun.
      // ════════════════════════════════════════════════════════════════════════════════════════
      assert.equal(royalty.getAttribute('max'), '10000', 'the royalty input clamps to the cap')
      assert.equal(royalty.getAttribute('min'), '0', 'the royalty input does not admit zero')

      // The cap is nonetheless SHOWN, from `GET /v1/terms`, so the user is not left to discover it
      // through a refusal.
      assert.match(
        s.text(),
        new RegExp(`The cap is ${TERMS.maxRoyaltyBps / 100}%`),
        'the cap the service sent is not stated beside the field',
      )
    })
  })

  it('★ BJ-ADV-TES-02-H1 [T1/client-request] double-pressing List it lists once', async () => {
    // The same defect as BJ-ADV-TES-01-H1 and the same measurement: this form produced TWO
    // listings from two clicks in one tick. A duplicate here is a second live, buyable offer of a
    // thing the seller meant to sell once.
    await withScreen(
      page(h(WorkshopPage)),
      {
        ...SESSION,
        routes: workshopRoutes({ 'POST /v1/listings': { status: 201, body: { listing: LISTING } } }),
      },
      async (s) => {
        await s.type(s.allByRole('combobox')[0] as Element, OBJECT.id)
        const price = s.allByRole('textbox').find((el) => el.getAttribute('inputmode') === 'numeric')
        assert.ok(price, 'there is no price field')
        await s.type(price, '400')

        const button = s.byRole('button', 'List it')
        s.clickNoFlush(button)
        s.clickNoFlush(button)
        await s.settle(20)

        assert.equal(
          s.api.matching('POST /v1/listings').length,
          1,
          'two listings were created for one press-and-press',
        )
      },
    )
  })

  it('BJ-ADV-TES-02-H4 [T1/presentation] a refused listing keeps the form, states the reason and offers the id', async () => {
    await withScreen(
      page(h(WorkshopPage)),
      {
        ...SESSION,
        routes: workshopRoutes({
          'POST /v1/listings': {
            status: 409,
            body: {
              error: {
                code: 'object_already_listed',
                message: 'this object is already listed',
                requestId: 'req-conflict-4242',
              },
            },
          },
        }),
      },
      async (s) => {
        await s.type(s.allByRole('combobox')[0] as Element, OBJECT.id)
        const price = s.allByRole('textbox').find((el) => el.getAttribute('inputmode') === 'numeric')
        assert.ok(price, 'there is no price field')
        await s.type(price, '400')
        await s.click(s.byRole('button', 'List it'))

        // Doc 22 §3.4: the assertion is on the SENTENCE THE USER IS SHOWN, never on the refusal.
        // The service's own words, not a sentence this client invented about which rule was broken.
        const alert = s.byRole('alert', /already listed/)
        assert.match(
          s.textOf(alert),
          /req-conflict-4242/,
          'the failure carries no request id, so nobody can find it in a log',
        )

        // And the form still holds what was typed. A form that clears on failure makes the user
        // retype the thing that was refused, without having been told what to change.
        assert.equal(
          (price as unknown as { value: string }).value,
          '400',
          'the price was cleared by a failure — only a success clears this form',
        )
      },
    )
  })

  it('★ BJ-ADV-22 [T1/presentation] degraded, not down: the page paints while one read is slow', async () => {
    await withScreen(
      page(h(WorkshopPage)),
      { ...SESSION, routes: workshopRoutes({ 'GET /v1/terms': { body: TERMS, delayMs: 400 } }) },
      async (s) => {
        // ══════════════════════════════════════════════════════════════════════════════════════
        // The terms have not answered. Everything else has, and is on screen. A page that waited
        // for its slowest upstream before painting anything would turn one slow service into a
        // product that looks broken.
        // ══════════════════════════════════════════════════════════════════════════════════════
        assert.match(s.text(), /Reading the terms/, 'the slow section is not marked as pending')
        assert.match(s.text(), /What you have listed/, 'the rest of the page did not paint')
        assert.match(s.text(), /400 Sparks/, 'the listings that DID answer are not rendered')

        // Pending, not failed: a spinner and an error are different things and a user who is told
        // the wrong one either waits for nothing or gives up on something that was working.
        assert.equal(
          s.queryByRole('alert', /terms/i),
          null,
          'a slow read was announced as a failure',
        )

        // And nothing is left hanging: it arrives.
        await s.settle(600)
        assert.match(s.text(), /2\.5% of every sale/, 'the slow read never resolved')
      },
    )
  })

  it('★ BJ-ADV-23 [T1/presentation] every failure state offers the request id to quote to support', async () => {
    const failure = (id: string) => ({
      status: 503,
      body: { error: { code: 'upstream_unavailable', message: 'that did not answer', requestId: id } },
    })
    await withScreen(
      page(h(WorkshopPage)),
      {
        ...SESSION,
        routes: {
          'GET /v1/terms': failure('req-terms-0001'),
          'GET /v1/listings': failure('req-listings-0002'),
          'GET /v1/objects': failure('req-objects-0003'),
        },
      },
      async (s) => {
        const alerts = s.allByRole('alert').map((a) => s.textOf(a))
        assert.ok(alerts.length >= 2, `only ${alerts.length} failure state rendered`)
        // Each independent read that failed names ITS OWN id. One id for three failures would be
        // one of them standing in for the others, and the two that were dropped are the two
        // nobody can look up.
        for (const id of ['req-terms-0001', 'req-listings-0002']) {
          assert.ok(
            alerts.some((a) => a.includes(id)),
            `${id} is not offered anywhere on the page: ${alerts.join(' | ')}`,
          )
        }
        assert.ok(
          alerts.every((a) => /Quote this to support/.test(a) || !/req-/.test(a)),
          'an id is on screen without saying what it is for',
        )
      },
    )
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   The shell, and doc 22 §5.1's universal property
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('BJ-TESSERA — the surface', () => {
  /** The whole app, signed OUT: `/discover` is public and the shell then makes no session call. */
  const anonymous = (path: string) => ({ url: `${ORIGIN}${path}`, routes: {} as Routes })

  it('BJ-TESSERA-404 [T2/navigation] an unowned address renders the not-found screen inside the shell', async () => {
    const unowned = '/a-place-that-is-not-here'
    assert.equal(routeFor(unowned), undefined, 'the fixture address is a declared route')

    await withScreen(h(App), anonymous(unowned), async (s) => {
      assert.match(s.text(), /There is nothing at this address/, 'the not-found screen did not render')

      // INSIDE the shell, which is what makes a wrong address a page of this app rather than a
      // bare error: the navigation is still there and still usable.
      assert.equal(s.allByRole('main').length, 1, 'the not-found screen rendered outside the shell')
      assert.ok(s.queryByRole('link', 'Skip to the page'), 'the shell chrome is missing')

      // And it offers somewhere to go — every declared route, with the blurb each one carries for
      // exactly this screen.
      //
      // Scoped to the not-found list rather than to the page: the shell's own navigation carries
      // the same six labels, so a page-wide `byRole('link', 'World')` finds two and the first
      // version of this assertion failed on correct markup. Scoping is also what makes it mean
      // anything — without it the assertion would be satisfied by the nav alone, on a not-found
      // screen that offered nothing at all.
      const offered = s.document.querySelector('.tw-notfound')
      assert.ok(offered, 'the not-found screen offers no route list')
      const links = [...offered.querySelectorAll('a')]
      assert.deepEqual(
        links.map((a) => a.getAttribute('href')),
        ROUTES.map((r) => r.path),
        'the not-found screen does not offer exactly the routes this surface declares',
      )
      for (const route of ROUTES) {
        assert.ok(
          s.textOf(offered).includes(route.blurb),
          `${route.path} is offered with no blurb saying what is there`,
        )
      }
    })

    // ════════════════════════════════════════════════════════════════════════════════════════
    // The STATUS half is nginx's and lives in `test/routes.test.ts` — `error_page 404
    // /index.html` serves this bundle while KEEPING the 404, as against `try_files $uri
    // /index.html`, which answers 200 for every address in existence. Restated here would be two
    // copies of one rule; asserted here is that the rule is still where this scenario says it is.
    // ════════════════════════════════════════════════════════════════════════════════════════
    const routesTest = readFileSync(at('test/routes.test.ts'), 'utf8')
    assert.match(
      routesTest,
      /error_page 404 \\\/index\\\.html/,
      'the 404-status assertion this scenario delegates to is no longer in test/routes.test.ts',
    )
  })

  it('BJ-A11Y-12 [T1/presentation] one main landmark, a reachable skip link, and no skipped heading level', async () => {
    await withScreen(h(App), anonymous('/discover'), async (s) => {
      assert.equal(s.allByRole('main').length, 1, 'there is not exactly one main landmark')

      // The skip link is the FIRST focusable thing in the document, which is the only position
      // that makes it useful, and it points at the landmark rather than at a decoration.
      const first = s.tabbables()[0]
      assert.ok(first, 'nothing on this page is focusable')
      assert.equal(
        first.getAttribute('href'),
        '#main',
        `the first focusable element is not the skip link but ${first.tagName.toLowerCase()}`,
      )
      assert.ok(s.document.getElementById('main'), 'the skip link points at nothing')

      // Heading order, with no level skipped: a reader moving by heading must not fall from h1 to
      // h3 and have to guess whether they missed a section.
      const levels = [...s.document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((el) =>
        Number(el.tagName.slice(1)),
      )
      assert.ok(levels.length > 0, 'the page has no headings at all')
      assert.equal(levels[0], 1, `the first heading on the page is an h${levels[0]}`)
      for (let i = 1; i < levels.length; i += 1) {
        const previous = levels[i - 1] as number
        const current = levels[i] as number
        assert.ok(
          current <= previous + 1,
          `the heading order goes h${previous} → h${current}, skipping a level`,
        )
      }
    })
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   The catalogue holds together
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the catalogue', () => {
  it('every scenario declares what it may assert, and who owns any server rule', () => {
    const findings = checkCatalogue(SCENARIOS)
    assert.deepEqual(
      findings,
      [],
      `the catalogue refuses to run:\n${findings.map((f) => `  ${f.id}: ${f.problem}`).join('\n')}`,
    )
  })

  it('every ownedBy that can be resolved, resolves', () => {
    const owned = SCENARIOS.filter((s): s is Scenario & { ownedBy: string } => Boolean(s.ownedBy))
    const results = owned.map((s) => ({ id: s.id, ref: s.ownedBy, state: resolve(s.ownedBy) }))
    const missing = results.filter((r) => r.state === 'missing')
    const unavailable = results.filter((r) => r.state === 'unavailable')
    console.log(
      `  ownedBy: ${results.length - missing.length - unavailable.length} resolved, ` +
        `${unavailable.length} sibling(s) not checked out, ${missing.length} missing`,
    )
    assert.deepEqual(
      missing.map((m) => `${m.id} → ${m.ref}`),
      [],
      'an ownedBy names a rule that is not where it says it is',
    )
  })

  it('every blocker that can be checked is still true', () => {
    /*
     * ══════════════════════════════════════════════════════════════════════════════════════════
     * THE ASSERTION THAT STOPS A GAP CLOSING UNNOTICED.
     *
     * A blocker is a claim about the estate written at one moment, and the estate then moves.
     * `aetherholm-web` shipped `BJ-ACC-01` blocked on "nothing in the estate serves a sign-in
     * page"; `micro-hub-web` served `/account/login` days later and nothing went red. A gap that
     * has quietly closed reads exactly like a gap that is still open, and the scenario stays
     * unwritten for no reason anybody can see — which is a test that cannot fail, wearing a hat.
     *
     * Checked wherever the sibling is on disk and REPORTED where it is not: in CI only this
     * repository and micro-ui are checked out, so a silent pass either way would be a check whose
     * result does not depend on anything.
     * ══════════════════════════════════════════════════════════════════════════════════════════
     */
    const stale: string[] = []
    let checked = 0
    let unavailable = 0
    for (const s of SCENARIOS) {
      if (!s.blocked || !s.blockedWhile) continue
      for (const [kind, ref] of [
        ['absent', s.blockedWhile.absent],
        ['present', s.blockedWhile.present],
      ] as const) {
        if (!ref) continue
        const state = resolve(ref)
        if (state === 'unavailable') {
          unavailable += 1
          continue
        }
        checked += 1
        const found = state === 'resolved'
        if (kind === 'absent' && found) {
          stale.push(`${s.id}: blocked because ${ref} is missing — it is there now, so write it`)
        }
        if (kind === 'present' && !found) {
          stale.push(`${s.id}: blocked because ${ref} is still there — it is gone now, so write it`)
        }
      }
    }
    console.log(`  blockers: ${checked} checked, ${unavailable} sibling(s) not checked out`)
    assert.deepEqual(stale, [], `a blocker has gone stale:\n  ${stale.join('\n  ')}`)
  })

  it('every screen this surface serves carries at least one scenario that runs', () => {
    // ════════════════════════════════════════════════════════════════════════════════════════
    // THE COUNT, MADE INTO A FLOOR. This repository was measured at three BJ-tagged scenarios
    // across seven screens against market-web's 24 and foresight-web's 25 — a count that is only
    // a floor if something enforces it. A screen with none is a screen whose whole behaviour can
    // change with the suite green.
    // ════════════════════════════════════════════════════════════════════════════════════════
    const bare = SCREENS.filter(
      (screen) => !SCENARIOS.some((s) => s.screen === screen && isImplemented(s)),
    )
    assert.deepEqual(bare, [], `these screens carry no scenario that runs: ${bare.join(', ')}`)
  })

  it('every scenario that is not blocked has a test, in the file it says it does', () => {
    // The catalogue and the suite, held against each other. Without this a scenario could be
    // declared, counted, and never written — which is the difference between coverage and a list.
    const sources = new Map<string, string>()
    const missing: string[] = []
    for (const s of SCENARIOS) {
      if (!isImplemented(s)) continue
      const home = homeOf(s)
      if (!sources.has(home)) sources.set(home, readFileSync(at(home), 'utf8'))
      // The id, followed by a space or a star — so `BJ-TES-01` does not resolve against
      // `BJ-TES-019` if the catalogue ever grows past ninety-nine.
      if (!new RegExp(`${s.id}[\\s★]`).test(sources.get(home) as string)) {
        missing.push(`${s.id} claims a test in ${home} and there is none`)
      }
    }
    assert.deepEqual(missing, [], missing.join('\n'))
  })

  it('records the scenarios that cannot be written here, with the reason', () => {
    const blocked = SCENARIOS.filter((s) => s.blocked)
    for (const s of blocked) console.log(`  ⛔ ${s.id} — ${s.what}\n     blocked: ${s.blocked}`)
    const implemented = SCENARIOS.length - blocked.length
    console.log(
      `  ${implemented} implemented, ${blocked.length} recorded and blocked, ` +
        `${SCENARIOS.filter((s) => s.gate).length} release-gate, across ${SCREENS.length} screens`,
    )
    // The assertion is that each still SAYS why. A blocked scenario whose reason was deleted is a
    // gap that has stopped being visible, which is worse than the gap.
    for (const s of blocked) assert.ok((s.blocked ?? '').length > 40, `${s.id} has no blocker`)
  })
})

/* ── the meta-test's own guard ──────────────────────────────────────────────────────────────── */

test('the catalogue checks can still fail — proven, not assumed', () => {
  // ══════════════════════════════════════════════════════════════════════════════════════════
  // `checkCatalogue` returning `[]` is what every meta-test above rests on, and an empty result
  // is exactly what a broken check returns too. This estate has already found a CI rule that
  // INVERTED and reported a live invariant missing, and six tests that `return`ed instead of
  // skipping and therefore passed. So the checker is driven against scenarios that must be
  // caught, and against one that must not.
  // ══════════════════════════════════════════════════════════════════════════════════════════
  const base: Scenario = {
    id: 'BJ-TES-99',
    what: 'a sentence long enough to describe a defect rather than to name a button press',
    screen: 'world',
    asserts: 'presentation',
    tier: 'T1',
  }
  assert.deepEqual(checkCatalogue([base]), [], 'a well-formed scenario was rejected')

  const problems = (s: Partial<Scenario>): string[] =>
    checkCatalogue([{ ...base, ...s }]).map((f) => f.problem)

  assert.match(
    problems({ serverRule: 'the database refuses it' }).join(' '),
    /names no ownedBy/,
    'a scenario turning on a server rule with no owner was admitted',
  )
  assert.match(
    problems({ what: 'the second claim is refused with a named reason' }).join(' '),
    /describes a refusal/,
    'a refusal with no owner and no stated reason was admitted',
  )
  assert.match(
    problems({ asserts: 'navigation' }).join(' '),
    /declaring the status/,
    'a navigation scenario with no expected status was admitted',
  )
  assert.match(
    problems({ asserts: 'navigation', expectStatus: 404 }).join(' '),
    /names no ownedBy/,
    'a non-2xx navigation scenario with no owner was admitted',
  )
  assert.match(problems({ what: 'too short' }).join(' '), /says nothing/, 'a stub was admitted')
  assert.match(problems({ id: 'TES-01' }).join(' '), /not a BJ- identifier/, 'a bad id was admitted')
  assert.match(
    problems({ tier: 'T3' }).join(' '),
    /tier 3 lives in micro-beacon/,
    'a tier-3 scenario was admitted as runnable here',
  )
  assert.match(
    checkCatalogue([base, base]).map((f) => f.problem).join(' '),
    /duplicate id/,
    'a duplicate id was admitted',
  )
  assert.match(
    problems({ blocked: 'because' }).join(' '),
    /without saying what the blocker is/,
    'a blocked scenario with a one-word reason was admitted',
  )
  assert.match(
    problems({ blocked: 'a reason long enough to be a real one', blockedWhile: { absent: 'nope' } })
      .join(' '),
    /is not a <repo>\/<path>#<string>/,
    'a blockedWhile that no machine can resolve was admitted',
  )
})
