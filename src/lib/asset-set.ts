/**
 * The mount's own receipt, and why this client no longer spells a filename.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE DEFECT THIS FILE EXISTS TO END: EVERY CHECK PASSED AND EVERY TILE WAS A HOLE.
 *
 * `src/lib/sprites.ts` used to build a sprite's URL by appending `.png` to its identity:
 *
 *     fetch(`${assetBase()}/${path}.png`)     →  /world-assets/tiles/ashfield-ground-a.png
 *
 * Every file `micro-tessera-assets` materialises carries the delivered size in its NAME:
 *
 *     MANIFEST.json  "asset": "tiles/ashfield-ground-a"
 *                    "path":  "assets/tiles/ashfield-ground-a-256x128.png"
 *
 * So the mount could be complete — 392 of 392 files, byte-identical through the container, the
 * receipt validated, every healthcheck green — and every single sprite this client asked for was
 * a 404. `micro-deploy`'s `scripts/estate-verify.sh` found it by DRIVING the two together, which
 * is the only place it is visible: neither repository is wrong when read on its own.
 *
 * ── WHICH SIDE WAS WRONG, AND WHY IT IS THIS ONE ──────────────────────────────────────────────
 *
 * This one. The naming contract was never ambiguous and was never this client's to invent:
 *
 *   - `micro-tessera-assets/providers.json` declares the `identity` block — `key: [asset,
 *     declaredSize]`, `label: [asset]` — precisely so that `providers.py`, `compare.py` and
 *     `verify.py` cannot fork their idea of what keys an asset.
 *   - `MANIFEST.json` carries BOTH `asset` (the identity) and `path` (the file). They are
 *     different strings on every one of the 392 entries, and always have been.
 *   - `materialise.py` writes `SET.json` beside the bytes, mapping every identity it wrote to the
 *     path it wrote it at.
 *
 * The size suffix is not decoration either. The 96 terrain tiles are DERIVED rather than
 * generated — `project_iso.py` cuts them from 32 1024×1024 plates, rotates 45°, squashes 2:1 and
 * antialiases a diamond — so `-256x128` states the tile geometry the projection produced. Dropping
 * it from the filenames would delete a fact, and would rewrite the `path` of every entry in four
 * repositories' manifests besides.
 *
 * ── SO THE NAME IS DERIVED FROM ONE SOURCE RATHER THAN SPELLED TWICE ──────────────────────────
 *
 * The client asks by IDENTITY — `tiles/ashfield-ground-a`, `objects/seating-stool` — and this
 * module resolves that identity against the receipt THE MOUNT ITSELF SERVES. Nothing in this
 * bundle constructs a filename any more, so there is no second convention to drift:
 *
 *   - a set materialised with `--flatten` serves different paths, and this resolves them,
 *   - a provider switch that changes an asset's delivered size resolves too,
 *   - and an identity the mounted set does NOT name is a hole with a name and a reason, rather
 *     than a request nobody sees fail.
 *
 * The alternative — an nginx rewrite at the gateway — was available and is refused for the reason
 * `estate-verify.sh` gives: it would leave two naming conventions in the estate, one of them
 * invisible, in the one place neither repository would look. A check that passes while the product
 * is broken is the thing this file is written against.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import { assetBase } from './hosts.ts'

/** The file name of the receipt `materialise.py` writes beside the bytes it copies. */
export const RECEIPT = 'SET.json'

/**
 * One row of `SET.json`'s `files`, as `materialise.py` writes it.
 *
 * Only the three fields this client reads are declared. `sha256`, `materialisedSha256` and
 * `declaredSize` are in the receipt and are deliberately NOT read here: verifying bytes is
 * `verify.py`'s job and re-doing it in a browser would download the set twice.
 */
