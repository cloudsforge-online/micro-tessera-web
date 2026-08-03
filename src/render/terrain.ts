/**
 * Ground, laid out from a ward's archetype — and the honest note about why the client is doing it.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THIS IS A RENDERING CHOICE WITH NO AUTHORITY, AND IT SHOULD NOT SURVIVE.
 *
 * §4: a ward is "a **256×256 tile grid** — 65,536 tiles — generated from the world seed against
 * one of eight archetypes". The seed is the world's, not the client's. But `micro-tessera`'s
 * `Ward` shape carries `archetype` and no seed, and no route returns ground tiles:
 * `GET /v1/wards/:id` answers `{ ward }` and `GET /v1/parcels/:id` answers
 * `{ parcel, placements }`. There is nowhere to read the ground from.
 *
 * So the client picks a tile per coordinate, deterministically, from the archetype. That is
 * PICTURE, not world state, and the difference is worth being exact about:
 *
 *   - Nothing here is ever sent anywhere. No request in this bundle carries a ground tile.
 *   - Two clients showing the same ward see the same ground, because the function is a hash of
 *     the coordinate and nothing else — no `Math.random`, no clock, no local storage.
 *   - Two DEPLOYS may not, if this function is ever edited. That is the cost, it is real, and it
 *     is the reason this is listed in `MISSING_ROUTES` as a gap in the service rather than
 *     presented as a design.
 *
 * The day `micro-tessera` serves ground — a `seed` on the Ward would be enough — this file
 * becomes a call to it and the hash goes away.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import type { GroundTile } from './scene.ts'

/** The eight ward archetypes, §2.4. The order is the document's. */
export const ARCHETYPES = [
  'ashfield',
  'terrace',
  'wharf',
  'undercroft',
  'glasshouse',
  'kilnyard',
  'grove',
  'saltflat',
] as const

export type Archetype = (typeof ARCHETYPES)[number]

/**
 * The twelve tiles per ward, §2.5, in the document's order.
 *
 * `ground-a` and `ground-b` are cut from different regions of the same plate, so they agree with
 * each other — "this is where painterly earns its keep, because two cuts of one painting agree
 * with each other and two vector tiles would not". The weighting below leans on that: ground is
 * most of the floor and it varies between two tiles that were always meant to sit side by side.
 */
export const TILES = [
  'ground-a',
  'ground-b',
  'ground-worn',
  'path-straight',
  'path-corner',
  'path-tee',
  'verge',
  'verge-corner',
  'step',
  'water',
  'water-edge',
  'rubble',
] as const

export function isArchetype(value: string): value is Archetype {
  return (ARCHETYPES as readonly string[]).includes(value)
}

/**
 * A 32-bit hash of a tile coordinate and a ward slug.
 *
 * FNV-1a over the three inputs. Chosen because it is eight lines, has no state, and produces the
 * same answer in every JavaScript engine — which matters more here than distribution quality,
 * since the output picks between three ground variants rather than seeding a simulation.
 */
function hash(slug: string, tx: number, ty: number): number {
  let h = 0x811c9dc5
  const mix = (n: number): void => {
    h ^= n & 0xff
    h = Math.imul(h, 0x01000193)
    h ^= (n >>> 8) & 0xff
    h = Math.imul(h, 0x01000193)
  }
  for (let i = 0; i < slug.length; i += 1) mix(slug.charCodeAt(i))
  mix(tx)
  mix(tx >>> 16)
  mix(ty)
  mix(ty >>> 16)
  return h >>> 0
}

/**
 * The ground under a rectangle of tiles.
 *
 * `ground-a`, `ground-b` and `ground-worn` in roughly 7:7:2, which is the mix that reads as a
 * surface rather than as a pattern: an even split between two tiles produces a visible
 * checkerboard at this scale, and a single tile produces a visible repeat.
 */
export function groundFor(
  wardSlug: string,
  archetype: Archetype,
  rect: { tx: number; ty: number; w: number; h: number },
): GroundTile[] {
  const out: GroundTile[] = []
  for (let ty = rect.ty; ty < rect.ty + rect.h; ty += 1) {
    for (let tx = rect.tx; tx < rect.tx + rect.w; tx += 1) {
      const roll = hash(wardSlug, tx, ty) % 16
      const tile = roll < 7 ? 'ground-a' : roll < 14 ? 'ground-b' : 'ground-worn'
      out.push({ tile: { tx, ty }, sprite: `tiles/${archetype}-${tile}` })
    }
  }
  return out
}
