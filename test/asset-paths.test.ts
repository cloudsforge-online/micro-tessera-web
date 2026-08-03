/**
 * The name this client asks for, resolved against the bytes `micro-tessera-assets` actually ships.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THIS IS THE TEST THAT WOULD HAVE CAUGHT `tiles/ashfield-ground-a.png`.
 *
 * `src/lib/sprites.ts` used to build a sprite's URL by appending `.png` to its identity, and every
 * file the asset pipeline materialises carries its delivered size in its name. So the two sides
 * were:
 *
 *   client   GET /world-assets/tiles/ashfield-ground-a.png
 *   set          assets/tiles/ashfield-ground-a-256x128.png
 *
 * and a mount that was COMPLETE — 392 of 392 entries, reconciled both ways with zero orphans,
 * every byte served identically through the container, the receipt validated by removing a file
 * and watching it fail at 391 — rendered every tile in the world as a hole. Nothing was red. The
 * defect is only visible where the two repositories meet, and until now nothing in either of them
 * looked at both.
 *
 * ── WHY THIS ASSERTION CANNOT BE SATISFIED BY EITHER SIDE ALONE ───────────────────────────────
 *
 * One side is `ARCHETYPES` × `TILES` in `src/render/terrain.ts` — the identities this client is
 * able to ask for. The other is the bytes on disk in `../tessera-assets`, reached through the same
 * two files the pipeline itself reads: `providers.json`'s `identity` block for how an asset is
 * keyed, and `MANIFEST.json` for what was generated and where it landed. Nothing here restates a
 * filename convention, which is the whole point — `src/lib/asset-set.ts` resolves through the
 * mount's receipt, so this test goes red when an IDENTITY diverges and stays green when a FILE is
 * renamed. That asymmetry is the fix.
 *
 * ── A MISSING SIBLING IS A SKIP, AND NEVER A `return` ─────────────────────────────────────────
 *
 * Six tests in this estate `return`ed instead of skipping and therefore passed. `t.skip()` marks
 * the test skipped in the runner's output; `return` marks it green. `test/citations.test.ts` draws
 * the same line for the same reason.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { test, type TestContext } from 'node:test'

import { identityOf, parseReceipt, loadAssetSet } from '../src/lib/asset-set.ts'
import { ARCHETYPES, TILES } from '../src/render/terrain.ts'
import { ASSETS_REPO, assetSetAvailable, readManifest, receiptFromManifest } from './asset-set.ts'

/** Every ground identity `groundFor` can put in a scene: eight archetypes × twelve tiles. */
const TILE_IDENTITIES = ARCHETYPES.flatMap((a) => TILES.map((t) => `tiles/${a}-${t}`))

/* ── the cross-repository assertion ─────────────────────────────────────────────────────────── */

test('every ground identity this client can ask for is an asset the set ships', (t: TestContext) => {
  if (!assetSetAvailable()) {
    t.skip(`${ASSETS_REPO} is not checked out — this assertion cannot run`)
    return
  }
  const { assets } = readManifest()
  const known = new Set(assets.map((a) => a.asset))

  assert.equal(TILE_IDENTITIES.length, 96, 'the client no longer offers eight archetypes × twelve')
  const absent = TILE_IDENTITIES.filter((id) => !known.has(id))
  assert.deepEqual(
    absent,
    [],
    `${absent.length} identity/identities this client renders are not in the set. Either ` +
      'src/render/terrain.ts names something micro-tessera-assets does not generate, or the set ' +
      'renamed an asset. Neither repository can see this on its own, which is why it is asserted ' +
      'here.',
  )
})

test('the mount receipt resolves every one of those identities to bytes that exist', (t: TestContext) => {
  if (!assetSetAvailable()) {
    t.skip(`${ASSETS_REPO} is not checked out — this assertion cannot run`)
    return
  }
  const map = parseReceipt(receiptFromManifest())
  assert.ok(map, 'the receipt shape this client parses is not the one materialise.py writes')

  for (const identity of TILE_IDENTITIES) {
    const path = map.get(identity)
    assert.ok(path, `${identity} resolves to nothing through the set's own receipt`)
    // The end of the chain: an identity the renderer produces, resolved the way the running
    // client resolves it, naming a file that is really there. Not a path that parses — bytes.
    assert.ok(
      existsSync(join(ASSETS_REPO, 'assets', path)),
      `${identity} resolves to ${path}, and ${join(ASSETS_REPO, 'assets', path)} does not exist`,
    )
  }
})

