/**
 * The projection, and nothing else.
 *
 * Pure functions over numbers. No canvas, no DOM, no sprites — so the arithmetic that decides
 * where every tile in the world lands can be tested without a browser, and so the renderer has
 * exactly one place to be wrong about geometry.
 *
 * ── 2:1 dimetric, and what that actually means in pixels ──────────────────────────────────────
 *
 * docs/ecosystem/23-tessera.md §2.1: "Projection: 2:1 dimetric isometric. The base ground tile is
 * 256×128." So one tile's diamond is 256 wide and 128 tall, and the lattice steps by half of each:
 *
 *     screenX = (tx - ty) * 128
 *     screenY = (tx + ty) * 64
 *
 * The determinant of that basis is 128·64 − (−128)·64 = 16,384 px² per tile. That single number
 * decides the whole render budget and it is derived here rather than guessed: a viewport of
 * W×H pixels at zoom z shows W·H / (16384·z²) tiles, whatever the parcel's tier is. See
 * {@link tilesInViewport}, and docs/RENDER-BUDGET.md for what was measured against it.
 */

/** Width of one ground tile's diamond, in world pixels. §2.1. */
export const TILE_W = 256
/** Height of one ground tile's diamond, in world pixels. §2.1. */
export const TILE_H = 128
/** The 512×512 canvas every object sprite is authored on. §2.1. */
export const SPRITE = 512

/** World pixels covered by one tile of the lattice. `TILE_W * TILE_H / 2`. */
export const PX_PER_TILE = (TILE_W * TILE_H) / 2

export interface Point {
  readonly x: number
  readonly y: number
}

/** Tile coordinates within a ward. Integers; a ward is 256×256 (§4). */
export interface Tile {
  readonly tx: number
  readonly ty: number
}

/**
 * The centre of a tile's floor diamond, in world pixels.
 *
 * World pixels, not screen pixels: the camera is applied separately by {@link worldToScreen}, so
 * a placement's world position can be computed once and reused across frames at any zoom.
 */
export function tileToWorld(tile: Tile): Point {
  return { x: (tile.tx - tile.ty) * (TILE_W / 2), y: (tile.tx + tile.ty) * (TILE_H / 2) }
}

/**
 * The tile under a world-pixel point — the inverse of {@link tileToWorld}, floored.
 *
 * This is what a click resolves to, and it is the one piece of projection maths that is easy to
 * get subtly wrong: inverting the basis gives fractional tile coordinates, and `Math.floor` of a
 * NEGATIVE fraction is not `Math.trunc` of it. A world extends in both directions from its origin,
 * so `trunc` would make the row and column either side of zero the same tile — a one-tile-wide
 * seam of unclickable ground running through the middle of every ward.
 */
export function worldToTile(point: Point): Tile {
  const a = point.x / TILE_W
  const b = point.y / TILE_H
  return { tx: Math.floor(b + a), ty: Math.floor(b - a) }
}

/** The camera: where in the world the viewport is centred, and how far in it is zoomed. */
export interface Camera {
  /** World-pixel coordinate at the centre of the viewport. */
  readonly x: number
  readonly y: number
  /** 1 renders a tile at its authored 256×128. Below 1 is zoomed out. */
  readonly zoom: number
}

export interface Viewport {
  readonly width: number
  readonly height: number
}

/** World pixels → device-independent screen pixels, for a camera and viewport. */
export function worldToScreen(p: Point, camera: Camera, viewport: Viewport): Point {
  return {
    x: (p.x - camera.x) * camera.zoom + viewport.width / 2,
    y: (p.y - camera.y) * camera.zoom + viewport.height / 2,
  }
}

/** Screen pixels → world pixels. The inverse, for hit-testing a pointer event. */
export function screenToWorld(p: Point, camera: Camera, viewport: Viewport): Point {
  return {
    x: (p.x - viewport.width / 2) / camera.zoom + camera.x,
    y: (p.y - viewport.height / 2) / camera.zoom + camera.y,
  }
}

