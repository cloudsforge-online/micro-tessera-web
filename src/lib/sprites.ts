/**
 * Loading sprite bytes, and what happens when a sprite is not there.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THERE IS NO FALLBACK SPRITE, AND THAT IS THE DESIGN RATHER THAN A GAP.
 *
 * `micro-tessera-assets` is explicit: an incomplete set "fails loudly and writes nothing; there is
 * no fallback, by design". A client that substituted a placeholder for a missing sprite would
 * convert that loud failure into a world that quietly renders wrong — every chair in a ward
 * showing the same grey box, and nobody able to tell whether the ward is broken or whether that
 * is what somebody built.
 *
 * So {@link SpriteCache.get} returns `undefined` for a sprite it does not have, the renderer
 * draws nothing for it, and {@link SpriteCache.missing} lists them by path so a screen can say
 * which ones. A missing sprite is a visible hole with a name, not a substitute.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── Bounded concurrency, and why it is not a nicety ───────────────────────────────────────────
 *
 * A ward's ground is twelve tiles and its objects are up to ninety-six seed sprites plus whatever
 * players fired. Firing all of those at the network at once on a phone produces a request queue
 * the browser services in an order nobody chose, so the ground arrives last and the world is a
 * field of floating furniture for two seconds. Six at a time, ground first.
 *
 * ── AND A URL IS NEVER CONSTRUCTED HERE ───────────────────────────────────────────────────────
 *
 * This file used to build one — `${assetBase()}/${path}.png` — and that one line rendered the
 * whole world as holes against a mount that was complete and validated, because every file the
 * asset pipeline materialises carries its delivered size in its name and this client's identities
 * do not. `lib/asset-set.ts` carries the full account. The identity is asked for; the mount's own
 * receipt says where the bytes are.
 */
import { loadAssetSet, type AssetSet } from './asset-set.ts'

/** Decoded bitmaps by stable asset path — `objects/seating-stool`, `tiles/ashfield-ground-a`. */
export class SpriteCache {
  private readonly bitmaps = new Map<string, ImageBitmap>()
  private readonly failed = new Set<string>()
  private readonly inflight = new Map<string, Promise<void>>()
  private readonly onChange: () => void
  /** Read once per cache, on the first {@link load}. A ward must not re-fetch the receipt. */
  private receipt: Promise<AssetSet> | undefined
  private resolved: AssetSet | undefined

  constructor(onChange: () => void) {
    this.onChange = onChange
  }

  /**
   * What the mount is serving, once something has asked for a sprite.
   *
   * ══════════════════════════════════════════════════════════════════════════════════════════
   * THIS IS HERE BECAUSE "NO ART MOUNTED" AND "THE NAMES DISAGREE" LOOK IDENTICAL OTHERWISE.
   *
   * They are completely different faults with completely different owners — the first is a deploy
   * that has not mapped the volume, the second is this bundle and `micro-tessera-assets` having
   * forked their idea of what an asset is called — and for one night the estate could not tell
   * them apart, because both arrive as a screen full of nothing while every check is green.
   *
   * So the state is readable, `WorldCanvas` prints it beside the list of holes, and a person
   * looking at an empty world is told which of the two it is.
   * ══════════════════════════════════════════════════════════════════════════════════════════
   */
  get set(): AssetSet | undefined {
    return this.resolved
  }

  /** What the renderer calls, once per sprite per frame. Never async, never throws. */
  get(path: string): ImageBitmap | undefined {
    return this.bitmaps.get(path)
  }

  /** Paths that were asked for and could not be fetched or decoded. */
  get missing(): readonly string[] {
    return [...this.failed].sort()
  }

  get loaded(): number {
    return this.bitmaps.size
  }

  /**
   * Ask for a set of sprites, six at a time, in the order given.
   *
   * Order is the caller's and it matters: ground before objects. Idempotent — a path already
   * loaded, in flight, or known-failed is skipped, so a component may call this on every render
   * without re-fetching anything.
   */
  async load(paths: readonly string[]): Promise<void> {
    const wanted = paths.filter(
      (p) => !this.bitmaps.has(p) && !this.failed.has(p) && !this.inflight.has(p),
    )
    if (wanted.length === 0) return

    // Before any sprite request, and exactly once: there is nowhere to fetch from until the mount
    // has said what it holds. With no set mounted every wanted path is a hole with a name — the
    // same outcome as before, reached in one request rather than in several hundred 404s.
    this.receipt ??= loadAssetSet()
    const set = (this.resolved = await this.receipt)
    if (set.state === 'absent') {
      for (const path of wanted) this.failed.add(path)
      this.onChange()
      return
    }

    const queue = [...wanted]
    const workers = Array.from({ length: Math.min(6, queue.length) }, async () => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        await this.fetchOne(next, set.urlOf(next))
      }
    })
    await Promise.all(workers)
    this.onChange()
  }

  /**
   * `url` is `undefined` when the mounted set does not name this identity.
   *
   * That is the divergence case, and it costs no request: the receipt has already said what the
   * mount holds, so asking for a name it does not hold could only produce a 404. It is recorded
   * as a hole exactly like a byte that would not decode, because to a renderer they are the same
   * thing — and `WorldCanvas` says which set was consulted, so the two are told apart on screen.
   */
  private async fetchOne(path: string, url: string | undefined): Promise<void> {
    if (url === undefined) {
      this.failed.add(path)
      return
    }
    const task = (async (): Promise<void> => {
      try {
        const res = await fetch(url)
        if (!res.ok) {
          this.failed.add(path)
          return
        }
        this.bitmaps.set(path, await createImageBitmap(await res.blob()))
      } catch {
        // A decode failure and a network failure are the same thing to a renderer: there is no
        // bitmap. The distinction is worth reporting and is not worth branching on here.
        this.failed.add(path)
      }
    })()
    this.inflight.set(path, task)
    try {
      await task
    } finally {
      this.inflight.delete(path)
    }
  }

  /** Release every decoded bitmap. A ward's worth of 512×512 RGBA is ~100 MB of GPU memory. */
  close(): void {
    for (const bitmap of this.bitmaps.values()) bitmap.close()
    this.bitmaps.clear()
  }
}
