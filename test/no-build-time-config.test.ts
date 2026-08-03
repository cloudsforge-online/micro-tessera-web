/**
 * One image serves every environment, or the release manifest stops meaning anything.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THIS FILE WAS CITED BY vite.config.ts BEFORE IT EXISTED — "`test/no-build-time-config.test.ts`
 * fails the suite if `import.meta.env.VITE_` ever reappears". It did not exist, so nothing failed.
 * The property was real and enforced only by micro-org's `web-ci.yml` `runtime-hosts` job, which
 * this repository did not call until today and which cannot run at all while Actions is
 * billing-blocked. A guard that exists in one unreachable place, cited from a second place as
 * though it were local, is the shape this estate corrected roughly forty times in one night.
 *
 * micro-web-template already treats these as a PAIR and says why: its CI step is "the same rule as
 * test/no-build-time-config.test.ts, checked again here so it fails even if somebody deletes the
 * test along with the line it forbids". This repository had the CI half and not the local half.
 *
 * ── WHAT IS AT STAKE ──────────────────────────────────────────────────────────────────────────
 *
 * Vite INLINES `import.meta.env.VITE_*` at build time, so the bundle carries its environment. Then
 * one image can no longer serve local, staging and production; the release manifest cannot pin one
 * image per frontend, because there is no longer one image; and promotion from staging stops being
 * promotion and becomes a rebuild — which means the artefact that reaches production is not the
 * artefact that passed CI. Every host this bundle talks to is resolved at RUNTIME from
 * `window.location` by src/lib/hosts.ts.
 *
 * ── AND THE SCAN READS CODE, NOT PROSE ────────────────────────────────────────────────────────
 *
 * THREE TIMES IN THIS REPOSITORY a scan has matched its own documentation: the nginx rule in
 * routes.test.ts found `try_files $uri /index.html` in the paragraph forbidding it; the provider
 * scan in citations.test.ts found the sentence saying a provider must never be named; and this one
 * would have found `import.meta.env.VITE_` inside vite.config.ts's own explanation of why it is
 * banned. Each would have been "fixed" by excepting the file, which is how a rule stops covering
 * the file it was written for. Comments are stripped, and the last test drives the stripper against
 * a line of real code that MUST be caught and the same text in a comment that must not be.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Anything that would bake an environment into the bundle. */
const FORBIDDEN = /import\.meta\.env|(?<![A-Za-z0-9_])VITE_[A-Z0-9_]+/

/** TypeScript and JavaScript source with comments removed. */
const stripTs = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** HTML with its comments removed. index.html's chrome block is several paragraphs of them. */
const stripHtml = (text: string): string => text.replace(/<!--[\s\S]*?-->/g, '')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

test('no source file reads a build-time environment variable', () => {
  const files = walk(join(REPO, 'src'))
  // Asserted, because a walk that silently returns nothing is a scan that passes over an empty
  // haystack — and reads exactly like a clean repository.
  assert.ok(files.length > 10, `only ${files.length} source files were scanned — walk() is broken`)
  for (const file of files) {
    assert.doesNotMatch(
      stripTs(readFileSync(file, 'utf8')),
      FORBIDDEN,
      `${file} reads a build-time environment variable. Vite inlines it, so the bundle carries ` +
        'its environment and one image can no longer serve every environment. Resolve hosts at ' +
        'runtime through cloudsforgeHosts() in src/lib/hosts.ts.',
    )
  }
})

test('the build configuration defines no environment either', () => {
  // The same property from the other side. `define`, `envPrefix` or a `.env` file would inline a
  // value just as effectively as reading `import.meta.env` does, and is harder to spot in review.
  const vite = stripTs(readFileSync(join(REPO, 'vite.config.ts'), 'utf8'))
  assert.doesNotMatch(vite, FORBIDDEN, 'vite.config.ts names a build-time environment variable')
  assert.doesNotMatch(vite, /\bdefine\s*:/, 'vite.config.ts declares `define`, which inlines a constant')
  assert.doesNotMatch(vite, /\benvPrefix\b/, 'vite.config.ts declares `envPrefix`')
  assert.deepEqual(
    readdirSync(REPO).filter((f) => f === '.env' || f.startsWith('.env.')),
    [],
    'this repository has a .env file; nothing in this bundle may read one',
  )
})

