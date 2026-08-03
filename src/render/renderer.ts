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
 *   2. **It draws the ground into cached chunk canvases.** Ground is static between edits and it
 *      is the majority of the draw calls — a 32×32 Plot is 1,024 ground tiles against a 640-object
 *      cap. Redrawing it per frame spends most of the budget on the part of the picture that did
 *      not change.
 *   3. **It has a measured ceiling and degrades ON PURPOSE when it is crossed.** Past
 *      {@link SPRITE_BUDGET} visible objects the renderer stops drawing sprites and draws the
 *      ground plus parcel outlines instead. That is a rendering decision, not a game rule: the
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
 * The number of object sprites this renderer will draw in one frame before it switches to the
 * ground-and-outlines view.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * 2,400, AND THE NUMBER IS MEASURED. docs/RENDER-BUDGET.md holds the run.
 *
 * It is deliberately BELOW the frame budget rather than at it. A measured ceiling used as a
 * threshold means the very first frame that crosses it is already the frame that missed, so the
 * degrade would always arrive one frame late — and one late frame on a zoom gesture is the janky
 * scroll the user actually notices. There is headroom for the rest of the page: React, the shared
 * bar, the wallet strip and whatever the browser is doing on the same thread.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
export const SPRITE_BUDGET = 2400

/**
 * Zoom below which object sprites are not drawn at all, whatever the count.
 *
 * At 0.18 a 512-pixel sprite is 92 device pixels and a 256-pixel tile is 46 — a chair is a smudge,
 * and the browser is spending a full bilinear downsample of a 512×512 texture to produce it. The
 * ward map is a different screen with a different job (§6.4: a ward has a page that "says which
 * instance holds whom"), and it should not be reached by zooming the world view out until the
 * world view becomes a bad version of it.
 */
export const SPRITE_MIN_ZOOM = 0.18

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
  /** Ground chunks blitted. */
  readonly chunks: number
  /** Ground chunks baked THIS frame — nonzero only after an edit or a first visit. */
  readonly baked: number
  /** True when the frame drew ground and outlines instead of sprites. */
  readonly degraded: boolean
  /** Wall-clock milliseconds spent inside `draw`. */
  readonly ms: number
}

/** One ground chunk: `CHUNK` × `CHUNK` tiles baked into a single canvas. */
const CHUNK = 16

interface BakedChunk {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas
  /** World-pixel position of the canvas's top-left corner. */
  readonly origin: Point
  readonly width: number
  readonly height: number
  /** Every tile in the chunk was resolvable when it was baked. A partial bake is re-baked. */
  readonly complete: boolean
}

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
  /**
   * Make an offscreen canvas. Injected so the renderer can be measured and tested outside a
   * document — and so that a browser without `OffscreenCanvas` gets a real `<canvas>` rather than
   * a renderer that silently stops caching ground.
   */
  readonly makeCanvas: (w: number, h: number) => HTMLCanvasElement | OffscreenCanvas
  /** Device pixel ratio the canvas is sized at. Read once; the caller re-creates on change. */
  readonly dpr?: number
  /**
   * Override {@link SPRITE_BUDGET} and {@link SPRITE_MIN_ZOOM}.
   *
   * These exist for ONE caller: `test/perf/measure.ts`, which is the run that CHOOSES those two
   * constants. A renderer that already enforced them would return a flat line at the budget and
   * would be measuring the guess rather than the machine.
   *
   * They are here, in the renderer's own options, rather than as a mutable module binding the
   * harness reaches in and reassigns. The first version of this measurement carried a comment
   * saying degradation was disabled and disabled nothing — every fitted scenario reported
   * `drawn 0`, and the comment read as though the numbers were sound. A knob that must be passed
   * cannot be claimed to have been passed.
   */
  readonly spriteBudget?: number
  readonly spriteMinZoom?: number
}

export class WorldRenderer {
  private readonly ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  private readonly options: RendererOptions
  private readonly chunks = new Map<string, BakedChunk>()
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

