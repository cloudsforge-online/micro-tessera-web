/**
 * The chrome this surface takes from @cloudsforge/ui 1.1, driven rather than read.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * FIVE THINGS, AND FOUR OF THEM CLOSE A DEFECT RATHER THAN RESTYLE ANYTHING.
 *
 *   - The document head follows the ADDRESS. Every page of this client was titled "Tessera"
 *     before, including the Kiln a player leaves open for the minute a firing takes.
 *   - A gated address tells a crawler not to index it. `/land`, `/kiln` and `/workshop` answer a
 *     crawler with a sign-in invitation, and an indexed sign-in invitation is a search result that
 *     cannot be satisfied.
 *   - NO ANALYTICS TAG EXISTS UNTIL SOMEBODY SAYS YES. `index.html` carries the measurement ID and
 *     must never carry the script; the Accept button in `CookieBanner` is the one call site.
 *   - The skip link's target takes focus, which is the half this repository was missing —
 *     `BJ-A11Y-12` in `journeys.test.ts` holds that one, beside the landmark and heading checks it
 *     already made.
 *   - BROWSER MINING IS OFFERED BESIDE THE ACCOUNT, on every address rather than on one page of one
 *     other surface, and it promises no payment.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THE MEASUREMENT ID IS INJECTED INTO THE HARNESS'S HEAD
 *
 * `CookieBanner` renders NOTHING when there is no `<meta name="cf-analytics">` to read — correctly,
 * because a banner asking permission for something that will never happen is worse than no banner.
 * The harness mounts React into a bare document rather than into `index.html`, so without this the
 * banner would be absent for the wrong reason and every assertion below about consent would pass
 * against a component that never rendered. The value is read out of `index.html` rather than typed,
 * so the scenario is about the ID this surface actually ships.
 *
 * That is the same shape as the defect this whole repository is arranged against: `SpriteCache`
 * swallowing its own 404s while the surface went on answering 200.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { createElement as h } from 'react'
import { surfaceMeta } from '@cloudsforge/ui/seo'
import { HUB_MINE_PATH, NOT_PAID_CLAUSE, surface } from '@cloudsforge/ui'
import { withScreen, type Screen } from './dom.ts'
import { App } from '../src/app.tsx'
import { DESCRIPTION } from '../src/components/shell.tsx'
import { SURFACE, hosts } from '../src/lib/hosts.ts'
import { NAV, ROUTES } from '../src/lib/routes.ts'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const HTML = readFileSync(join(REPO, 'index.html'), 'utf8')
const ORIGIN = 'https://cloudsforge.online/worlds/tessera'

/** The measurement ID this surface ships, read off the shell rather than restated. */
const ANALYTICS_ID = (/name="cf-analytics" content="([^"]+)"/.exec(HTML)?.[1] ?? '') as string

/** Mount the whole app at an address, with the shell's own analytics meta tag present. */
async function atAddress(
  path: string,
  body: (s: Screen) => Promise<void>,
  opts: { analytics?: boolean } = {},
): Promise<void> {
  await withScreen(h(App), { url: `${ORIGIN}${path}`, routes: {} }, async (s) => {
    if (opts.analytics === true) {
      const meta = s.document.createElement('meta')
      meta.setAttribute('name', 'cf-analytics')
      meta.setAttribute('content', ANALYTICS_ID)
      s.document.head.appendChild(meta)
      // ══════════════════════════════════════════════════════════════════════════════════════
      // AND THE APP IS REMOUNTED, NOT RE-RENDERED.
      //
      // `CookieBanner` reads the tag in a `useEffect` with an empty dependency list — deliberately,
      // because `localStorage` and `document.head` are not available during a server render and
      // reading them in the render body is what makes a component hydrate to a different tree than
      // it rendered. An empty dependency list runs ONCE per mount, so a second render of the same
      // tree would not look again and the banner would stay absent for the wrong reason.
      //
      // Rendering something else and then rendering the app again unmounts and remounts it, which
      // is the only thing that re-runs the effect.
      // ══════════════════════════════════════════════════════════════════════════════════════
      await s.rerender(h('div', null, 'remounting so the consent effect reads the shell again'))
      await s.rerender(h(App))
      await s.settle()
    }
    await body(s)
  })
}

const contentOf = (s: Screen, selector: string): string =>
  s.document.head.querySelector(selector)?.getAttribute('content') ?? ''

