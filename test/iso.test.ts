/**
 * The projection, checked as arithmetic.
 *
 * These are pure functions over numbers, so there is no DOM here and no browser — putting one
 * under a function is pure cost. What IS worth checking is the two places isometric maths is
 * habitually wrong, and both are checked against a value computed a different way rather than
 * against a constant copied out of the implementation.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  PX_PER_TILE,
  TILE_H,
  TILE_W,
  depthOf,
  screenToWorld,
  tileToWorld,
  tilesInViewport,
  worldToScreen,
  worldToTile,
  zoomToFit,
} from '../src/render/iso.ts'

test('the lattice steps by half a tile on each axis', () => {
  assert.deepEqual(tileToWorld({ tx: 0, ty: 0 }), { x: 0, y: 0 })
  assert.deepEqual(tileToWorld({ tx: 1, ty: 0 }), { x: TILE_W / 2, y: TILE_H / 2 })
  assert.deepEqual(tileToWorld({ tx: 0, ty: 1 }), { x: -TILE_W / 2, y: TILE_H / 2 })
  // Two steps along both axes lands on the vertical, twice as far down and not sideways at all.
  assert.deepEqual(tileToWorld({ tx: 1, ty: 1 }), { x: 0, y: TILE_H })
})

test('worldToTile inverts tileToWorld, on both sides of the origin', () => {
  // ══════════════════════════════════════════════════════════════════════════════════════════
  // THE NEGATIVE HALF IS THE POINT. `Math.floor` of a negative fraction is not `Math.trunc` of
  // it, and a `trunc` here makes the row and column either side of zero the same tile — a
  // one-tile-wide seam of unclickable ground running through the middle of every ward. A world
  // extends in both directions from its origin, so the test does too.
  // ══════════════════════════════════════════════════════════════════════════════════════════
  for (let tx = -4; tx <= 4; tx += 1) {
    for (let ty = -4; ty <= 4; ty += 1) {
      const world = tileToWorld({ tx, ty })
      // Nudged INTO the diamond rather than sampled at its exact corner: a lattice point sits on
      // the boundary of four tiles and which one it belongs to is a tie, not a fact.
      const inside = { x: world.x, y: world.y + 1 }
      assert.deepEqual(worldToTile(inside), { tx, ty }, `round trip failed at ${tx},${ty}`)
    }
  }
})

test('the camera round-trips a screen point through world space', () => {
  const camera = { x: 512, y: 256, zoom: 0.4 }
  const viewport = { width: 1440, height: 900 }
  for (const point of [{ x: 0, y: 0 }, { x: 1440, y: 900 }, { x: 137, y: 611 }]) {
    const back = worldToScreen(screenToWorld(point, camera, viewport), camera, viewport)
    assert.ok(Math.abs(back.x - point.x) < 1e-9, 'x did not round trip')
    assert.ok(Math.abs(back.y - point.y) < 1e-9, 'y did not round trip')
  }
})

test('one tile covers 16,384 world pixels, and that is what the budget rests on', () => {
  // Derived from the basis rather than asserted as a magic number: the determinant of
  // [[TILE_W/2, -TILE_W/2], [TILE_H/2, TILE_H/2]].
  const determinant = (TILE_W / 2) * (TILE_H / 2) - (-TILE_W / 2) * (TILE_H / 2)
  assert.equal(PX_PER_TILE, determinant)
  assert.equal(PX_PER_TILE, 16384)
})

test('a 1440x900 viewport at zoom 1 holds about 79 tiles', () => {
  // ══════════════════════════════════════════════════════════════════════════════════════════
  // THE NUMBER §6.2's CAPS SHOULD HAVE BEEN STATED AGAINST.
  //
  // A Plot is 1,024 tiles with a 640-object cap. At full zoom this viewport sees 79 of those
  // tiles, so the cap can put at most ~49 objects in a frame however hard its owner tries. The
  // per-parcel cap is not the renderer's constraint at that zoom — and at a wide zoom the
  // constraint is the number of PARCELS in frame, which no per-parcel cap bounds at all.
  // ══════════════════════════════════════════════════════════════════════════════════════════
  const tiles = tilesInViewport({ width: 1440, height: 900 }, 1)
  assert.ok(tiles > 78 && tiles < 80, `expected ~79 tiles, got ${tiles}`)

  // And it scales as 1/zoom², which is why zooming out doubles the cost four times over.
  assert.ok(
    Math.abs(tilesInViewport({ width: 1440, height: 900 }, 0.5) - tiles * 4) < 1e-9,
    'the tile count does not scale as the inverse square of zoom',
  )
})

test('zoomToFit puts a whole square parcel on screen and no more', () => {
  const viewport = { width: 1440, height: 900 }
  const zoom = zoomToFit(32, viewport)
  // Both dimensions must fit, and the tighter one must fit exactly.
  const wide = 32 * TILE_W * zoom
  const tall = 32 * TILE_H * zoom
  assert.ok(wide <= viewport.width + 1e-9, 'the parcel is wider than the viewport')
  assert.ok(tall <= viewport.height + 1e-9, 'the parcel is taller than the viewport')
  assert.ok(
    Math.abs(wide - viewport.width) < 1e-9 || Math.abs(tall - viewport.height) < 1e-9,
    'neither dimension fits exactly, so the fit is not tight',
  )
})

test('depth sorts back to front, and a 2x2 sorts on its nearest corner', () => {
  // A sprite further from the camera has a smaller sum and is drawn first.
  assert.ok(depthOf({ tx: 0, ty: 0 }, '1x1') < depthOf({ tx: 1, ty: 0 }, '1x1'))
  assert.ok(depthOf({ tx: 1, ty: 0 }, '1x1') < depthOf({ tx: 1, ty: 1 }, '1x1'))

  // ══════════════════════════════════════════════════════════════════════════════════════════
  // A 2×2 standing at (4,4) covers (5,5). If it sorted on its ORIGIN it would be drawn before —
  // and therefore behind — a 1×1 standing at (5,5), which is a chair visually in front of a
  // table and painted underneath it. So it must sort at or after that 1×1.
  // ══════════════════════════════════════════════════════════════════════════════════════════
  assert.ok(
    depthOf({ tx: 4, ty: 4 }, '2x2') >= depthOf({ tx: 5, ty: 5 }, '1x1'),
    'a 2x2 sorts behind the 1x1 on the tile it covers',
  )
  assert.ok(
    depthOf({ tx: 4, ty: 4 }, '2x2') > depthOf({ tx: 4, ty: 4 }, '1x1'),
    'a 2x2 does not sort in front of a 1x1 on its own origin tile',
  )
})

test('the depth key is total, so equal tiles never reorder between frames', () => {
  // An unstable sort over equal keys reorders overlapping sprites between frames, which reads as
  // flicker rather than as a bug. Two distinct tiles must never share a key.
  const seen = new Map<number, string>()
  for (let tx = 0; tx < 64; tx += 1) {
    for (let ty = 0; ty < 64; ty += 1) {
      const key = depthOf({ tx, ty }, '1x1')
      const previous = seen.get(key)
      assert.equal(previous, undefined, `${tx},${ty} shares a depth key with ${previous}`)
      seen.set(key, `${tx},${ty}`)
    }
  }
})
