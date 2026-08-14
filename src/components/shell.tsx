/**
 * The app shell: the company bar, the navigation strip, the wallet strip, and the page.
 *
 * The bar is `CloudsForgeBar` from @cloudsforge/ui and is never reimplemented — it is what makes
 * moving between surfaces feel like one application. Everything this app adds goes BELOW it. The
 * bar marks `worlds` current, because a title is played through Forge Worlds and wears its
 * accent rather than claiming one (§1.1) — see PRODUCT in src/lib/hosts.ts.
 *
 * Five things here are the design system's now rather than this client's: `CloudsForgeBar`,
 * `SkipLink`, `MainRegion`, `CloudsForgeFooter`, `CookieBanner` — and `SubNav` is the sixth. It is
 * a different kind from the other five: they were chrome this surface never owned, and the sub-nav
 * was a strip it wrote itself and then maintained in parallel with ten other copies of the same
 * strip. See the note beside it for what moving it changes and what it deliberately does not.
 *
 * ── The readiness banner this shell does NOT have ─────────────────────────────────────────────
 *
 * `aetherholm-web`'s shell reads `GET /readyz` once per mount and shows a degradation banner.
 * `micro-tessera` serves `/readyz` too — but it serves it behind the same bearer-token check as
 * everything else is behind, and a signed-out visitor on `/discover` would fire an unauthenticated
 * probe that 401s on every mount. A banner that reports "degraded" whenever nobody is signed in is
 * worse than no banner, so the honest version is to leave it out until the service has an
 * unauthenticated readiness surface, and to say why here rather than ship a probe that is wrong
 * half the time.
 */
import { useEffect, useState } from 'react'
import {
  CloudsForgeBar,
  CloudsForgeFooter,
  CookieBanner,
  MainRegion,
  SkipLink,
  SubNav,
  miningOnHub,
} from '@cloudsforge/ui'
import { applyHead, surfaceMeta } from '@cloudsforge/ui/seo'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { PRODUCT, SURFACE, hosts } from '../lib/hosts.ts'
import { useSession } from '../lib/auth.tsx'
import { NAV, routeFor } from '../lib/routes.ts'
import { WalletStrip } from './wallet-strip.tsx'
import { setViewedNetwork, viewedNetwork, type ViewedNetwork } from '../lib/viewed.ts'