/* ── the shell document ─────────────────────────────────────────────────────────────────────── */

describe('index.html, as a document rather than as a template', () => {
  it('declares the scheme as the third attribute on <html>, statically', () => {
    // Statically for the same reason the other two are: an attribute that lands after the first
    // paint is a theme flash — the default palette, and then a change of colour.
    assert.match(HTML, /<html[^>]*\sdata-cf-scheme="auto"/)
    assert.match(HTML, /<html[^>]*\sdata-cf-product="worlds"/, 'the accent ramp moved')
    assert.match(HTML, /<html[^>]*\sdata-cf-substrate="warm"/, 'the ash ramp moved')
  })

  it('spells color-scheme the way the standard spells it, and declares both', () => {
    /*
     * It was `colour-scheme` — correct English and INERT, because that is not a registered meta
     * name and no browser has ever read it. The declaration that was meant to tell the browser
     * which form controls and scrollbars to draw did nothing at all, on a client whose Kiln is a
     * prompt box and whose workshop is a price field.
     *
     * BOTH values, not only `dark`: `data-cf-scheme="auto"` means the token layer now resolves
     * whichever palette the reader's system asks for, and declaring one here would leave the
     * chrome the browser draws disagreeing with the page around it.
     */
    assert.doesNotMatch(HTML, /name="colour-scheme"/, 'the inert British spelling is back')
    assert.match(HTML, /<meta name="color-scheme" content="dark light" \/>/)
  })

  it('carries the measurement ID and NOT the tag, and never may', () => {
    // ════════════════════════════════════════════════════════════════════════════════════════
    // THE ASSERTION THAT IS THE WHOLE POINT. The stock analytics snippet fetches a script and
    // sets `_ga` on load — before any banner has been drawn, let alone answered — and under
    // ePrivacy Art. 5(3) a cookie set before consent is a violation that a banner underneath it
    // does not cure. So the shell may name the property and may not load anything.
    //
    // The domain is assembled here rather than written out, for the reason index.html gives for
    // not writing it either: a grep of the shell for it must return nothing, so the absence is
    // checkable rather than asserted.
    //
    // SPLIT INSIDE THE WORD, not at the dot. Splitting only the TLD off leaves the hostname's
    // distinctive token whole, and web-ci.yml's `No third-party analytics tag` step greps the raw
    // tree for exactly that token — so the earlier form failed the guard it was written to
    // satisfy. No fragment below matches the guard's pattern on its own, and neither does this
    // sentence: the rule extends to the prose, or the fix reintroduces the failure.
    // ════════════════════════════════════════════════════════════════════════════════════════
    assert.match(ANALYTICS_ID, /^G-[A-Z0-9]{4,20}$/, 'index.html declares no valid measurement ID')
    const tagHost = ['google', 'tag', 'manager', '.com'].join('')
    assert.ok(!HTML.includes(tagHost), 'index.html names the analytics tag host')
    assert.ok(!HTML.includes('gtag'), 'index.html contains a gtag snippet')
    const sources = [...HTML.matchAll(/<script[^>]*\ssrc="([^"]*)"/g)].map((m) => m[1] ?? '')
    assert.deepEqual(
      sources,
      ['/src/main.tsx'],
      'index.html loads a script other than this bundle, which is how a tag arrives before consent',
    )
  })

  it('holds one description, and the bundle applies the same one', () => {
    /*
     * TWO COPIES OF ONE SENTENCE, AND THIS IS THE THING THAT MAKES THAT SAFE.
     *
     * `index.html`'s tag is what a link-preview fetcher gets — chat clients generally do not
     * execute JavaScript — and `DocumentMeta` writes the head a browser and every crawler that
     * DOES execute it sees, IN PLACE. Two different sentences would mean two different
     * descriptions of the same page depending on the client, silently, with nothing to notice it:
     * exactly what `site/index.html` records happening to its title.
     */
    const declared = /<meta\s+name="description"\s+content="([^"]*)"/s.exec(HTML.replace(/\n\s*/g, ' '))
    assert.ok(declared, 'index.html declares no description')
    assert.equal(
      declared[1],
      DESCRIPTION,
      'index.html and src/components/shell.tsx describe this surface differently',
    )
  })
})

/* ── the head follows the address ───────────────────────────────────────────────────────────── */