/**
 * How many tiles of ground a viewport covers at this zoom.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE NUMBER THE OBJECT CAP SHOULD HAVE BEEN STATED AGAINST.
 *
 * §6.2 caps objects PER PARCEL — 640 on a Plot, 10,240 on a Quarter — and calls the cap "a
 * rendering budget". A renderer does not have a per-parcel budget. It has a per-FRAME budget, and
 * what is in a frame is decided by this function and by how densely the ground under it is built,
 * not by which parcel owns it.
 *
 * At 1920×1080 and zoom 1 this returns 126.6. A Plot holds 1,024 tiles, so at full zoom a Plot's
 * 640-object cap can put at most ~79 objects in a frame however hard its owner tries. The cap is
 * not the binding constraint there. It becomes the binding constraint only at the zoom where a
 * whole parcel fits on screen, and it stops being the constraint again — in the other direction —
 * as soon as the camera can see more than one parcel.
 *
 * docs/RENDER-BUDGET.md carries the measurement this reasoning is checked against.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
export function tilesInViewport(viewport: Viewport, zoom: number): number {
  return (viewport.width * viewport.height) / (PX_PER_TILE * zoom * zoom)
}

/**
 * The zoom at which a square of `side` tiles exactly fits inside `viewport`.
 *
 * A square parcel of side n spans `n * TILE_W` world pixels wide and `n * TILE_H` tall, because
 * the diamond's two axes both contribute: the far corner is at tx=ty=n, which is (0, n·TILE_H) —
 * and the two side corners are at ±n·TILE_W/2.
 */
export function zoomToFit(side: number, viewport: Viewport): number {
  return Math.min(viewport.width / (side * TILE_W), viewport.height / (side * TILE_H))
}

/**
 * Painter's-algorithm depth for a placement.
 *
 * Ascending `tx + ty` is back-to-front in a 2:1 dimetric lattice: a tile further from the camera
 * has a smaller sum, and a sprite drawn later covers one drawn earlier. `tx` breaks the tie so the
 * order is TOTAL rather than merely non-decreasing — an unstable sort over equal keys reorders
 * overlapping sprites between frames, which reads as flicker rather than as a bug.
 *
 * A 2×2 object (§6.3 — footprints are `1x1` and `2x2`, and no others) occupies its origin tile and
 * the three tiles at +1, so it must sort as though it stood on its NEAREST corner. Sorting a 2×2
 * on its origin draws it behind the 1×1 object standing on the tile it visually covers.
 */
export function depthOf(tile: Tile, footprint: '1x1' | '2x2'): number {
  const span = footprint === '2x2' ? 1 : 0
  return (tile.tx + span + (tile.ty + span)) * 1024 + (tile.tx + span)
}

/**
 * Where a sprite's top-left corner goes, in world pixels.
 *
 * The 512×512 canvas holds the object standing on a 256×128 floor diamond at its BOTTOM — "three
 * tiles of headroom, so a lamp-post fits" (§2.1). So the sprite's bottom-centre is the floor
 * diamond's centre, and the top-left is that point less half the sprite's width and all of its
 * height, plus the half-tile that puts the diamond's centre rather than its bottom vertex on the
 * tile.
 *
 * A 2×2 uses "the same 512×512 canvas at half the depicted scale" (§2.1), which means the same
 * bytes at the same size on screen, anchored one tile further along both axes so the depicted
 * object sits over the four tiles it occupies.
 */
export function spriteOrigin(tile: Tile, footprint: '1x1' | '2x2'): Point {
  const anchor = tileToWorld(
    footprint === '2x2' ? { tx: tile.tx + 0.5, ty: tile.ty + 0.5 } : tile,
  )
  return { x: anchor.x - SPRITE / 2, y: anchor.y + TILE_H / 2 - SPRITE }
}