export function AppShell() {
  // The viewed network: in-tab memory, defaulting to the hostname's own (micro-org#459).
  // `setViewedNetwork` runs first in the handler below so the remounted tree reads the new value
  // on its very first render.
  const [viewed, setViewed] = useState<ViewedNetwork>(viewedNetwork())
  const { account, signIn, signOut } = useSession()

  return (
    <>
      {/*
        The skip link is the first focusable thing in the document, and it is now the SHARED one.

        This client wrote its own — a `.tw-skip` anchor reading "Skip to the page", pointed at
        `#main` — and it was half of the pattern. `<main id="main">` carried no `tabIndex={-1}`, so
        a `<main>` is not focusable and in Chrome and Safari following the fragment scrolled the
        page, left focus on the link, and sent the next Tab back into the second item of the
        company bar. `MainRegion` below is the half that was missing; it sets the id and the
        tabindex together, and `SkipLink` composes its href from the same constant, so the two
        cannot disagree about the target the way a hand-written pair can.

        The wording stays this surface's own rather than the shared default, because "the page" is
        what is below on all seven screens — on `/` that is a canvas, and "Skip to content" would
        promise a reader text.
      */}
      <SkipLink>Skip to the page</SkipLink>
      {/*
        `mining` is the design system's control, and it lands immediately before the account menu
        on all seven screens this client serves rather than on one of them.

        The owner's report was that starting a browser miner is "hidden deep in mining page". The
        bar is the only chrome every address of every surface renders, so it is the only place the
        offer can be made once and be everywhere. What THIS client passes is `miningOnHub()`, the
        `elsewhere` state: a session is a WebSocket and two Web Workers pinned to one origin, and
        `hub.<apex>` is not this origin — nothing in this bundle can start, observe or stop one
        over there. So it renders an ANCHOR to the surface that can, which is middle-clickable,
        openable in a new tab and legible to everything that reads links. An `onClick` standing in
        for a destination is what the shared `SkipLink` above exists to stop this file doing again.

        `hosts().hub`, never a written-out URL. This client is served from localhost on 4022, from
        a preview host and from the apex, and a literal would be correct on exactly one of them.
      */}
      {/*
        In-app network context (micro-org#459, the combined view). The reader's choice lives in
        `lib/viewed.ts` — module memory, never storage — and the `key` on the Outlet below is the
        refetch mechanism: switching remounts the page tree, and `apiBase()` reads `viewedHosts()`,
        so the same page re-reads itself from the other estate WITHOUT going anywhere. The band and
        the switcher both follow the selection, so testnet data under a mainnet address bar is
        never unmarked. The bar also stamps `?net=` onto its product links, which is what carries
        the choice across a product switch — every surface is its own origin, so nothing else can.
      */}
      <CloudsForgeBar
        current={PRODUCT}
        account={account}
        onSignIn={() => signIn()}
        onSignOut={signOut}
        mining={miningOnHub(hosts().hub)}
        networkSwitch={{
          selected: viewed,
          onSelect: (n) => {
            setViewedNetwork(n)
            setViewed(n)
          },
        }}
      />

      {/*
        The strip of sections, and it is now the SHARED one.

        This client wrote its own — `.tw-nav`, `.tw-nav__inner`, `.tw-nav__link`, sticky at
        `var(--cf-bar-h)` over `var(--cf-bg-raised)` with a `var(--cf-line)` rule under it and an
        `__inner` bounded at `var(--cf-max-w)` — and it was the ELEVENTH copy of that strip in the
        estate. It was one of the good copies: it scrolled, its labels did not break mid-word, and
        its inner box agreed with the bar above it, which is more than most of the ten could say.
        It is still a copy, and a copy is a place a fix does not reach.

        WHAT THE SURFACE GAINS BY MOVING. `.tw-nav__link.is-active` marked the section being read
        in TWO channels — ink and a 2px underline. `.cf-subnav__link--current` marks it in THREE,
        adding `font-weight: 600`. That third channel is not decoration: the underline is drawn in
        `--cf-accent`, a per-product hue, and two of the estate's accents sit within 4.6 ΔE of one
        another under protanopia, so a reader who separates neither hue was being told which
        section they were on by one signal that had gone grey and one that never varied. Weight
        survives both.

        WHAT IT DOES NOT LOSE. The deleted rule argued, correctly, that `color:` must take the
        4.5:1 text step (`--cf-accent-text`) and never the 3:1 border step (`--cf-accent`), because
        the two are the same value on a light scheme and different on the dark one this surface has
        always shipped. The shared rule satisfies that argument by a different route: it sets
        `color: var(--cf-fg)` — the full-strength foreground, above the text step on either scheme
        — and keeps `--cf-accent` where it belongs, on `border-bottom-color`. Nothing is layered
        back over it locally.

        The label stays this surface's own wording. "World sections" is what these are; the shared
        component takes the wording as a prop precisely so a strip does not have to be renamed to
        be shared. The links stay here because the current one is decided by react-router.
      */}
      <SubNav label="World sections">
        {NAV.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `cf-subnav__link${isActive ? ' cf-subnav__link--current' : ''}`
            }
          >
            {item.nav}
          </NavLink>
        ))}
      </SubNav>

      {/*
        `account.signedIn`, NOT `account`.

        `account` is always an object — `{ signedIn: false, handle: null, roles: null }` when
        nobody is signed in — so `{account && …}` is always true and the strip rendered for every
        anonymous visitor. Found by driving the built bundle in a real browser and reading the
        body text: "Sign in … Available Not available yet". A stranger who has never had an
        account was being shown a panel about their EMBER.

        Neither the unit tests nor the type checker could have caught it: the strip renders
        correctly in isolation, and a truthy object is a perfectly good object.
      */}
      {account.signedIn && <WalletStrip />}

      <DocumentMeta />
      {/*
        `MainRegion` rather than the hand-written `<main>` this file used to carry: same landmark,
        same class, plus the `id` the shared `SkipLink` points at and the `tabIndex={-1}` that is
        what actually moves focus into the page. The id is `cf-main` now rather than `main` —
        nothing in this client referenced the old one except the skip link that is gone with it.
      */}
      <MainRegion className="tw-main">
        <Outlet key={viewed} />
      </MainRegion>

      {/*
        The company footer, from @cloudsforge/ui. Every link in it is derived from the surface
        registry, so a new product appears here without this file changing — which is the reason
        the estate is not growing a fifth hand-rolled footer beside the four it already had.

        `current` is SURFACE, not the bar's surface: see lib/hosts.ts for why those are two
        different questions. `account` decides only whether the operator surfaces are offered.
      */}
      <CloudsForgeFooter current={SURFACE} account={account} />

      {/*
        Last in the document, and therefore last in the tab order. That is deliberate: the banner
        is a dialog and is explicitly NOT modal, so a player who came here to walk around a ward
        can walk around it and answer afterwards. A consent banner that traps focus is the coercion
        the regulation is about — and on this surface it would trap them one Tab away from a canvas
        that is the whole product.

        It renders nothing at all until it knows this reader has not already answered, and nothing
        on an origin where analytics would not report anyway, which is every local stack.
      */}
      <CookieBanner />
    </>
  )
}