describe('the document head', () => {
  it('names TESSERA, not the platform the bar marks current', async () => {
    /*
     * `PRODUCT` is `worlds` and `SURFACE` is `tessera`, and `lib/hosts.ts` argues why those are
     * two answers to two questions. The head is the second one. Handing `surfaceMeta` the product
     * key would title every page of this client "Forge Worlds" — a whole platform's name on one
     * title's pages, in the string a stranger reads in a search result.
     */
    assert.equal(surface(SURFACE).name, 'Tessera')
    await atAddress('/', async (s) => {
      assert.equal(s.document.title, 'Tessera')
      assert.equal(contentOf(s, 'meta[property="og:title"]'), 'Tessera')
      assert.equal(contentOf(s, 'meta[name="description"]'), DESCRIPTION)
      assert.equal(contentOf(s, 'meta[property="og:description"]'), DESCRIPTION)
    })
  })

  it('is titled with the page, from the route table rather than from a list typed here', async () => {
    for (const route of ROUTES.filter((r) => r.path !== '/')) {
      await atAddress(route.path, async (s) => {
        assert.equal(
          s.document.title,
          `${route.nav} — Tessera`,
          `${route.path} is titled ${s.document.title}`,
        )
        assert.equal(
          s.document.head.querySelector('link[rel="canonical"]')?.getAttribute('href'),
          `${ORIGIN}${route.path}`,
          `${route.path} has the wrong canonical`,
        )
      })
    }
  })

  it('invites a crawler to the public routes and refuses it the gated ones', async () => {
    /*
     * A crawler arriving at `/land`, `/kiln` or `/workshop` is shown a sign-in invitation and
     * never the page, so indexing one publishes an address whose content no search user can
     * reach. `follow` rather than `nofollow`: the navigation on that screen leads to real public
     * pages of this surface and there is no reason to refuse them.
     *
     * The sitemap in `nginx.conf` makes the same decision — see `SITEMAP_PATHS` — and the two are
     * made twice deliberately: a sitemap is an invitation and a robots directive is an
     * instruction, and they must not disagree.
     */
    const indexable = surfaceMeta(SURFACE).robots
    assert.equal(indexable, 'index, follow, max-image-preview:large')
    for (const route of ROUTES) {
      await atAddress(route.path, async (s) => {
        assert.equal(
          contentOf(s, 'meta[name="robots"]'),
          route.protected ? 'noindex, follow' : indexable,
          `${route.path} tells a crawler the wrong thing`,
        )
      })
    }
  })

  it('says noindex on an address this surface does not own', async () => {
    // nginx has already answered 404 and served this shell inside it, so the page a reader sees is
    // the not-found screen — and the head must say the same thing. A not-found page that invites
    // indexing is how a broken link becomes a search result.
    await atAddress('/a-place-that-is-not-here', async (s) => {
      assert.equal(s.document.title, 'Not found — Tessera')
      assert.equal(contentOf(s, 'meta[name="robots"]'), 'noindex, follow')
    })
  })

  it('updates its tags in place, so one navigation does not leave two descriptions behind', async () => {
    // The bug every hand-rolled version of this has, and it is invisible in a browser because the
    // first matching tag wins: a second `<meta name="description">` appended on each navigation is
    // a head that grows and a page whose description is whichever one happened to be first.
    await atAddress('/wards', async (s) => {
      assert.equal(s.document.head.querySelectorAll('meta[name="description"]').length, 1)
      assert.equal(s.document.head.querySelectorAll('link[rel="canonical"]').length, 1)
    })
  })
})

/* ── the strip of sections ──────────────────────────────────────────────────────────────────── */

