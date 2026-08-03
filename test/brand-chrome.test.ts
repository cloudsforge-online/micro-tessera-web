/**
 * The five files in `public/`, and the fact that they are Tessera's own rather than a stand-in.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THIS FILE WAS CITED BY index.html BEFORE IT EXISTED.
 *
 * The comment in index.html said "`test/brand-chrome.test.ts` holds the gate" while `public/` was
 * empty and this file was not written. That is the same defect the estate corrected roughly forty
 * times in one night: a citation that reads as verification and points at nothing. It was true of
 * the intention and false of the repository, which is the only kind of false that matters.
 *
 * ── AND THE EMPTY public/ WAS A BUILD DEFECT, not only a missing icon ─────────────────────────
 *
 * Git cannot store an empty directory. `public/` tracked ZERO files, so a clean checkout did not
 * have the directory at all, and `COPY public ./public` in the Dockerfile — line 41, the line
 * whose own comment explains that four frontends shipped images with no favicon because the
 * template omitted it — failed outright. The image built on the machine where it was authored and
 * nowhere else. Every other frontend in this estate tracks at least four files under `public/`.
 *
 * ── WHY NOT A .gitkeep ────────────────────────────────────────────────────────────────────────
 *
 * A `.gitkeep` would have made `COPY public ./public` succeed, which is the entire visible
 * symptom, and shipped an iconless bundle for the fourth time. §2.14's chrome set had already
 * been generated in micro-tessera-assets by the time this was fixed; there was a real answer on
 * disk, so the placeholder would have been chosen over it out of haste.
 *
 * ── WHAT IS ASSERTED, AND FROM WHERE ──────────────────────────────────────────────────────────
 *
 * `SHIPPED` below pins each file's sha256. Those digits are not a photograph of what happens to
 * be in `public/` — they were read out of `micro-tessera-assets/MANIFEST.json`, which records
 * every generated and derived byte in that repository. So the assertion has two independent
 * sides, which is the rule this repository's citations.test.ts states at length: the estate's
 * `/auth/exchange` defect survived because an assertion compared a URL with a copy of itself.
 *
 * That pin runs everywhere, including in CI, where the sibling asset repository is NOT checked
 * out. The last test in this file closes the loop when it IS checked out, by holding the pins
 * against the manifest they came from — so re-pinning a placeholder is a failure rather than a
 * quiet success. A missing sibling is `t.skip()`, never a `return`: six tests in this estate
 * `return`ed and therefore PASSED.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, type TestContext } from 'node:test'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = join(REPO, 'public')
const HTML = readFileSync(join(REPO, 'index.html'), 'utf8')

/** The asset repository this chrome was generated in. Absent in CI, and that is expected. */
const ASSETS = resolve(REPO, '..', 'tessera-assets')

interface Shipped {
  /** The name in `public/`, which is the estate's convention and not the asset repository's. */
  readonly file: string
  /** Where it came from, relative to micro-tessera-assets. */
  readonly source: string
  /** From micro-tessera-assets/MANIFEST.json. */
  readonly sha256: string
  readonly width: number
  readonly height: number
  /** True if index.html must carry a `<link href="/…">` to it. The og card is a `<meta>`. */
  readonly linked: boolean
}

/**
 * Set 14 of docs/ecosystem/23-tessera.md §2.14 — "title chrome (8: 2 generated, 6 derived)".
 *
 * Five of the eight ship. `chrome/mark` (1024×1024) is the source every one of these was cut from
 * and would be dead weight in the bundle; `chrome/capsule` and `chrome/wordmark-lockup` are store
 * and header art with nothing in this client to render them. Shipping a file nothing references is
 * the failure mode the second test below exists to catch, so they are not shipped.
 *
 * THE OG CARD IS `chrome/og-title` AND NOT `keyart/og-1200x630`. Both exist at 1200×630 and the
 * keyart card is a scene from the world, which would draw a better click. Set 14 is what §2.14
 * calls "title chrome"; its manifest note says it was composited at 1200×630 because that is "the
 * size a scraper rejects anything else for", so it was built to be this tag. The scene card is
 * marketing, and marketing is not this bundle's job. Recorded because it is a decision between two
 * correct-looking files, and the next reader will otherwise think the other one was overlooked.
 */
