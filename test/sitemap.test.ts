/**
 * The sitemap and robots.txt nginx serves for this surface.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THE BODIES ARE IN nginx.conf AT ALL
 *
 * A sitemap must carry ABSOLUTE URLs — the spec requires it and a crawler discards a relative
 * `<loc>` — and nothing built in this repository may name a hostname, because one image is served
 * from localhost, from a preview deployment and from the apex. `test/no-build-time-config.test.ts`
 * is that rule; this is the one document that cannot obey it and be useful at the same time.
 *
 * nginx is the component that can. It has `$host` on every request, so the addresses are composed
 * per request and the artefact stays environment-free.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * AND WHY THIS SURFACE DOES NOT USE `sitemapXml()` FROM THE DESIGN SYSTEM
 *
 * THE SHARED GENERATOR IS FOR THE APEX. It composes each sibling surface as `<subdomain>.$host`,
 * which is right on the marketing site, where `$host` IS the apex. Here `$host` is already
 * `tessera.<apex>`, so the same call would emit `worlds.tessera.<apex>` — the two-label shape
 * `@cloudsforge/ui/surfaces.ts` records at length as unreachable, because the edge's Universal SSL
 * is a one-label wildcard and every two-label name fails the handshake.
 *
 * So this surface publishes ITS OWN public routes, derived from the same `ROUTES` table the
 * navigation, the router and nginx's enumerated locations all come from — and `robots.txt`, which
 * has no such problem, IS generated from the design system and compared byte for byte.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * AND WHY EITHER NEEDS A TEST
 *
 * A body pasted into a config file is a copy, and this estate has been bitten by exactly one of
 * those: `site/index.html`'s title drifted from its application's, the suite stayed green, and
 * every search result carried a sentence the owner had asked to have removed until somebody opened
 * the served HTML rather than the page. The block is therefore treated as GENERATED OUTPUT that
 * happens to live in a config file.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { ENV_LABELS } from '@cloudsforge/ui'
import { BASE, ROUTES, SITEMAP_PATHS, publicPath } from '../src/lib/routes.ts'

const nginx = readFileSync(new URL('../nginx.conf', import.meta.url), 'utf8')

/** The single-quoted body of a `return 200 '…';` inside an exact-match location. */
function servedBody(path: string): string {
  const block = new RegExp(`location = ${path.replace('.', '\\.')} \\{([\\s\\S]*?)\\n    \\}`).exec(
    nginx,
  )
  assert.ok(block, `nginx.conf has no exact-match location for ${path}`)
  // Anchored to a `return` at the start of its own line: `/robots.txt` also carries a CONDITIONAL
  // `if ($cf_env) { return 200 '…'; }` above it, and a regex that took the first match would read
  // the non-mainnet body and report the mainnet one as drifted.
  const body = /\n {8}return 200 '([\s\S]*?)';/.exec(block[1] ?? '')
  assert.ok(body, `the ${path} location does not return an unconditional literal body`)
  return body[1] ?? ''
}

