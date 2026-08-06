/**
 * Every route this client calls, resolved against `micro-tessera`'s actual source.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THIS IS THE TEST THAT WOULD HAVE CAUGHT `/auth/exchange`.
 *
 * `@cloudsforge/ui` posted the SSO callback to `/auth/exchange`, a route `micro-identity` has
 * never served — and the test pinning it compared the URL with a copy of itself, so it could
 * never have failed. The defect survived because the assertion's two sides came from the same
 * place.
 *
 * Here they do not. One side is `ROUTE_ANCHORS` in `src/lib/tessera.ts`; the other is the bytes of
 * `../tessera/src/server.ts` on disk. `@cloudsforge/ui/cite` requires an anchor to match EXACTLY
 * ONE line — zero throws, two throws and names both — so an anchor cannot drift into matching
 * something it does not mean, and cannot match nothing while reading as verified.
 *
 * ── A missing sibling is a SKIP, and never a `return` ─────────────────────────────────────────
 *
 * Six tests in this estate tonight `return`ed instead of skipping and therefore PASSED. `t.skip()`
 * marks the test skipped in the runner's output; `return` marks it green. The difference is the
 * whole reliability of this file when it runs somewhere `../tessera` is not checked out.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, type TestContext } from 'node:test'
import { cite } from '@cloudsforge/ui/cite'
import { MISSING_ROUTES, ROUTE_ANCHORS } from '../src/lib/tessera.ts'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const SERVER = resolve(REPO, '..', 'tessera', 'src', 'server.ts')

test('every route this client calls is served by micro-tessera', (t: TestContext) => {
  if (!existsSync(SERVER)) {
    t.skip(`${SERVER} is not checked out — this assertion cannot run`)
    return
  }
  assert.ok(ROUTE_ANCHORS.length > 0, 'no routes are pinned, so this test asserts nothing')
  for (const anchor of ROUTE_ANCHORS) {
    // Throws on zero matches and on two. A route renamed or deleted in the service turns this
    // repository red, which is exactly the moment this client would start calling nothing.
    const found = cite(SERVER, anchor)
    assert.match(found.text, /define\(/, `${anchor} matched a line that is not a route definition`)
  }
})

test('every route this client calls is also imported by lib/tessera.ts as a function', () => {
  // The converse direction: an anchor that names a route no function calls is a pin on something
  // this client does not use, which reads as coverage and is not.
  const source = readFileSync(join(REPO, 'src', 'lib', 'tessera.ts'), 'utf8')
  for (const anchor of ROUTE_ANCHORS) {
    const path = /'(\/v1[^']*)'/.exec(anchor)?.[1]
    assert.ok(path, `${anchor} does not name a path`)
    // `:id` in the service's pattern is a template hole here, so the fixed prefix is what is
    // compared. `/v1/parcels/:id/bank` → `/v1/parcels/`.
    const prefix = path.split('/:')[0] as string
    assert.ok(
      source.includes(`'${path}'`) ||
        source.includes(`\`${prefix}`) ||
        source.includes(`'${prefix}`),
      `${path} is pinned but no function in lib/tessera.ts calls it`,
    )
  }
})

test('the routes recorded as missing are still missing', (t: TestContext) => {
  if (!existsSync(SERVER)) {
    t.skip(`${SERVER} is not checked out — this assertion cannot run`)
    return
  }
  const source = readFileSync(SERVER, 'utf8')
  assert.ok(MISSING_ROUTES.length > 0, 'MISSING_ROUTES is empty, so this test asserts nothing')

  // ══════════════════════════════════════════════════════════════════════════════════════════
  // A gap recorded as DATA rather than as a TODO comment, so it fails in both directions: this
  // test goes red when the route lands (and names the screen waiting on it), and the screens'
  // own tests go red if one starts calling a route that was never there. A comment would do
  // neither.
  // ══════════════════════════════════════════════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════════════════════════════════
  // THE BALANCES ENTRY IS GONE FROM `MISSING_ROUTES` AND THIS IS WHY, ASSERTED RATHER THAN SAID.
  //
  // It was here, it went red when micro-tessera grew the route, and the fix was to WIRE IT UP —
  // which is what the red was for. The risk in deleting an entry is that the deletion is the whole
  // change: the gap stops being recorded and nothing starts calling the route, so the screen is
  // exactly as empty as before with nothing left to notice. So the entry's removal is held down
  // from both sides — the route must be served, and this client must call it.
  // ══════════════════════════════════════════════════════════════════════════════════════════
  assert.equal(
    MISSING_ROUTES.find((r) => r.want.includes('/v1/me/balances')),
    undefined,
    'GET /v1/me/balances is served by micro-tessera and must not be recorded as missing',
  )
  assert.match(source, /'\/v1\/me\/balances'/, 'micro-tessera no longer serves GET /v1/me/balances')
  assert.ok(
    ROUTE_ANCHORS.some((a) => a.includes('/v1/me/balances')),
    'the balances route is served and this client pins no anchor to it',
  )

  assert.doesNotMatch(
    source,
    /'\/v1\/wards\/:id\/terrain'/,
    'micro-tessera now serves ward terrain. src/render/terrain.ts is a client-side stand-in and ' +
      'should now be a call to it.',
  )
})

/**
 * TypeScript source with its comments removed.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE THIRD TIME TONIGHT, IN THIS REPOSITORY ALONE, THAT A SCAN MATCHED ITS OWN DOCUMENTATION.
 *
 * The first was the nginx rule below in `routes.test.ts`, which found `try_files $uri
 * /index.html` in the paragraph explaining why it is forbidden. The second was this one:
 * `src/lib/hosts.ts` says "there is no code path anywhere in this bundle that can name
 * `candidates/qwen-image-2512/`" — and the scan found that sentence and reported the defect.
 *
 * Both would have been "fixed" by adding an exception for the file, which is how a rule stops
 * covering the file it was written for. The actual fix is that a rule about CODE must read code.
 *
 * The stripper is deliberately crude — it does not understand a `/` inside a regex literal or a
 * string. That is safe in the direction that matters here: over-stripping can only REMOVE text
 * from the haystack, which can only make this assertion miss something, and every path it could
 * miss is one that would also be caught by the string it is trying to build being unusable. It
 * would not be safe for a rule that asserted presence, and one should not reuse this for that.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

test('no source file in this bundle can name an asset provider', () => {
  // `materialise.py` writes bytes under paths identical in every provider's manifest, so this
  // client consumes a stable path and never encodes a provider. A bundle that could say a
  // provider directory would pin an experiment into every placement the world stores.
  //
  // Scanned across src/, not asserted about one file, because the rule is about the bundle.
  const files = walk(join(REPO, 'src'))
  assert.ok(files.length > 10, `only ${files.length} source files were scanned — walk() is broken`)
  for (const file of files) {
    assert.doesNotMatch(
      code(file),
      /candidates\/[a-z0-9-]+\//,
      `${file} names a provider directory; assets resolve by identity under a stable path`,
    )
  }
})

test('the provider scan can still fail — proven, not assumed', () => {
  // ══════════════════════════════════════════════════════════════════════════════════════════
  // The check above is an ABSENCE, and an absence that cannot fail is the estate's most common
  // defect: a CI rule found INVERTED tonight, six tests that `return`ed instead of skipping, a
  // grep that skipped files with NUL bytes. So the stripper is driven against a line that is
  // real code and must be caught, and against the same text in a comment which must not be.
  // ══════════════════════════════════════════════════════════════════════════════════════════
  const stripper = (text: string): string =>
    text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  assert.match(
    stripper("const p = 'candidates/qwen-image-2512/assets/x.png'"),
    /candidates\/[a-z0-9-]+\//,
    'the scan would not catch a provider path written as real code',
  )
  assert.doesNotMatch(
    stripper('// never name candidates/qwen-image-2512/ here\nconst p = 1'),
    /candidates\/[a-z0-9-]+\//,
    'the scan still matches its own documentation',
  )
  assert.doesNotMatch(
    stripper('/**\n * candidates/qwen-image-2512/ is forbidden.\n */\nconst p = 1'),
    /candidates\/[a-z0-9-]+\//,
    'the scan still matches a block comment',
  )
})

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/**
 * NO CITATION IN THIS REPOSITORY MAY CARRY A LINE NUMBER.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * The route anchors above are already the right shape — `cite()` finds a line by SEARCHING for
 * text that must match exactly once, so micro-tessera can move a route without breaking anything
 * here. The prose was not. Twenty-five sentences in this bundle named a position in a file another
 * repository owns and is free to edit: `tessera/src/server.ts` at a line, `identity/src/users.ts`
 * at a line, `lantern/src/rum.ts` at a line.
 *
 * That is a promise this repository cannot keep. When micro-identity gained email verification and
 * password reset, `/auth/me` moved and every citation to it across the estate went stale at once,
 * while nothing in any client was wrong. Nothing runs a frontend's suite when a service changes,
 * so it surfaces during a release rather than at the edit — seven of nineteen CI failures in one
 * day were this single shape.
 *
 * So the rule is enforced rather than described. Cite the FILE; if a reader needs the exact place,
 * name the SYMBOL — `authenticate(ctx, deps)`, `parseAmount`, `RUM_KINDS` — which moves with the
 * code instead of going stale under it.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
test('no citation in this repository names a line number', () => {
  const roots = ['src', 'test', '.github']
  const files: string[] = []
  const collect = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) collect(full)
      else if (/\.(tsx?|css|ya?ml|md|html|sh)$/.test(entry)) files.push(full)
    }
  }
  for (const root of roots) collect(join(REPO, root))
  for (const loose of ['README.md', 'index.html', 'nginx.conf', 'vite.config.ts']) {
    if (existsSync(join(REPO, loose))) files.push(join(REPO, loose))
  }
  // Guards the sweep itself: a walker that silently found nothing would read as a guarantee.
  assert.ok(files.length > 30, `only ${files.length} files were swept — the walker is broken`)

  const cited = new RegExp(
    // a repository-relative path, then a colon and a line (or a range) stuck to it
    String.raw`\b(?:[a-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.(?:ts|tsx|css|ya?ml|md|sh|py|sol)` + ':\\d',
  )
  const offenders = files
    .filter((f) => cited.test(readFileSync(f, 'utf8')))
    .map((f) => `${f.slice(REPO.length + 1)} cites a line — cite the file, or name the symbol`)
  assert.deepEqual(offenders, [])
})