export interface ReceiptFile {
  /** `<identity>@<declaredSize>` — `providers.py:key_of`, driven by providers.json. */
  readonly key: string
  /** Where the bytes landed, relative to the mount root. */
  readonly path: string
  /**
   * False for an entry that counts towards completeness and is never copied — the `-asdelivered`
   * originals, which are provenance rather than something a browser asks for.
   */
  readonly shipped?: boolean
}

export interface Receipt {
  readonly provider?: string
  readonly files?: readonly ReceiptFile[]
}

/**
 * The identity half of a receipt key.
 *
 * `providers.json`'s `identity.key` is `[asset, declaredSize]` and `providers.py:key_of` joins the
 * leading fields with `/` and appends `@<last>`. So the identity is everything before the LAST
 * `@` — last rather than first, because the leading fields are a path and a path may not be
 * assumed free of the character.
 *
 * This is the one thing about the set's spelling that this file knows, and it is checked rather
 * than trusted: {@link parseReceipt} refuses a receipt whose rows do not produce identities.
 */
export function identityOf(key: string): string {
  const at = key.lastIndexOf('@')
  return at === -1 ? key : key.slice(0, at)
}

/**
 * What the mount is serving, resolved.
 *
 * `absent` is a SUPPORTED state and not an error: `micro-deploy` mounts an empty directory by
 * default, `nginx.conf` 404s the location, and this client draws holes and names them. What must
 * never happen is a third state where the client guesses.
 */
export type AssetSet =
  | { readonly state: 'absent'; readonly why: string }
  | {
      readonly state: 'present'
      readonly provider: string
      /** Identity → absolute URL. */
      readonly urlOf: (identity: string) => string | undefined
      /** How many identities the mounted set names. */
      readonly size: number
    }

/**
 * Read a receipt into an identity → path map.
 *
 * Exported so a test can drive it without a network, and so the shape this client depends on is
 * asserted somewhere other than at runtime.
 */
export function parseReceipt(document: unknown): ReadonlyMap<string, string> | undefined {
  const receipt = document as Receipt | null
  if (!receipt || typeof receipt !== 'object' || !Array.isArray(receipt.files)) return undefined
  const map = new Map<string, string>()
  for (const file of receipt.files) {
    if (!file || typeof file.key !== 'string' || typeof file.path !== 'string') return undefined
    // Provenance originals are counted by the generator and never copied, so a client that
    // resolved one would be resolving a path the mount does not hold.
    if (file.shipped === false) continue
    map.set(identityOf(file.key), file.path)
  }
  // A receipt that parses and names nothing is a receipt this client does not understand — a
  // rename in `materialise.py`, or a file that is not one it wrote. Reported as absent WITH a
  // reason rather than as an empty set, which would silently make every sprite a hole.
  return map.size === 0 ? undefined : map
}

/**
 * Fetch the mounted set's receipt.
 *
 * Called once per {@link SpriteCache}. Failure in every form — 404, a body that is not a receipt,
 * a network error — resolves to `absent` with the reason, because a client that threw here would
 * turn the supported no-art-mounted state into a broken screen.
 */
export async function loadAssetSet(base = assetBase()): Promise<AssetSet> {
  let document: unknown
  try {
    const res = await fetch(`${base}/${RECEIPT}`)
    if (!res.ok) {
      return {
        state: 'absent',
        why: `${base}/${RECEIPT} answered ${res.status} — no asset set is mounted`,
      }
    }
    document = await res.json()
  } catch (error) {
    return { state: 'absent', why: `${base}/${RECEIPT} could not be read: ${String(error)}` }
  }

  const map = parseReceipt(document)
  if (!map) {
    return {
      state: 'absent',
      why: `${base}/${RECEIPT} is not a receipt materialise.py wrote — it names no asset`,
    }
  }
  const provider = (document as Receipt).provider ?? 'unnamed'
  return {
    state: 'present',
    provider,
    size: map.size,
    urlOf: (identity: string) => {
      const path = map.get(identity)
      return path === undefined ? undefined : `${base}/${path}`
    },
  }
}