test('no ground identity is its own filename — the suffix is real and is not this client\'s to spell', (t: TestContext) => {
  if (!assetSetAvailable()) {
    t.skip(`${ASSETS_REPO} is not checked out — this assertion cannot run`)
    return
  }
  // ════════════════════════════════════════════════════════════════════════════════════════════
  // THE DEFECT, STATED AS A PROPERTY RATHER THAN AS A COMMENT.
  //
  // `identity + '.png'` was the old construction and it named nothing. This asserts that it still
  // names nothing — that the resolved filename is genuinely different from the identity — because
  // the day those two coincide is the day somebody may reasonably conclude the resolver is
  // unnecessary machinery and delete it. They do not coincide: the 96 terrain tiles are DERIVED
  // by project_iso.py (region cut, 45° rotate, 2:1 squash, antialiased diamond), and `-256x128`
  // records the geometry that produced them.
  //
  // If this ever goes red, the set has started shipping unsuffixed names and a human should look
  // at why — not delete the assertion.
  // ════════════════════════════════════════════════════════════════════════════════════════════
  const map = parseReceipt(receiptFromManifest())
  assert.ok(map)
  const naive = TILE_IDENTITIES.filter((id) => map.get(id) === `${id}.png`)
  assert.deepEqual(
    naive,
    [],
    `${naive.length} tiles are served at exactly <identity>.png. The client's old construction ` +
      'would work for those and for nothing else, which is how a half-working asset path hides.',
  )
})

/* ── the resolver itself ────────────────────────────────────────────────────────────────────── */

test('an identity is everything before the LAST @, because the identity is a path', () => {
  assert.equal(identityOf('tiles/ashfield-ground-a@256x128'), 'tiles/ashfield-ground-a')
  assert.equal(identityOf('objects/seating-stool@512x512'), 'objects/seating-stool')
  // A key with no size at all still yields an identity rather than an empty string: a receipt
  // written by a future materialise.py with a one-field identity must degrade to the obvious
  // reading rather than to every asset being named "".
  assert.equal(identityOf('icons/spark'), 'icons/spark')
  assert.equal(identityOf('odd@name/thing@256x256'), 'odd@name/thing')
})

test('a receipt that names nothing is not an empty set — it is a receipt this client refuses', () => {
  assert.equal(parseReceipt(null), undefined)
  assert.equal(parseReceipt({}), undefined)
  assert.equal(parseReceipt({ files: [] }), undefined)
  assert.equal(parseReceipt({ files: [{ key: 'a@1x1' }] }), undefined)
  // Every entry unshippable is the same thing: nothing to serve. Reported as "no set" rather than
  // as a set of size zero, which would make every sprite a silent hole.
  assert.equal(parseReceipt({ files: [{ key: 'a@1x1', path: 'a-1x1.png', shipped: false }] }), undefined)
})

test('the provenance originals a set counts but never copies are not resolvable', () => {
  const map = parseReceipt({
    files: [
      { key: 'tiles/x@256x128', path: 'tiles/x-256x128.png', shipped: true },
      { key: 'tiles/x-asdelivered@256x128', path: 'tiles/x-256x128-asdelivered.png', shipped: false },
    ],
  })
  assert.ok(map)
  assert.equal(map.size, 1)
  assert.equal(map.get('tiles/x'), 'tiles/x-256x128.png')
})

/* ── what the client does with a mount, without a DOM ───────────────────────────────────────── */

test('a mount that 404s is absent WITH a reason, and never an empty set', async () => {
  const realFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response('', { status: 404 })) as typeof fetch
  try {
    const set = await loadAssetSet('http://localhost/world-assets')
    assert.equal(set.state, 'absent')
    assert.match(set.state === 'absent' ? set.why : '', /404/)
  } finally {
    globalThis.fetch = realFetch
  }
})

test('a mounted set resolves an identity to the path the receipt gives it, and nothing else', async () => {
  const realFetch = globalThis.fetch
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        provider: 'flux-2-pro',
        files: [{ key: 'tiles/ashfield-ground-a@256x128', path: 'tiles/ashfield-ground-a-256x128.png' }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as typeof fetch
  try {
    const set = await loadAssetSet('http://localhost/world-assets')
    assert.equal(set.state, 'present')
    if (set.state !== 'present') return
    assert.equal(set.provider, 'flux-2-pro')
    assert.equal(
      set.urlOf('tiles/ashfield-ground-a'),
      'http://localhost/world-assets/tiles/ashfield-ground-a-256x128.png',
    )
    // The identity the client used to build a URL out of. It resolves to NOTHING, deliberately:
    // an unresolvable name must be a hole with a name rather than a request that 404s unseen.
    assert.equal(set.urlOf('tiles/ashfield-ground-a.png'), undefined)
    assert.equal(set.urlOf('tiles/ashfield-ground-z'), undefined)
  } finally {
    globalThis.fetch = realFetch
  }
})