describe('the sitemap nginx serves', () => {
  it('names no hostname — every address is composed from $host', () => {
    /*
     * THE ASSERTION THAT KEEPS THE ARTEFACT ENVIRONMENT-FREE, and the reason a document with
     * absolute URLs in it is allowed here at all. A single literal apex would make the image wrong
     * on a preview deployment and on testnet, silently, in the one document a crawler treats as
     * authoritative.
     */
    const xml = servedBody('/worlds/tessera/sitemap.xml')
    assert.ok(!xml.includes('cloudsforge.online'), 'the sitemap names the production apex')
    assert.ok(!xml.includes('localhost'), 'the sitemap names localhost')
    const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1] ?? '')
    assert.ok(locs.length > 0, 'the sitemap lists nothing at all')
    for (const loc of locs) {
      // No subdomain is composed here, unlike the apex's sitemap: `$host` IS this surface.
      assert.match(loc, /^\$scheme:\/\/\$host(\/|$)/, `a <loc> is not composed: ${loc}`)
    }
  })

  it('lists every public route this surface offers, so a crawler is not left to guess', () => {
    const xml = servedBody('/worlds/tessera/sitemap.xml')
    for (const path of SITEMAP_PATHS) {
      // `publicPath()`, the same crossing the app uses: every `<loc>` carries the mount now, and
      // the index is the mount itself rather than a bare host — a trailing slash is the classic way
      // one page acquires two addresses and splits its own indexing.
      const address = `$scheme://$host${publicPath(path)}`
      assert.ok(xml.includes(`<loc>${address}</loc>`), `${path} is missing from the sitemap`)
    }
  })

  it('lists nothing else, and in particular not one gated address', () => {
    /*
     * The other direction, and the one that actually catches something. `/land`, `/kiln` and
     * `/workshop` are behind `ProtectedRoute`: a crawler arriving at one is shown a sign-in
     * invitation and never the page, so an entry for it offers a search engine an address whose
     * content no search user can reach. All three are still SERVED — they are in nginx's
     * enumerated block, because a signed-in player must be able to hard-refresh the Kiln — and
     * being served is a different question from being advertised.
     */
    const xml = servedBody('/worlds/tessera/sitemap.xml')
    const listed = [...xml.matchAll(/<loc>\$scheme:\/\/\$host([^<]*)<\/loc>/g)].map((m) =>
      m[1] === '' ? '/' : (m[1] ?? ''),
    )
    // SITEMAP_PATHS are ROUTER paths and a sitemap publishes PUBLIC ones — two different strings
    // since the nesting. `publicPath` is the one conversion between them.
    assert.deepEqual([...listed].sort(), SITEMAP_PATHS.map(publicPath).sort())
    for (const gated of ROUTES.filter((r) => r.protected)) {
      assert.ok(
        !xml.includes(`<loc>$scheme://$host${gated.path}</loc>`),
        `${gated.path} is behind a session gate and is advertised to crawlers anyway`,
      )
    }
  })

  it('is a well-formed urlset in the only schema crawlers implement', () => {
    const xml = servedBody('/worlds/tessera/sitemap.xml')
    assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n/)
    assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/)
    assert.match(xml, /<\/urlset>$/)
  })

  it('is served as XML, because a sitemap sent as text/html is a sitemap nobody reads', () => {
    // `types { }` as well as `default_type`: without emptying the table for this location, nginx
    // maps the `.xml` in the URI to `text/xml` from its own mime types and `default_type` never
    // applies.
    assert.match(
      nginx,
      /location = \/worlds\/tessera\/sitemap\.xml \{[\s\S]*?types \{ \}[\s\S]*?default_type application\/xml;/,
    )
  })

  it('is derived from the route table rather than typed a fourth time', () => {
    // `src/lib/routes.ts` already decides the router, the navigation, the not-found list and
    // nginx's enumerated locations. This asserts the derivation is real and is the GATE rather
    // than a hand-kept second list: an unprotected route added there appears here, a protected one
    // does not, and nobody has to remember either.
    assert.deepEqual(SITEMAP_PATHS, ['/', '/wards', '/discover'])
    assert.deepEqual(
      ROUTES.filter((r) => r.protected).map((r) => r.path),
      ['/land', '/kiln', '/workshop'],
    )
  })

  it('has no unbounded family of addresses to leave out, and that is a fact about the router', () => {
    /*
     * WHY THERE IS NO `/land/<id>` HERE, ASSERTED RATHER THAN SAID.
     *
     * The usual reason a public route is kept out of a sitemap is that it is one of an unbounded
     * set the service mints. This client has none: no route takes a path parameter at all. A
     * parcel is opened by a QUERY STRING — `/?parcel=<uuid>` — deliberately, so a link to
     * somebody's place is a link to the world view with a place in it rather than a second address
     * for the same screen, and nginx's own header says so.
     *
     * If that ever changes, this goes red BEFORE the sitemap silently starts advertising one
     * member of an infinite family — or silently starts omitting a whole screen.
     */
    for (const route of ROUTES) {
      assert.ok(
        !route.path.includes(':') && !route.path.includes('*'),
        `${route.path} takes a path parameter; the sitemap now has an unbounded family to exclude`,
      )
    }
    const app = readFileSync(new URL('../src/app.tsx', import.meta.url), 'utf8')
    const parameterised = [...app.matchAll(/path="([^"]*[:*][^"]*)"/g)].map((m) => m[1] ?? '')
    assert.deepEqual(
      parameterised.filter((p) => p !== '*'),
      [],
      'the router mounts a parameterised path, which is a family of addresses this sitemap cannot enumerate',
    )
  })
})