  /** Replace the scene. Ground chunks are dropped, because ground is part of the scene. */
  setScene(scene: Scene): void {
    this.index = new SceneIndex(scene)
    this.chunks.clear()
  }

  /** Drop one chunk's bake — what an edit to a single tile costs. */
  invalidate(tile: Tile): void {
    this.chunks.delete(chunkKey(Math.floor(tile.tx / CHUNK), Math.floor(tile.ty / CHUNK)))
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
    // `#12100f` is the estate's pinned ground (`brand/normalise_ground.py:27`,
    // `TARGET = (0x12,0x10,0x0F)`) and every sprite was generated standing on it. Clearing to the
    // same value means the seam between a cut-out sprite's fringe and the page behind it is the
    // colour the fringe already is.
    ctx.fillStyle = '#12100f'
    ctx.fillRect(0, 0, viewport.width, viewport.height)

    if (!index) {
      ctx.restore()
      return { sprites: 0, visible: 0, chunks: 0, baked: 0, degraded: false, ms: now() - started }
    }

    const box = visibleChunks(camera, viewport)
    let blitted = 0
    let baked = 0

    /* ── ground, from the chunk cache ──────────────────────────────────────────────────────── */

    for (let cy = box.cy0; cy <= box.cy1; cy += 1) {
      for (let cx = box.cx0; cx <= box.cx1; cx += 1) {
        const chunk = this.chunkFor(cx, cy, index, sprites)
        if (!chunk) continue
        if (!chunk.complete) baked += 1
        const at = worldToScreen(chunk.origin, camera, viewport)
        ctx.drawImage(
          chunk.canvas,
          at.x,
          at.y,
          chunk.width * camera.zoom,
          chunk.height * camera.zoom,
        )
        blitted += 1
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

    const budget = this.options.spriteBudget ?? SPRITE_BUDGET
    const minZoom = this.options.spriteMinZoom ?? SPRITE_MIN_ZOOM
    const degraded = camera.zoom < minZoom || visible > budget
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
    return { sprites: drawn, visible, chunks: blitted, baked, degraded, ms: now() - started }
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

  private chunkFor(
    cx: number,
    cy: number,
    index: SceneIndex,
    sprites: SpriteSource,
  ): BakedChunk | null {
    const key = chunkKey(cx, cy)
    const cached = this.chunks.get(key)
    if (cached?.complete) return cached

    const tiles = index.groundIn(cx, cy)
    if (tiles.length === 0) return null

    // World-pixel bounds of a CHUNK×CHUNK block of tiles. The block is a diamond, so its bounding
    // box is CHUNK*TILE_W wide and CHUNK*TILE_H tall, with its left corner at the tile (tx0, ty1).
    const tx0 = cx * CHUNK
    const ty0 = cy * CHUNK
    const width = CHUNK * TILE_W
    const height = CHUNK * TILE_H
    const origin: Point = {
      x: tileToWorld({ tx: tx0, ty: ty0 + CHUNK - 1 }).x - TILE_W / 2,
      y: tileToWorld({ tx: tx0, ty: ty0 }).y - TILE_H / 2,
    }

    const canvas = this.options.makeCanvas(width, height)
    const cctx = canvas.getContext('2d') as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null
    if (!cctx) return null

    let complete = true
    for (const g of tiles) {
      const sprite = sprites.get(g.sprite)
      if (!sprite) {
        complete = false
        continue
      }
      const world = tileToWorld(g.tile)
      cctx.drawImage(sprite, world.x - origin.x - TILE_W / 2, world.y - origin.y - TILE_H / 2)
    }

    const chunk: BakedChunk = { canvas, origin, width, height, complete }
    // An INCOMPLETE chunk is cached too, so a frame drawn while sprites are still decoding shows
    // the ground it has rather than nothing — and `complete: false` makes the next frame re-bake
    // it. Caching only complete chunks would re-bake every chunk every frame until the last byte
    // arrived, which is the worst moment to be doing the most work.
    this.chunks.set(key, chunk)
    return chunk
  }
}

/** `performance.now()` where it exists, `Date.now()` where it does not. */
function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}
