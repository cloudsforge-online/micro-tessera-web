/**
 * The world renderer: Canvas 2D, one draw call per visible sprite, back to front.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY CANVAS 2D AND NOT WEBGL, DECIDED BY MEASUREMENT RATHER THAN BY TASTE
 *
 * docs/ecosystem/23-tessera.md §13 records browser render performance for a densely built parcel
 * as "the riskiest unmeasured number in the document", and says the object caps in §6.2 were
 * "reasoned from tile counts, not measured". That is a renderer-shaped hole in the design, and the
 * cheapest way to fill it wrong is to reach for a WebGL sprite batcher first — a dependency, a
 * shader toolchain, a class of driver bug, and a renderer nobody can read — on the assumption that
 * Canvas 2D will not hold.
 *
 * So this was built first and measured, against the real 512×512 FLUX bytes in
 * `micro-tessera-assets/assets/objects/`, in a real Chromium. The numbers, the method and the
 * hardware are in docs/RENDER-BUDGET.md, and `test/render-budget.test.ts` holds the constants in
 * this file to the ones the measurement produced. If a later measurement disagrees, that test goes
 * red rather than the constants drifting quietly.
 *
 * ── The three things this renderer does that a naive one does not ─────────────────────────────
 *
 *   1. **It culls in tile space, not by testing every placement.** A ward is 65,536 tiles (§4) and
 *      a Quarter's cap alone is 10,240 objects (§6.2). Iterating the whole scene per frame to ask
 *      "are you visible" is O(world) work in a loop that must finish in 16 ms, so placements are
 *      bucketed by tile once and only the buckets the viewport touches are read.
 *   2. **It draws the ground DIRECTLY, and it used to cache it into chunk canvases.** That cache
 *      is gone, and the reason is the most useful thing the measurement found. Ground is static
 *      between edits and it is the majority of the draw calls — a 32×32 Plot is 1,024 ground tiles
 *      against a 640-object cap — so baking 16×16-tile blocks into canvases looked obviously
 *      right. In world pixels a 16×16 block is **4096×2048**, which is **33.5 MB of backing store
 *      per chunk**. A 32×32 Plot needs four of them (134 MB); a whole 256×256 ward needs 256 of
 *      them, which is **8.6 GB**. The first measurement run did not finish: it spent
 *      three quarters of an hour inside Chromium allocating and discarding canvases, and that is
 *      what a "cache" that is larger than the thing it caches does. Drawing the tiles is one
 *      `drawImage` each and the count is bounded by {@link GROUND_MIN_ZOOM}, which is the same
 *      floor the sprites use and for the same reason.
 *   3. **It has a measured ceiling and degrades ON PURPOSE when it is crossed.** Past
 *      {@link DRAW_BUDGET} total draws the renderer stops drawing sprites and draws the
 *      ground alone. That is a rendering decision, not a game rule: the
 *      objects still exist, the server still knows about them, and nothing the user can do is
 *      refused. The alternative — dropping frames on a wide zoom — is the failure the design
 *      feared, arriving silently.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import {
  SPRITE,
  TILE_H,
  TILE_W,
  depthOf,
  screenToWorld,
  spriteOrigin,
  tileToWorld,
  worldToScreen,
  worldToTile,
  type Camera,
  type Point,
  type Tile,
  type Viewport,
} from './iso.ts'
import type { Placement, Scene } from './scene.ts'

/**
 * Total `drawImage` calls — ground tiles PLUS object sprites — this renderer will make in one
 * frame before it stops drawing sprites.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * 2,000, AND THE NUMBER IS MEASURED. docs/RENDER-BUDGET.md holds the run and the machine.
 *
 * The measurement found the cost per draw to be **7.0 µs** under 4× CPU throttling — the
 * Lighthouse proxy for the "mid laptop" §13 sets as the bar — and to be flat across a fourfold
 * range in draw count (7.0 µs at 1,664 draws, 7.1 µs at 6,656). So a 16.6 ms frame affords 2,371
 * draws, and 2,000 leaves about 15% of the frame for React, the shared bar, the wallet strip and
 * whatever else is on the same thread.
 *
 * It is a TOTAL rather than a sprite budget, and that correction came from the measurement too:
 * ground is one `drawImage` per tile and there are more tiles than objects — a 32×32 Plot is 1,024
 * ground tiles against a 640-object cap — so a budget that counted only sprites would be counting
 * the smaller half.
 *
 * The first version of this constant was `SPRITE_BUDGET = 2400`, reasoned rather than measured,
 * and it was wrong in two ways at once: it counted the wrong thing, and it was set from a guess
 * about a machine nobody had run.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
export const DRAW_BUDGET = 2000

/**
 * Zoom below which object sprites are not drawn at all, whatever the count.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * 0.17, AND THE THIRD DECIMAL PLACE IS LOAD-BEARING.
 *
 * This was 0.18, chosen because at that zoom a 512-pixel sprite is 92 device pixels and a chair is
 * a smudge. The measurement showed that number is WRONG BY A HAIR AND THEREFORE COMPLETELY WRONG:
 * a 32×32 Plot fits a 1440×900 viewport at zoom **0.1758**, so a floor of 0.18 would have refused
 * to draw a single object on the one screen the whole tier exists for — a player looking at their
 * own fully-built Plot, seeing bare ground.
 *
 * That is the shape of failure a reasoned constant produces and a measured one does not: nothing
 * about 0.18 looks wrong until something lands 1.2% below it.
 *
 * The coincidence is worth stating because it is not a coincidence. `zoomToFit` for the four tiers
 * at 1440×900 is 0.352 (Homestead), 0.176 (Plot), 0.088 (Court), 0.044 (Quarter). A floor just
 * under the Plot's fit means **the Plot is the largest claim you ever see whole**, and a Court or
 * a Quarter is something you walk rather than something you look at. §6.4 already puts the
 * overview on a different screen; this is the renderer agreeing with it, in a number.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
export const SPRITE_MIN_ZOOM = 0.17

/**
 * Zoom below which the ground is not drawn either.
 *
 * The same number as {@link SPRITE_MIN_ZOOM} and for the same reason: below it you are looking at
 * a MAP rather than at a place, and a map with painterly ground texture on it at 45 pixels a tile
 * is a map with mush on it.
 *
 * It is separately named rather than an alias because the two floors answer different questions
 * and a future measurement may move one and not the other. docs/RENDER-BUDGET.md records the
 * measured reason it might: at 0.17 a CONTINUOUS ward's ground alone is about 2,700 tiles in a
 * 1440×900 viewport, which is over {@link DRAW_BUDGET} before a single object is drawn. The
 * measurement was taken on isolated parcels, where the ground stops at the claim boundary, so the
 * numbers below do not yet cover that case — and the fix, when it is measured, is a ground cache
 * baked at DISPLAY scale rather than world scale. See the header for what happened the last time
 * ground was cached at world scale.
 */