const SHIPPED: readonly Shipped[] = [
  {
    file: 'favicon-32x32.png',
    source: 'assets/chrome/favicon-32-32x32.png',
    sha256: '6dafb9aaef2bd5ec28d1601e54914885a95d64e7ca38caccdde53eb19df87269',
    width: 32,
    height: 32,
    linked: true,
  },
  {
    file: 'favicon-192x192.png',
    source: 'assets/chrome/favicon-192-192x192.png',
    sha256: '63dab0a48e2533663991cbb81978455b222084111b6363c9bc7e45725d9d922f',
    width: 192,
    height: 192,
    linked: true,
  },
  {
    file: 'favicon-512x512.png',
    source: 'assets/chrome/favicon-512-512x512.png',
    sha256: 'a7f26930f63ce3c07de995741a1c026221e907d4fc346d42a15f09f61941c5a5',
    width: 512,
    height: 512,
    linked: true,
  },
  {
    // The REAL 180, not an alias of the 192. Every other frontend here points apple-touch-icon at
    // /favicon-192x192.png because 180 was never generated for them; §2.14 generated one for this
    // title, so iOS is handed the size it actually asks for instead of resampling.
    file: 'apple-touch-icon-180x180.png',
    source: 'assets/chrome/apple-touch-180-180x180.png',
    sha256: 'c5b9675d16b81cbd3cc76f7c3771fe39b2889346c5bbda9c5ed72097d37ef40b',
    width: 180,
    height: 180,
    linked: true,
  },
  {
    file: 'og-1200x630.png',
    source: 'assets/chrome/og-title-1200x630.png',
    sha256: 'b2bca265702da59d3f77aae293eb1b3afcee4a57083f34eccf1fbdd5c67e89ff',
    width: 1200,
    height: 630,
    linked: false,
  },
]

const sha = (buf: Buffer): string => createHash('sha256').update(buf).digest('hex')

/**
 * A PNG's dimensions read from its IHDR chunk — the bytes, never the filename.
 *
 * `verify.py` in every asset repository in this estate reads dimensions off the bytes for exactly
 * this reason, and doc 23 §2.15 lists it first: a file named `og-1200x630.png` that is 512×512 is
 * a wrong file with a right name, and nothing about the name can tell you.
 */
