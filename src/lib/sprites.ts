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
 */
import { assetBase } from './hosts.ts'

/** Decoded bitmaps by stable asset path — `objects/seating-stool`, `tiles/ashfield-ground-a`. */
export class SpriteCache {
  private readonly bitmaps = new Map<string, ImageBitmap>()
  private readonly failed = new Set<string>()
  private readonly inflight = new Map<string, Promise<void>>()
  private readonly onChange: () => void

  constructor(onChange: () => void) {
    this.onChange = onChange
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
    const queue = [...wanted]
    const workers = Array.from({ length: Math.min(6, queue.length) }, async () => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        await this.fetchOne(next)
      }
    })
    await Promise.all(workers)
    this.onChange()
  }

  private async fetchOne(path: string): Promise<void> {
    const task = (async (): Promise<void> => {
      try {
        // `.png` is appended here rather than stored in every placement, so the world's data
        // carries an identity and not a file extension. If the pipeline ever emits webp, this is
        // the one line that changes.
        const res = await fetch(`${assetBase()}/${path}.png`)
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