export const GROUND_MIN_ZOOM = 0.17

/** Anything the renderer can draw: a decoded bitmap, or the canvas a chunk was baked into. */
export type Sprite = CanvasImageSource

/** Resolves a stable asset path to a decoded bitmap, or undefined if it is not loaded yet. */
export interface SpriteSource {
  get(path: string): Sprite | undefined
}

export interface FrameStats {
  /** Object sprites actually drawn. */
  readonly sprites: number
  /** Object sprites inside the viewport — equal to `sprites` unless the budget was crossed. */
  readonly visible: number
  /** Ground tiles drawn. */
  readonly ground: number
  /** True when the frame drew ground and outlines instead of sprites. */
  readonly degraded: boolean
  /** Wall-clock milliseconds spent inside `draw`. */
  readonly ms: number
}

/**
 * Tiles per side of a spatial bucket.
 *
 * A BUCKET, not a cache: nothing is baked into a canvas any more (see the header). It exists only
 * so a frame can ask "which placements are near here" without walking a 65,536-tile world, and 16
 * is chosen so that a bucket is comfortably smaller than a viewport at the zoom floor — at 0.18 a
 * 1440×900 viewport spans about 2,400 tiles, or ten buckets, which is few enough that the
 * per-bucket overhead is nothing and many enough that the cull actually rejects something.
 */
const CHUNK = 16

const chunkKey = (cx: number, cy: number): string => `${cx}:${cy}`

/**
 * A scene, indexed for the two questions a frame asks: which ground tiles are in this chunk, and
 * which placements are on this tile.
 *
 * Built once per scene rather than per frame. That is the difference between O(world) and
 * O(viewport) work in the render loop, and at a Quarter's 10,240 placements it is the difference
 * between a frame and a stall.
 */
export class SceneIndex {
  readonly scene: Scene
  private readonly groundByChunk = new Map<string, { tile: Tile; sprite: string }[]>()
  private readonly placementsByChunk = new Map<string, Placement[]>()

  constructor(scene: Scene) {
    this.scene = scene
    for (const g of scene.ground) {
      const key = chunkKey(Math.floor(g.tile.tx / CHUNK), Math.floor(g.tile.ty / CHUNK))
      const bucket = this.groundByChunk.get(key)
      if (bucket) bucket.push(g)
      else this.groundByChunk.set(key, [g])
    }
    for (const p of scene.placements) {
      const key = chunkKey(Math.floor(p.tile.tx / CHUNK), Math.floor(p.tile.ty / CHUNK))
      const bucket = this.placementsByChunk.get(key)
      if (bucket) bucket.push(p)
      else this.placementsByChunk.set(key, [p])
    }
  }

