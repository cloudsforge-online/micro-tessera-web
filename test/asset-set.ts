/**
 * The real asset set, read off disk, as the receipt a mount would serve.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS READS `../tessera-assets` RATHER THAN CARRYING A FIXTURE.
 *
 * The defect this exists for is a DISAGREEMENT BETWEEN TWO REPOSITORIES: this client asked for
 * `tiles/ashfield-ground-a.png` while the set held `tiles/ashfield-ground-a-256x128.png`, and both
 * sides were internally consistent, fully tested and green. A fixture written here would be a
 * third spelling of the same convention, authored by whoever wrote the test — so it would agree
 * with the client by construction and could never catch the thing that happened.
 *
 * So the receipt is built from `MANIFEST.json`'s own entries, keyed by `providers.json`'s own
 * `identity` block, exactly as `materialise.py` builds it. If `micro-tessera-assets` renames an
 * asset, this changes under the tests that read it, which is the entire point.
 *
 * Where the sibling is not checked out — CI checks out this repository and micro-ui and nothing
 * else — {@link assetSetAvailable} is false and the callers SKIP. Never `return`: six tests in
 * this estate returned instead of skipping and were reported green having asserted nothing.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ESTATE = fileURLToPath(new URL('../../', import.meta.url))

/** `micro-tessera-assets`, when it happens to be checked out beside this repository. */
export const ASSETS_REPO = join(ESTATE, 'tessera-assets')

export const assetSetAvailable = (): boolean => existsSync(join(ASSETS_REPO, 'MANIFEST.json'))

export interface ManifestEntry {
  readonly asset: string
  readonly path: string
  readonly declaredSize: string
}

export interface ReceiptRow {
  readonly key: string
  readonly path: string
  readonly shipped: boolean
}

export interface SetReceipt {
  readonly provider: string
  readonly files: readonly ReceiptRow[]
}

/** Every entry of the reference manifest, and the identity fields `providers.json` declares. */
export function readManifest(): { assets: ManifestEntry[]; identityKey: string[] } {
  const assets = JSON.parse(readFileSync(join(ASSETS_REPO, 'MANIFEST.json'), 'utf8')).assets as
    | ManifestEntry[]
    | undefined
  // Read rather than restated. `providers.py:key_of` is driven by this block precisely so the
  // loaders cannot fork their idea of what keys an asset; hardcoding `asset` + `declaredSize`
  // here would be a fourth fork of exactly that.
  const identityKey = JSON.parse(readFileSync(join(ASSETS_REPO, 'providers.json'), 'utf8')).identity
    .key as string[]
  assert.ok(Array.isArray(assets) && assets.length > 0, 'MANIFEST.json names no assets')
  assert.ok(identityKey.length >= 2, "providers.json's identity.key is not <fields...>@<last>")
  return { assets, identityKey }
}

/**
 * The `SET.json` `materialise.py` would write for that manifest.
 *
 * `key` is `providers.py:key_of` — the leading identity fields joined with `/`, then `@` and the
 * last one. `path` is `destination_of`, which is the manifest path relative to `assets/`. Built
 * from the manifest rather than by running the Python, so these tests need only the repository on
 * disk; the real receipt written by the real script is checked by driving the real container,
 * which is recorded in README.md.
 */
export function receiptFromManifest(): SetReceipt {
  const { assets, identityKey } = readManifest()
  const fields = identityKey as (keyof ManifestEntry)[]
  const last = fields[fields.length - 1] as keyof ManifestEntry
  return {
    provider: 'flux-2-pro',
    files: assets.map((entry) => ({
      key: `${fields
        .slice(0, -1)
        .map((f) => String(entry[f]))
        .join('/')}@${String(entry[last])}`,
      path: entry.path.replace(/^assets\//, ''),
      shipped: true,
    })),
  }
}
