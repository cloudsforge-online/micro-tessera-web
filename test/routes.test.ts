/**
 * The three places a route is declared, held against each other.
 *
 * `src/lib/routes.ts` is the source. `src/app.tsx` is the router. `nginx.conf` is what production
 * actually serves. A route in two of the three works perfectly under `pnpm dev` and 404s on the
 * first hard refresh in production — a failure nothing about the diff looks like.
 *
 * Read off disk rather than imported, for nginx and the router alike: the router's table is JSX
 * and the nginx block is not JavaScript at all, so the only way to compare them is to read them.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { BASE, DEEP_LINK_PATH, NAV, NON_INDEX_PATHS, ROUTES, routeFor } from '../src/lib/routes.ts'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (name: string): string => readFileSync(join(REPO, name), 'utf8')

/**
 * nginx.conf with its comments removed.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THIS FUNCTION EXISTS BECAUSE THE FIRST VERSION OF THE `try_files $uri /index.html` TEST WENT RED
 * AGAINST A CONFIG THAT DOES NOT DO IT.
 *
 * The header of nginx.conf explains the rule by QUOTING the forbidden directive — "The usual SPA
 * fallback is `try_files $uri /index.html`, which serves the bundle with a 200 for every address
 * in existence". A grep over the raw file found the explanation and reported the defect.
 *
 * That is the same shape as a CI rule this estate found INVERTED tonight, reporting a live
 * invariant missing. A rule that scans configuration must scan the CONFIGURATION, and a config
 * that documents itself is the normal case rather than the odd one — so the strip happens here,
 * once, and every directive assertion below goes through it.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
const directives = (): string =>
  read('nginx.conf')
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')

test('nginx enumerates exactly the non-index routes', () => {
  const conf = directives()
  // The enumerated block is mounted since wave 3f — `^/worlds/tessera/(wards|land|…)/?$`. The
  // capture inside it is still the ROUTER paths, which is what NON_INDEX_PATHS holds, so only the
  // prefix in front of the group moves.
  const block = new RegExp(`location ~ \\^${BASE}/\\(([^)]+)\\)/\\?\\$`).exec(conf)
  assert.ok(block, 'nginx.conf has no enumerated route block')
  const listed = (block[1] ?? '').split('|').sort()
  assert.deepEqual(
    listed,
    [...NON_INDEX_PATHS].sort(),
    'nginx and src/lib/routes.ts disagree about which addresses exist',
  )
})

test('nginx never falls back with try_files $uri /index.html', () => {
  const conf = directives()
  // ════════════════════════════════════════════════════════════════════════════════════════════
  // The estate rule, and the reason: `try_files $uri /index.html` serves the bundle with a 200
  // for every address in existence, so search engines index the error screen, uptime checks call
  // it healthy, and a deploy that drops a route looks exactly like a deploy that did not.
  // `error_page 404 /index.html` serves the same bundle while KEEPING the 404.
  // ════════════════════════════════════════════════════════════════════════════════════════════
  assert.doesNotMatch(
    conf,
    /try_files\s+\$uri\s+\/index\.html/,
    'nginx.conf falls back to index.html for unknown addresses, which answers 200 for everything',
  )
  assert.match(conf, /error_page 404 \/worlds\/tessera\/index\.html/, 'nginx.conf has no 404 error page')
})

test('the route regex anchors on /?$ and is not a prefix', () => {
  // `(/|$)` is a PREFIX and served the shell with a 200 for every address BENEATH an owned route.
  // The same defect was in micro-web-template and every frontend cut from it.
  const conf = directives()
  assert.doesNotMatch(conf, /location ~ \^\/\([^)]+\)\(\/\|\$\)/, 'the route block is a prefix match')
})

test('the router mounts every declared route, and nothing else', () => {
  const app = read('src/app.tsx')
  for (const route of ROUTES) {
    if (route.path === '/') {
      assert.match(app, /<Route index/, 'the index route is not mounted')
      continue
    }
    assert.ok(
      app.includes(`path="${route.path}"`),
      `${route.path} is declared in routes.ts and not mounted in app.tsx`,
    )
  }
  // And the converse: every `path="/…"` in the router is a declared route. Without this the check
  // above is one-directional, and a route mounted in the router but absent from routes.ts would
  // never reach nginx.
  for (const match of app.matchAll(/path="(\/[^"]*)"/g)) {
    const path = match[1] as string
    assert.ok(routeFor(path), `${path} is mounted in app.tsx and not declared in routes.ts`)
  }
})

test('the nav is derived, never a second list', () => {
  assert.deepEqual(
    NAV.map((r) => r.path),
    ROUTES.filter((r) => r.nav !== null).map((r) => r.path),
  )
})

test('the CI deep-link path is a real route that needs no session', () => {
  const route = routeFor(DEEP_LINK_PATH)
  assert.ok(route, `${DEEP_LINK_PATH} is not a route`)
  // The image probe has no token. A protected deep link would 200 at nginx and then render a
  // sign-in prompt, which the probe cannot tell from a working page.
  assert.equal(route.protected, false, `${DEEP_LINK_PATH} requires a session; the probe has none`)
})

test('CI deep-links to the path this repository declares, not one somebody typed', () => {
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // THE FOURTH PLACE A ROUTE IS DECLARED, and the one that had nothing holding it.
  //
  // `DEEP_LINK_PATH` existed and was tested before any workflow used it, so the test above proved
  // the constant was a valid route and NOTHING proved CI was passing that route. The value in
  // .github/workflows/ci.yml is a YAML string: it cannot import this constant, and a workflow that
  // deep-links to a path this file later stops declaring goes red with a message about nginx —
  // pointing at the wrong file.
  //
  // The brief that asked for this workflow said `/wards`. That would have passed: it is in
  // nginx.conf's enumerated block and it is unprotected. It is not what this repository declares,
  // and a value that works while disagreeing with the source is the exact defect this file exists
  // to catch — three declarations of a route that agree by luck rather than by construction.
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  const workflow = read('.github/workflows/ci.yml')
  // Comments stripped first, for the third time in this repository: the file argues for the value
  // in prose above the value, naming `/wards` as the rejected alternative. An unstripped scan finds
  // the rationale and grades it.
  const yaml = workflow
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')
  const declared = /^\s*deep-link-path:\s*(\S+)\s*$/m.exec(yaml)
  assert.ok(declared, '.github/workflows/ci.yml passes no deep-link-path')
  assert.equal(
    declared[1],
    DEEP_LINK_PATH,
    'the workflow deep-links to a path src/lib/routes.ts does not declare as DEEP_LINK_PATH',
  )
})

test('CI names the app micro-deploy builds, and calls the estate workflow rather than a copy', () => {
  // `app:` is web-ci.yml's one REQUIRED input and it names the image. micro-deploy builds this
  // repository as the `tessera-web` service and routes to `http://tessera-web:8080`; a CI tag that
  // said anything else would be a second name for one artefact.
  const yaml = read('.github/workflows/ci.yml')
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')
  assert.match(yaml, /^\s*app:\s*tessera-web\s*$/m, 'the workflow does not build tessera-web')
  assert.match(
    yaml,
    /uses:\s*cloudsforge-online\/micro-org\/\.github\/workflows\/web-ci\.yml@main/,
    'this repository has gone back to a bespoke copy of the estate CI',
  )
  // Without a contents:read token the micro-ui checkout 404s, `link:` installs as a dangling
  // symlink, and Typecheck fails on the first @cloudsforge/ui import — with no clue as to why.
  assert.match(
    yaml,
    /estate_token:\s*\$\{\{\s*secrets\.ESTATE_READ_TOKEN\s*\}\}/,
    'the workflow passes no estate token, so the private micro-ui checkout will 404',
  )
})

test('/world-assets is served without a fallback, so a missing sprite 404s', () => {
  const conf = directives()
  // MOUNTED since wave 3f: `/world-assets/` at the apex root is micro-site's address and would
  // never reach this container, so the URL carries the mount and nginx `alias`es it back onto the
  // volume — the bytes did not move, only the address did.
  const block = new RegExp(`location ${BASE}/world-assets/ \\{([\\s\\S]*?)\\n {4}\\}`).exec(conf)
  assert.ok(block, `nginx serves no ${BASE}/world-assets/ location`)
  // A sprite request answered with index.html decodes as a corrupt PNG rather than as a 404, and
  // the client would report a decode failure for a file that simply is not there.
  assert.match(block[1] ?? '', /try_files \$uri =404/, '/world-assets/ falls back to the app shell')
})