function pngSize(buf: Buffer): { width: number; height: number } {
  assert.equal(
    buf.subarray(0, 8).toString('hex'),
    '89504e470d0a1a0a',
    'not a PNG — the signature is wrong',
  )
  assert.equal(buf.subarray(12, 16).toString('ascii'), 'IHDR', 'the first chunk is not IHDR')
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

test('public/ tracks the chrome, so a clean checkout can build the image', () => {
  // The defect this file was written for. `git ls-files public/` returned NOTHING, git does not
  // store an empty directory, and Dockerfile:41 `COPY public ./public` therefore failed on every
  // machine except the one that authored it.
  const missing = SHIPPED.filter((a) => !existsSync(join(PUBLIC, a.file))).map((a) => a.file)
  assert.deepEqual(
    missing,
    [],
    `public/ is missing ${missing.join(', ')} — copy them from micro-tessera-assets/assets/chrome/`,
  )
})

test('public/ holds the declared set and nothing else', () => {
  // The other direction, and the one that catches a placeholder surviving. A `.gitkeep`, a stray
  // `favicon.ico`, or the estate's generic company chrome copied in beside the real files would
  // all pass every other test in this file.
  const found = readdirSync(PUBLIC).filter((f) => f !== '.DS_Store').sort()
  assert.deepEqual(
    found,
    SHIPPED.map((a) => a.file).sort(),
    'public/ holds files this repository does not declare. Vite copies public/ verbatim into ' +
      'dist/, so anything in here ships.',
  )
})

test('every shipped file is the byte micro-tessera-assets recorded', () => {
  for (const asset of SHIPPED) {
    const bytes = readFileSync(join(PUBLIC, asset.file))
    assert.equal(
      sha(bytes),
      asset.sha256,
      `public/${asset.file} is not the file micro-tessera-assets recorded as ${asset.source}. ` +
        'If the art changed, re-copy it and re-pin from that repository MANIFEST.json — do not ' +
        'pin whatever happens to be here.',
    )
  }
})

test('every shipped file is the size its name claims, measured off the bytes', () => {
  for (const asset of SHIPPED) {
    const { width, height } = pngSize(readFileSync(join(PUBLIC, asset.file)))
    assert.deepEqual(
      { width, height },
      { width: asset.width, height: asset.height },
      `public/${asset.file} is ${width}x${height}`,
    )
  }
})

test('index.html links every icon it ships, and ships every icon it links', () => {
  // Both directions, because the one-way version is how a placeholder ships. A link to a file that
  // is not there is a 404 in every tab; a file nobody links is dead weight that looks like it is
  // working.
  for (const asset of SHIPPED.filter((a) => a.linked)) {
    assert.match(
      HTML,
      new RegExp(`href="/${asset.file.replace(/\./g, '\\.')}"`),
      `index.html does not link /${asset.file}`,
    )
  }
  // Everything index.html points at with a root-relative href must exist. Written against `href`
  // generally rather than against `favicon*` so the apple-touch icon — which is not named
  // favicon-anything — is inside the rule instead of beside it.
  const hrefs = [...HTML.matchAll(/href="\/([^"]+)"/g)].map((m) => m[1] as string)
  assert.ok(hrefs.length >= 4, `index.html declares only ${hrefs.length} root-relative hrefs`)
  for (const href of hrefs) {
    assert.ok(existsSync(join(PUBLIC, href)), `index.html links /${href}, which is not in public/`)
  }
})

test('index.html declares an og:image, and it is a file that ships', () => {
  const og = /property="og:image"\s+content="\/([^"]+)"/.exec(HTML)
  assert.ok(og, 'index.html declares no og:image, so a shared link renders as a bare URL')
  // Relative on purpose: one bundle serves localhost, preview and the apex, and this file names no
  // hostname. A crawler resolves it against the page it fetched.
  assert.ok(existsSync(join(PUBLIC, og[1] as string)), `og:image is /${og[1]}, not in public/`)
})

test('the Dockerfile copies public/, so the icons reach the artefact and not only the repo', () => {
  // micro-web-template's Dockerfile copied tsconfig, vite.config, index.html and src — and not
  // public — so four frontends built images whose dist/ had no favicon in it while their own brand
  // tests passed against the SOURCE tree. The repository and the artefact disagreed and nothing
  // said so. This repository's Dockerfile has the line; this pins it.
  const dockerfile = readFileSync(join(REPO, 'Dockerfile'), 'utf8')
  assert.match(
    dockerfile,
    /^COPY public \.\/public$/m,
    'the Dockerfile does not copy public/, so the built image will have no favicon',
  )
})

test('the pinned digests are still what micro-tessera-assets records', (t: TestContext) => {
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // THE SECOND SIDE OF THE ASSERTION, and the reason the pins above are evidence rather than a
  // photograph. Without this, somebody could drop a placeholder into public/ and re-pin its sha,
  // and every test above would go green.
  //
  // Skipped rather than returned when the sibling is absent — which is the normal case in CI,
  // where web-ci.yml checks out this repository and micro-ui and nothing else. `t.skip()` marks it
  // skipped in the runner's output; `return` marks it PASSED, and six tests in this estate did
  // exactly that.
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  const manifestPath = join(ASSETS, 'MANIFEST.json')
  if (!existsSync(manifestPath)) {
    t.skip(`${manifestPath} is not checked out — this assertion cannot run`)
    return
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    assets: { path: string; sha256: string; deliveredSize: string }[]
  }
  for (const asset of SHIPPED) {
    const recorded = manifest.assets.find((a) => a.path === asset.source)
    assert.ok(recorded, `micro-tessera-assets records nothing at ${asset.source}`)
    assert.equal(
      recorded.sha256,
      asset.sha256,
      `${asset.source} has changed in micro-tessera-assets; public/${asset.file} is a stale copy`,
    )
    assert.equal(
      recorded.deliveredSize,
      `${asset.width}x${asset.height}`,
      `${asset.source} is recorded as ${recorded.deliveredSize}`,
    )
  }
})