  groundIn(cx: number, cy: number): readonly { tile: Tile; sprite: string }[] {
    return this.groundByChunk.get(chunkKey(cx, cy)) ?? []
  }

  placementsIn(cx: number, cy: number): readonly Placement[] {
    return this.placementsByChunk.get(chunkKey(cx, cy)) ?? []
  }
}

/**
 * The tile-space chunks a viewport touches.
 *
 * The four screen corners are un-projected to tile space and the bounding box of the four results
 * is taken. That box is a superset of what is visible — an axis-aligned rectangle around a rotated
 * diamond always is — which is the right direction to be wrong in: over-including a chunk costs
 * one blit that gets clipped, under-including one leaves a hole in the world.
 *
 * The box is grown by `pad` tiles on every side because a sprite is 512 tall against a 128-tall
 * tile: an object whose FLOOR is four tiles below the bottom of the screen still has pixels on
 * screen, and a cull that only asked about floors would pop the top off every lamp-post as it
 * scrolled in. 512/128 = 4, plus one for a 2×2's offset anchor.
 */
export function visibleChunks(
  camera: Camera,
  viewport: Viewport,
  pad = 5,
): { cx0: number; cy0: number; cx1: number; cy1: number } {
  const corners: Point[] = [
    screenToWorld({ x: 0, y: 0 }, camera, viewport),
    screenToWorld({ x: viewport.width, y: 0 }, camera, viewport),
    screenToWorld({ x: 0, y: viewport.height }, camera, viewport),
    screenToWorld({ x: viewport.width, y: viewport.height }, camera, viewport),
  ]
  const tiles = corners.map(worldToTile)
  const txs = tiles.map((t) => t.tx)
  const tys = tiles.map((t) => t.ty)
  return {
    cx0: Math.floor((Math.min(...txs) - pad) / CHUNK),
    cy0: Math.floor((Math.min(...tys) - pad) / CHUNK),
    cx1: Math.floor((Math.max(...txs) + pad) / CHUNK),
    cy1: Math.floor((Math.max(...tys) + pad) / CHUNK),
  }
}

export interface RendererOptions {
  /** Device pixel ratio the canvas is sized at. Read once; the caller re-creates on change. */
  readonly dpr?: number
  /**
   * Override {@link SPRITE_BUDGET} and {@link SPRITE_MIN_ZOOM}.
   *
   * These exist for ONE caller: `test/perf/measure.ts`, which is the run that CHOOSES these
   * constants. A renderer that already enforced them would return a flat line at the budget and
   * would be measuring the guess rather than the machine.
   *
   * They are here, in the renderer's own options, rather than as a mutable module binding the
   * harness reaches in and reassigns. The first version of this measurement carried a comment
   * saying degradation was disabled and disabled nothing — every fitted scenario reported
   * `drawn 0`, and the comment read as though the numbers were sound. A knob that must be passed
   * cannot be claimed to have been passed.
   */
  readonly drawBudget?: number
  readonly spriteMinZoom?: number
  /** As above, for the ground floor. */
  readonly groundMinZoom?: number
}

export class WorldRenderer {
  private readonly ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  private readonly options: RendererOptions
  private index: SceneIndex | null = null
  /** Reused across frames so a 10,000-placement scene does not allocate an array per frame. */
  private readonly drawList: Placement[] = []

  constructor(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    options: RendererOptions,
  ) {
    this.ctx = ctx
    this.options = options
  }

  /**
   * Replace the scene.
   *
   * There is no `invalidate(tile)` any more and there is nothing to invalidate: ground is drawn
   * from the scene every frame, so an edit is visible on the next one. That is the second thing
   * deleting the chunk cache bought — the first version of this class had a cache-invalidation
   * method, which is a thing that can be forgotten at exactly one call site and produce a world
   * that does not change when you change it.
   */
  setScene(scene: Scene): void {
    this.index = new SceneIndex(scene)
  }