test('the entry document carries no environment either', () => {
  assert.doesNotMatch(
    stripHtml(readFileSync(join(REPO, 'index.html'), 'utf8')),
    FORBIDDEN,
    'index.html names a build-time environment variable',
  )
  // `cf-release` is the one thing the Dockerfile stamps in, and it is an IDENTITY rather than a
  // configuration: it names the artefact, it does not tell it where it is running. Asserted so the
  // distinction is held rather than assumed — if this tag ever disappeared, an error report would
  // stop naming the deploy that produced it.
  const html = readFileSync(join(REPO, 'index.html'), 'utf8')
  assert.match(html, /name="cf-release"/, 'index.html no longer carries the release identity')
})

/**
 * The forbidden expression, ASSEMBLED rather than written out — and the reason is the fourth
 * instance in this repository of a scan matching text that was never code.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * micro-org's `web-ci.yml` runs a `runtime-hosts` job that greps the WHOLE REPOSITORY for
 * `import.meta.env.VITE_[A-Z0-9_]+`, excluding only `*.md` and `.github/workflows/*`. Test files
 * are in scope. So a fixture spelling the expression out — which is the only way to prove the
 * scanner below can actually fail — would turn the estate's own CI red on this repository, over a
 * string that exists to demonstrate that the string is banned.
 *
 * FOUND BY REPRODUCING THE WORKFLOW LOCALLY, not by reading it: the grep printed four lines of
 * this file and one of test/red.sh. It is the same defect this repository has now hit three times
 * from the inside — the nginx rule finding its own rationale, the provider scan finding the
 * sentence forbidding providers, and this scanner finding vite.config.ts's explanation.
 *
 * There were two ways to answer it and one is worse than the problem. Excepting `test/` in
 * web-ci.yml would weaken a rule for all fourteen frontends so that one repository's fixture could
 * stay literal — the guard being loosened by the first repository it inconveniences, which is how
 * §3.3e happened. Assembling the string costs one line and weakens nothing: the value handed to
 * the scanner is byte-identical, and no line of this file contains it.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
const META_ENV = ['import', 'meta', 'env'].join('.')

test('the scan can still fail — proven, not assumed', () => {
  // An ABSENCE that cannot fail is this estate's most common defect: a CI rule found INVERTED, six
  // tests that `return`ed instead of skipping, a grep that skipped files with NUL bytes. So the
  // stripper is driven against a line that is real code and MUST be caught, and against the same
  // text in a comment, which must not be.
  assert.match(
    stripTs(`const base = ${META_ENV}.VITE_API_URL`),
    FORBIDDEN,
    'the scan would not catch a build-time variable written as real code',
  )
  assert.match(stripTs('const k = VITE_API_URL'), FORBIDDEN, 'the scan misses a bare VITE_ name')
  assert.doesNotMatch(
    stripTs(`// never write ${META_ENV}.VITE_API_URL here\nconst p = 1`),
    FORBIDDEN,
    'the scan still matches its own documentation',
  )
  assert.doesNotMatch(
    stripTs(`/**\n * \`${META_ENV}.VITE_X\` is forbidden.\n */\nconst p = 1`),
    FORBIDDEN,
    'the scan still matches a block comment',
  )
  assert.doesNotMatch(
    stripHtml(`<!--\n  ${META_ENV}.VITE_X is forbidden.\n-->\n<html></html>`),
    FORBIDDEN,
    'the HTML scan still matches an HTML comment',
  )
  // And it must not fire on a name that merely ends in something VITE_-shaped, which is what the
  // lookbehind is for. `INVITE_CODE` is not a Vite variable.
  assert.doesNotMatch(stripTs('const INVITE_CODE = 1'), FORBIDDEN, 'the scan fires on INVITE_CODE')
})

test('this file does not contain the expression it forbids', () => {
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // The guard on the workaround, because an assembled constant is exactly the kind of care that
  // gets undone by the next person simplifying a fixture back to a literal. web-ci.yml's grep
  // would then fail this repository, and the failure would name a test file rather than a defect.
  //
  // The pattern is micro-org web-ci.yml's, transcribed — and it is applied to the RAW bytes of this
  // file, comments included, because that is what `git grep` sees.
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  const estateScan = /import\.meta\.env\.VITE_[A-Z0-9_]+/
  for (const file of ['test/no-build-time-config.test.ts', 'test/red.sh']) {
    assert.doesNotMatch(
      readFileSync(join(REPO, file), 'utf8'),
      estateScan,
      `${file} spells out the expression micro-org's web-ci.yml greps the whole repository for, ` +
        "so the estate's own CI would fail this repository over a test fixture. Assemble it.",
    )
  }
  // And the scan being guarded against must really match the literal form, or the two tests above
  // are agreeing about nothing.
  assert.match(`${META_ENV}.VITE_API_URL`, estateScan, 'the transcribed estate pattern is wrong')
})