describe('an environment that is not mainnet', () => {
  /**
   * The `map` that decides it, and the alternation of labels inside it.
   *
   * A testnet estate carries test EMBER, a faucet, and wards full of objects fired to break
   * something. Indexed beside the real one, its pages are places that will be wiped, with a Kiln
   * that charges nothing — which makes this a support problem before it is an SEO one.
   */
  function alternation(): string[] {
    const map = /map \$host \$cf_env \{[\s\S]*?~\^[^\n]*?\(\?:([^)]*)\)\\\./.exec(nginx)
    assert.ok(map, 'the $cf_env map is missing from nginx.conf')
    return (map[1] ?? '').split('|')
  }

  it('recognises exactly the labels the registry reserves', () => {
    /*
     * ENV_LABELS is the estate's single list — `deploy/scripts/check-apex-prefix.py` reads the
     * same export. An alternation here that had drifted from it would either miss an environment
     * (and index it) or refuse a surface (and de-index a real one), and both fail silently.
     */
    assert.deepEqual(alternation().sort(), [...ENV_LABELS].sort())
  })

  it('refuses every crawler and serves no sitemap', () => {
    // Both halves matter and neither is sufficient: robots.txt stops the fetch, and a sitemap that
    // still answered would be an invitation contradicting the instruction beside it.
    // The robots half moved to micro-site with the document; micro-site already had an
    // identical `$cf_env` refusal, so a testnet apex answers `Disallow: /` and covers this
    // surface by construction. The sitemap half below is still this file's to enforce.
    assert.match(nginx, /location = \/worlds\/tessera\/sitemap\.xml \{[\s\S]*?if \(\$cf_env\) \{ return 404; \}/)
  })

  it('matches a suffixed subdomain as well as a bare environment apex', () => {
    // The environment is a SUFFIX on the first label now (`tessera-testnet.`) and was an apex
    // prefix (`testnet.`) before. Both shapes still resolve — surfaces.ts keeps the old one
    // deliberately — so the pattern has to catch both or half the estate stays indexable.
    const map = /map \$host \$cf_env \{[\s\S]*?\n\}/.exec(nginx)
    assert.ok(map, 'the $cf_env map is missing')
    assert.match(map[0], /\(\?:\[\^\.\]\+-\)\?/, 'the map does not allow a suffixed subdomain')
  })
})

describe('robots.txt — which this surface no longer serves', () => {
  it('is GONE from this repository, and its one line moved to the apex', () => {
    // A crawler reads robots.txt at the ORIGIN ROOT and nowhere else. Wave 3f made this bundle
    // `<apex>/worlds/tessera`, so `<apex>/worlds/tessera/robots.txt` is a file nothing will ever request — a
    // block here could only be dead configuration that READS like a policy.
    //
    // There was nothing to carry but the `Sitemap:` line and the `if ($cf_env)` refusal.
    // micro-site announces `https://$host/worlds/tessera/sitemap.xml` from the one robots.txt this
    // origin has, and it already had an identical `$cf_env` branch — so a testnet apex answers
    // `Disallow: /` and covers this surface by construction rather than by a second copy.
    //
    // AGAINST THE DIRECTIVES, NOT THE FILE. The block that used to be here left a comment in its
    // place saying so, and that comment contains the words `location = /robots.txt`. Matched
    // against the raw file this fails on its own gravestone — a false negative that reads as
    // "the deletion did not happen".
    const served = nginx
      .split('\n')
      .filter((line) => !/^\s*#/.test(line))
      .join('\n')
    assert.doesNotMatch(served, /location\s*=\s*\/robots\.txt/, 'this surface still serves a robots.txt')
    assert.doesNotMatch(served, /^Disallow:/m)
    assert.doesNotMatch(served, /^User-agent:/m)
    assert.doesNotMatch(served, /Sitemap:/, 'a Sitemap: line survived where nothing fetches it')
  })

  it('is not a static file, which an exact-match location would have shadowed', () => {
    /*
     * `location = /robots.txt` wins over the `location /` prefix that serves the static tree, so a
     * file in `public/` would be deployed, unreachable, and edited by the next reader to no effect
     * — the worst of the three states, worse than either serving it or not having it.
     */
    for (const name of ['robots.txt', 'sitemap.xml']) {
      let present = true
      try {
        readFileSync(new URL(`../public/${name}`, import.meta.url))
      } catch {
        present = false
      }
      assert.equal(present, false, `public/${name} exists, and nginx will never serve it`)
    }
  })
})

describe('the security headers on the documents this file adds', () => {
  it('are repeated in both new locations, because add_header does not accumulate', () => {
    // A location that declares ANY add_header inherits NONE from the server level. Both blocks set
    // Cache-Control, so both have to restate the three security headers or ship without them.
    // ONE DOCUMENT NOW. `robots.txt` left this repository in wave 3f: a crawler reads it at the
    // ORIGIN ROOT and nowhere else, so `<apex>/worlds/tessera/robots.txt` is a file nothing fetches, and
    // micro-site serves the one this origin has. The sitemap stayed — it is fetched at whatever
    // address announces it, and micro-site's robots.txt announces this one.
    for (const path of ['/worlds/tessera/sitemap.xml']) {
      const block = new RegExp(
        `location = ${path.replace('.', '\\.')} \\{([\\s\\S]*?)\\n    \\}`,
      ).exec(nginx)
      assert.ok(block, `no location for ${path}`)
      const body = block[1] ?? ''
      assert.match(body, /X-Content-Type-Options "nosniff"/)
      assert.match(body, /X-Frame-Options "SAMEORIGIN"/)
      assert.match(body, /Referrer-Policy "strict-origin-when-cross-origin"/)
    }
  })

  it('are repeated in every location that sets one of its own, including the two that matter', () => {
    /*
     * `/assets/` serves the JavaScript bundle and `/world-assets/` serves the whole world. Both
     * declare a Cache-Control and therefore inherit no security header at all; this repository
     * already restates them in both, and this is the assertion that keeps it that way — the same
     * defect shipped on several sibling surfaces, where the bundle went out with no nosniff.
     */
    for (const location of ['/assets/', '/world-assets/'].map((p) => `${BASE}${p}`)) {
      const block = new RegExp(`location ${location} \\{([\\s\\S]*?)\\n {4}\\}`).exec(nginx)
      assert.ok(block, `no ${location} location`)
      const body = block[1] ?? ''
      assert.match(body, /X-Content-Type-Options "nosniff"/, `${location} ships without nosniff`)
      assert.match(body, /X-Frame-Options "SAMEORIGIN"/, `${location} ships without frame-options`)
      assert.match(
        body,
        /Referrer-Policy "strict-origin-when-cross-origin"/,
        `${location} ships without a referrer policy`,
      )
    }
  })
})