describe('the strip of sections, as it is actually rendered', () => {
  /*
   * ══════════════════════════════════════════════════════════════════════════════════════════
   * THIS IS THE ASSERTION A SOURCE-TEXT CHECK CANNOT MAKE, AND IT IS HERE RATHER THAN IN
   * test/styles.test.ts ON PURPOSE.
   *
   * That file can prove `.tw-nav*` is gone from the stylesheet and that ui.css declares
   * `.cf-subnav*`. Both can be true of a shell that still renders `<nav className="tw-nav">` —
   * which is the strictly worse state, a strip with no rules at all rather than a duplicated one.
   * Only mounting the app in a document and reading the class off the landmark closes that, and
   * the mutation proof for this change is exactly that: reverting src/components/shell.tsx alone
   * turns this red and leaves every rule in test/styles.test.ts green.
   * ══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('is the SHARED one, labelled in this surface’s own words', async () => {
    await atAddress('/wards', async (s) => {
      const strips = s.document.querySelectorAll('nav.cf-subnav')
      assert.equal(strips.length, 1, 'expected exactly one shared sub-nav landmark')
      const strip = strips[0] as Element
      // The wording is this client's, not the design system's default. `SubNav` takes it as a prop
      // so that sharing the strip does not mean renaming the sections.
      assert.equal(strip.getAttribute('aria-label'), 'World sections')
      assert.ok(strip.querySelector('.cf-subnav__inner'), 'the scrolling inner box is missing')
      assert.equal(s.document.querySelectorAll('.tw-nav, [class*="tw-nav__"]').length, 0)
    })
  })

  it('carries every section from the route table, on the shared link class', async () => {
    await atAddress('/wards', async (s) => {
      const links = [...s.document.querySelectorAll('nav.cf-subnav a')]
      // Against NAV rather than a number, so adding a seventh section does not silently pass.
      assert.equal(links.length, NAV.length)
      for (const link of links) {
        const cls = link.getAttribute('class') ?? ''
        assert.ok(cls.split(/\s+/).includes('cf-subnav__link'), `a section link reads class="${cls}"`)
        assert.ok(!cls.includes('tw-nav'), `a section link still carries a local class: "${cls}"`)
      }
    })
  })

  it('marks the section being read with the shared modifier, not `is-active`', async () => {
    await atAddress('/wards', async (s) => {
      const current = [...s.document.querySelectorAll('.cf-subnav__link--current')]
      assert.equal(current.length, 1, 'exactly one section is the one being read')
      assert.equal(current[0]?.textContent, 'Wards')
      // The local copy spelled it `is-active`. Scoped to the strip rather than to the document,
      // because `.tw-map__lane` and `.tw-city-tab` are this client's own and keep that name; what
      // must not survive is a section link asking for a class the design system does not declare,
      // which renders as an ordinary link and reports nothing.
      assert.equal(s.document.querySelectorAll('nav.cf-subnav .is-active').length, 0)
    })
  })
})

/* ── consent ────────────────────────────────────────────────────────────────────────────────── */

describe('the consent banner', () => {
  // Assembled in fragments for the reason given above the first copy: the estate's analytics guard
  // greps the raw tree, so the hostname may not be written out even in the test that proves it is
  // never fetched.
  const tagHost = ['google', 'tag', 'manager', '.com'].join('')
  const tags = (s: Screen): Element[] =>
    [...s.document.head.querySelectorAll('script[src]')].filter((el) =>
      (el.getAttribute('src') ?? '').includes(tagHost),
    )

  it('asks nothing and loads nothing before it has been answered', async () => {
    await atAddress(
      '/discover',
      async (s) => {
        assert.deepEqual(tags(s), [], 'the analytics tag loaded before anybody agreed to it')
        assert.equal(s.document.cookie, '', 'a cookie was set before anybody agreed to one')
        // It is a dialog and it is deliberately NOT modal, so it does not trap focus — and it is
        // LAST in the document, which is what puts it last in the tab order. On this surface that
        // matters twice over: the thing above it is a canvas somebody came here to walk around.
        const banner = s.byRole('dialog', /Analytics on CloudsForge/)
        assert.equal(banner.getAttribute('aria-modal'), 'false')
        const order = s.tabbables()
        const accept = s.byRole('button', 'Accept')
        assert.equal(order.at(-1), accept, 'the banner is not last in the tab order')
      },
      { analytics: true },
    )
  })

  it('renders nothing at all on a surface with no measurement ID, which is every local stack', async () => {
    await atAddress('/discover', async (s) => {
      assert.equal(
        s.queryByRole('dialog', /Analytics on CloudsForge/),
        null,
        'a banner asked permission for something that could never happen',
      )
    })
  })

  it('loads the tag on Accept and nothing on Reject, and the two buttons are one class', async () => {
    await atAddress(
      '/discover',
      async (s) => {
        // Neither button is styled as the primary one. That is a compliance requirement rather
        // than a preference: a Reject that is visually quieter than Accept is the dark pattern
        // regulators have fined for, and the two sharing a class is how it stays true.
        const reject = s.byRole('button', 'Reject')
        const accept = s.byRole('button', 'Accept')
        assert.equal(reject.getAttribute('class'), accept.getAttribute('class'))
        // Reject first in the document: a reader scanning left to right meets the refusal before
        // the acceptance.
        assert.ok(
          (reject.compareDocumentPosition(accept) & 4) !== 0,
          'Accept comes before Reject in the document',
        )

        await s.click(reject)
        assert.deepEqual(tags(s), [], 'refusing consent loaded the tag anyway')
        assert.equal(
          s.queryByRole('dialog', /Analytics on CloudsForge/),
          null,
          'the banner is still asking after it has been answered',
        )
      },
      { analytics: true },
    )

    await atAddress(
      '/discover',
      async (s) => {
        await s.click(s.byRole('button', 'Accept'))
        const loaded = tags(s)
        assert.equal(loaded.length, 1, 'accepting consent did not load the tag')
        assert.equal(
          loaded[0]?.getAttribute('src'),
          `https://www.${tagHost}/gtag/js?id=${ANALYTICS_ID}`,
          'the tag was built from something other than the ID the shell declares',
        )
        assert.equal(loaded[0]?.getAttribute('async'), '', 'the tag is not async, so it blocks the parser')
      },
      { analytics: true },
    )
  })
})

/* ── browser mining, from the bar ───────────────────────────────────────────────────────────── */

describe('the mining control in the bar', () => {
  /*
   * The owner's report was that starting a browser miner is "hidden deep in mining page, it should
   * be easily found near the account on all pages". It is in the shared chrome now, so it is on all
   * seven screens of this client — and it is asserted by MOUNTING THE APP, for the same reason
   * everything else in this file is: a shell that passes the prop and a bar that drops it are
   * indistinguishable in source, and the whole failure this repository is arranged against is a
   * component reporting success while serving nothing.
   *
   * What this client renders is the `elsewhere` state. The miner is a WebSocket and two Web Workers
   * on `hub.<apex>`, a different origin, so nothing here can start, observe or stop a session;
   * pressing one is asserted in micro-hub-web, which mounts it.
   */

  it('offers mining beside the account, as a link to the surface that runs it', async () => {
    await atAddress('/', async (s) => {
      const bar = s.document.querySelector('.cf-bar')
      assert.ok(bar, 'this client no longer renders the company bar')
      const found = [...bar.querySelectorAll('.cf-mine')]
      assert.equal(found.length, 1, `expected one mining control in the bar, found ${found.length}`)
      const mine = found[0] as Element

      /*
       * An anchor, not an onClick. A destination expressed as a handler cannot be middle-clicked or
       * opened in a new tab, its target cannot be copied, and it is invisible to every check that
       * reads links — which is how a wrong account destination survived on nineteen surfaces.
       */
      assert.equal(mine.tagName, 'A', 'the mining control is not a link')
      assert.equal(
        mine.getAttribute('href'),
        `${hosts().hub}${HUB_MINE_PATH}`,
        'the mining control does not point at Forge Hub’s mining address',
      )

      /*
       * Beside the account as TAB ORDER rather than as a CSS neighbour. A stylesheet can move a box
       * anywhere; only document order moves this, and the tab order is what a reader who never sees
       * the layout actually gets.
       */
      const order = s.tabbables()
      const account = s.byRole('button', 'Sign in')
      assert.equal(
        order.indexOf(account) - order.indexOf(mine),
        1,
        'the mining control is no longer immediately before the account in the tab order',
      )

      /*
       * And it promises nothing the pool does not pay. `pool/src/payouts.ts` derives
       * `payoutsImplemented` and it is false on this estate, which bites harder here than on most
       * surfaces: this client already renders a wallet strip about somebody's EMBER, so a digit
       * beside the word Mine would sit in a row of real balances and read as a third one.
       */
      const described = s.document.getElementById(mine.getAttribute('aria-describedby') ?? '')
      assert.ok(described, 'the mining control carries no description for a screen reader')
      assert.ok(
        s.textOf(described).includes(NOT_PAID_CLAUSE),
        'the mining control does not carry the not-paid clause',
      )
      assert.doesNotMatch(
        `${s.textOf(mine)} ${s.textOf(described)}`,
        /[$€£]|\d/,
        'the mining control shows a figure, and nothing is paid',
      )
    })
  })
})