  /**
   * Draw one frame.
   *
   * Returns what it did rather than logging it, so the measurement harness, the tests and the
   * on-screen diagnostics all read the same numbers from the same place. A renderer whose
   * instrumentation is a `console.log` is a renderer that cannot be measured in CI.
   */
  draw(camera: Camera, viewport: Viewport, sprites: SpriteSource): FrameStats {
    const started = now()
    const ctx = this.ctx
    const dpr = this.options.dpr ?? 1
    const index = this.index

    ctx.save()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    // `#12100f` is the estate's pinned ground (`brand/normalise_ground.py`,
    // `TARGET = (0x12,0x10,0x0F)`) and every sprite was generated standing on it. Clearing to the
    // same value means the seam between a cut-out sprite's fringe and the page behind it is the
    // colour the fringe already is.
    ctx.fillStyle = '#12100f'
    ctx.fillRect(0, 0, viewport.width, viewport.height)

    if (!index) {
      ctx.restore()
      return { sprites: 0, visible: 0, ground: 0, degraded: false, ms: now() - started }
    }

    const box = visibleChunks(camera, viewport)
    const groundFloor = this.options.groundMinZoom ?? GROUND_MIN_ZOOM
    const groundDrawn = camera.zoom >= groundFloor
    let ground = 0

    /* ── ground, one drawImage per visible tile ────────────────────────────────────────────── */

    if (groundDrawn) {
      const w = TILE_W * camera.zoom
      const h = TILE_H * camera.zoom
      for (let cy = box.cy0; cy <= box.cy1; cy += 1) {
        for (let cx = box.cx0; cx <= box.cx1; cx += 1) {
          const bucket = index.groundIn(cx, cy)
          for (let i = 0; i < bucket.length; i += 1) {
            const tile = bucket[i] as { tile: Tile; sprite: string }
            const sprite = sprites.get(tile.sprite)
            if (!sprite) continue
            const world = tileToWorld(tile.tile)
            const at = worldToScreen({ x: world.x - TILE_W / 2, y: world.y - TILE_H / 2 }, camera, viewport)
            // Per-tile cull. The bucket cull is coarse — a bucket is 16 tiles across and the
            // viewport's tile-space bounding box is a rectangle around a diamond — so most of the
            // rejection happens here, on a comparison rather than on a draw call.
            if (at.x + w < 0 || at.y + h < 0 || at.x > viewport.width || at.y > viewport.height) {
              continue
            }
            ctx.drawImage(sprite, at.x, at.y, w, h)
            ground += 1
          }
        }
      }
    }

    /* ── objects, back to front ────────────────────────────────────────────────────────────── */

    const list = this.drawList
    list.length = 0
    for (let cy = box.cy0; cy <= box.cy1; cy += 1) {
      for (let cx = box.cx0; cx <= box.cx1; cx += 1) {
        const bucket = index.placementsIn(cx, cy)
        for (let i = 0; i < bucket.length; i += 1) list.push(bucket[i] as Placement)
      }
    }
    const visible = list.length

    // The budget is spent on ground FIRST and objects second, because ground is the floor: an
    // object hovering over nothing is a worse picture than a floor with nothing on it, and the
    // ground count is already bounded by the zoom floor while the object count is not.
    const budget = this.options.drawBudget ?? DRAW_BUDGET
    const minZoom = this.options.spriteMinZoom ?? SPRITE_MIN_ZOOM
    const degraded = camera.zoom < minZoom || ground + visible > budget
    let drawn = 0
    if (!degraded) {
      // Sorting a reused array in place. `sort` is comparison-based and O(n log n); at the
      // budget's 2,400 that is ~27,000 comparisons, which the measurement showed costs well under
      // a millisecond and is nowhere near the frame's cost. The draw calls are.
      list.sort((a, b) => depthOf(a.tile, a.footprint) - depthOf(b.tile, b.footprint))
      for (let i = 0; i < list.length; i += 1) {
        const p = list[i] as Placement
        const sprite = sprites.get(p.sprite)
        if (!sprite) continue
        const origin = spriteOrigin(p.tile, p.footprint)
        const at = worldToScreen(origin, camera, viewport)
        const size = SPRITE * camera.zoom
        if (at.x + size < 0 || at.y + size < 0 || at.x > viewport.width || at.y > viewport.height) {
          continue
        }
        if (p.facing === -1) {
          // A horizontal mirror at render time, which §2.1 forces: studio has no `seed` column, so
          // there is no second asset to draw. `translate` to the sprite's right edge and scale -1
          // rather than scaling about the origin, which would draw it a sprite-width to the left.
          ctx.save()
          ctx.translate(at.x + size, at.y)
          ctx.scale(-1, 1)
          ctx.drawImage(sprite, 0, 0, size, size)
          ctx.restore()
        } else {
          ctx.drawImage(sprite, at.x, at.y, size, size)
        }
        drawn += 1
      }
    }

    ctx.restore()
    return { sprites: drawn, visible, ground, degraded, ms: now() - started }
  }

  /**
   * Screen point → tile, so a click can be resolved without the caller knowing the projection.
   *
   * Ground only. Picking the OBJECT under a point is a different question with a different answer
   * — it needs the depth order and the sprite's alpha — and it is not answered here because
   * nothing in this client needs it yet. An approximate version would be worse than none: a build
   * tool that picks the wrong object is a tool that deletes the wrong object.
   */
  tileAt(screen: Point, camera: Camera, viewport: Viewport): Tile {
    return worldToTile(screenToWorld(screen, camera, viewport))
  }

}

/** `performance.now()` where it exists, `Date.now()` where it does not. */
function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}