/**
 * The title, description, Open Graph tags and canonical, kept in step with the address.
 *
 * A component in the shell rather than a hook each page calls, because the failure mode of the
 * second shape is the page that forgets — and the page that forgets is the one added last, which
 * is the one nobody has bookmarked and therefore the one nobody notices is titled with the
 * previous page's title.
 *
 * ── WHICH SURFACE KEY, AND WHY IT IS NOT THE BAR'S ────────────────────────────────────────────
 *
 * `SURFACE` (`'tessera'`), never `PRODUCT` (`'worlds'`). They are two answers to two questions and
 * `lib/hosts.ts` argues both: the bar marks the PLATFORM a player chose, and the head names the
 * SURFACE they are on. Handing `surfaceMeta` the product key would title every page of this client
 * "Forge Worlds" and describe it with the platform's blurb — including in the Open Graph card,
 * which is what a pasted link to somebody's parcel renders as.
 *
 * ── WHERE THE PAGE NAME COMES FROM ────────────────────────────────────────────────────────────
 *
 * `ROUTES`, which already decides the router, the navigation, the not-found list and nginx's
 * enumerated locations — `test/routes.test.ts` fails the build when those drift — so deriving from
 * it means the head cannot drift on its own either. The index passes NO title, because
 * `surfaceMeta` renders a page titled with the surface's own name as just the name rather than as
 * "Tessera — Tessera".
 *
 * ── WHAT THIS DOES NOT REPLACE ────────────────────────────────────────────────────────────────
 *
 * The static tags in `index.html`. Those are what a link-preview fetcher gets — the ones chat
 * clients use generally do not execute JavaScript — so the shell keeps its own title, description
 * and card, and this is the layer a browser and the crawlers that DO execute JavaScript see. That
 * trade is inherited rather than introduced; it is written down at the top of `@cloudsforge/ui/seo`
 * so the next person makes it deliberately instead of finding it in a link preview.
 */
function DocumentMeta() {
  const { pathname } = useLocation()

  useEffect(() => {
    applyHead(
      surfaceMeta(SURFACE, { description: DESCRIPTION, ...pageMeta(pathname) }),
      window.location.origin,
    )
  }, [pathname])

  return null
}

/**
 * The sentence a stranger reads before they arrive, in the ONE place it is written.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * IT IS PASSED IN RATHER THAN LEFT TO THE REGISTRY, AND THAT IS THE OPPOSITE OF WHAT THE OTHER
 * SURFACES DO.
 *
 * `surfaceMeta` composes a description from the surface's registry `blurb` when it is given none,
 * and the blurb is one clause — "A world you build in a browser tab, played through Forge Worlds"
 * — because its real job is a line under a name in a 264px switcher menu. `index.html` already
 * carries a real description, written for this purpose and 200 characters of it, and `applyHead`
 * UPDATES `meta[name=description]` IN PLACE. So leaving this to the registry would not add a
 * description; it would replace a good one with a menu caption, on every navigation, invisibly —
 * the served head and the shipped shell disagreeing about the same page. That is precisely the
 * defect `site/index.html` records, where a title drifted from its application's and every search
 * result carried a sentence the owner had asked to have removed.
 *
 * So there is one sentence and two copies of it, and the second copy is held down:
 * `test/shared-chrome.test.ts` reads `index.html` and fails when the two are not byte-identical.
 * A duplicated string with a test on it is a knowable copy; a duplicated string without one is how
 * this happened in the first place.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
export const DESCRIPTION =
  'Claim ground for free, fire objects out of a prompt, and get paid in EMBER when someone ' +
  'buys what you made. A persistent isometric world in a browser tab.'

/** What this address is, as far as the head is concerned. Derived from `ROUTES`, never restated. */
function pageMeta(pathname: string): { title?: string; path: string; robots?: string } {
  // `/wards/` and `/wards` are one page and must not produce two canonicals; `surfaceMeta`
  // normalises the path it is given, and this normalises the LOOKUP for the same reason.
  const segment = pathname.replace(/\/+$/, '')
  const declared = routeFor(segment === '' ? '/' : segment)

  if (!declared) {
    /*
     * An address this client does not route. nginx has already answered 404 and served this shell
     * inside it, so the page a reader sees is NotFoundPage — and the head must say the same thing.
     * `noindex` because a not-found page that invites indexing is how a broken link becomes a
     * search result; `follow` because every link on that screen is a real route of this surface.
     */
    return { title: 'Not found', path: pathname, robots: 'noindex, follow' }
  }

  // The index is the surface itself, and a route with no navigation label has no name to give:
  // passing no title at all is how `surfaceMeta` is told to use the surface's own.
  const base =
    declared.path === '/' || declared.nav === null
      ? { path: pathname }
      : { title: declared.nav, path: pathname }

  /*
   * A GATED ADDRESS IS SERVED AND NOT ADVERTISED.
   *
   * `/land`, `/kiln` and `/workshop` are behind `ProtectedRoute`: a crawler arriving at one is
   * shown a sign-in invitation, never the page, so indexing it publishes an address whose content
   * no search user can ever reach. `noindex, follow` rather than `nofollow` — the navigation on
   * that screen leads to real public pages and there is no reason to refuse them.
   *
   * This is the same decision the sitemap in `nginx.conf` makes, made twice on purpose: a sitemap
   * is an invitation and a robots directive is an instruction, and the two must not disagree.
   * `SITEMAP_PATHS` in `src/lib/routes.ts` is the other half, derived from the same field.
   */
  return declared.protected ? { ...base, robots: 'noindex, follow' } : base
}

