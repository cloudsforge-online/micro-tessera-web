/**
 * What the renderer is given, and what it is allowed to decide.
 *
 * §4: "The client is a viewer: it renders what it is told and decides nothing." So a Scene is
 * plain data that came off the wire, and this module holds no rule. Specifically it does not
 * know what a parcel's object cap is, whether a parcel is fallow, or whether a placement is
 * legal — every one of those is `micro-tessera`'s, asserted in its database (§11.6), and a client
 * that re-asserted them would be the defect docs/ecosystem/22 names: a game client that withheld
 * four SKUs from its UI while the payment routes stayed live and chargeable.
 *
 * The renderer's only judgement is about PIXELS: what is on screen, in what order, at what
 * fidelity. That judgement is measured, in docs/RENDER-BUDGET.md.
 */
import type { Tile } from './iso.ts'

/** The two footprints the design has, and no third. §6.3. */
export type Footprint = '1x1' | '2x2'

/**
 * One object standing on the ground.
 *
 * `facing` is `1 | -1`, not a compass point: §2.1 forces exactly two facings — "one canonical
 * facing per object. The second facing is a HORIZONTAL MIRROR applied at render time, not a second
 * asset", because `micro-studio` has no `seed` column and a pipeline that cannot fix a seed cannot
 * render the same chair four times. So -1 is a `scale(-1, 1)` on the sprite and there is no
 * representation of a third facing to accidentally accept.
 */
export interface Placement {
  readonly id: string
  readonly tile: Tile
  readonly footprint: Footprint
  readonly facing: 1 | -1
  /**
   * The sprite's stable path under `micro-tessera-assets`, e.g. `objects/seating-stool`.
   *
   * A PATH, never a provider. `materialise.py` "writes bytes under paths identical in every
   * provider's manifest", so a client that stored `candidates/qwen-image-2512/...` anywhere would
   * be pinning an experiment into the world's data. There is no fallback path either: an
   * incomplete set fails loudly and writes nothing, by design.
   */
  readonly sprite: string
}

/** One ground tile. `sprite` is a `tiles/<ward>-<tile>` path from set 2 (§2.5). */
export interface GroundTile {
  readonly tile: Tile
  readonly sprite: string
}

export interface Scene {
  readonly wardId: string
  readonly ground: readonly GroundTile[]
  readonly placements: readonly Placement[]
}

/** A rectangle of tiles — a parcel's claim (§4), or the tile-space bounds of a viewport. */
export interface TileRect {
  readonly tx: number
  readonly ty: number
  readonly w: number
  readonly h: number
}

export function rectContains(rect: TileRect, tile: Tile): boolean {
  return (
    tile.tx >= rect.tx &&
    tile.tx < rect.tx + rect.w &&
    tile.ty >= rect.ty &&
    tile.ty < rect.ty + rect.h
  )
}
