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
import { DEEP_LINK_PATH, NON_INDEX_PATHS, NAV, ROUTES, routeFor } from '../src/lib/routes.ts'

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
  const block = /location ~ \^\/\(([^)]+)\)\/\?\$/.exec(conf)
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
  assert.match(conf, /error_page 404 \/index\.html/, 'nginx.conf has no 404 error page')
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

test('/world-assets is served without a fallback, so a missing sprite 404s', () => {
  const conf = directives()
  const block = /location \/world-assets\/ \{([\s\S]*?)\n {4}\}/.exec(conf)
  assert.ok(block, 'nginx serves no /world-assets/ location')
  // A sprite request answered with index.html decodes as a corrupt PNG rather than as a 404, and
  // the client would report a decode failure for a file that simply is not there.
  assert.match(block[1] ?? '', /try_files \$uri =404/, '/world-assets/ falls back to the app shell')
})
