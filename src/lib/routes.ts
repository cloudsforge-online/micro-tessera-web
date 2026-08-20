/**
 * This app's addresses, declared once.
 *
 * Three things must agree about them: this file, the route table in `src/app.tsx`, and the
 * enumerated `location` block in `nginx.conf`. `test/routes.test.ts` checks all three against each
 * other, because a route added to the router and not to nginx works perfectly under `pnpm dev` and
 * 404s on the first hard refresh in production — a failure that survives review, since nothing
 * about the diff looks wrong.
 *
 * nginx ENUMERATES rather than falling back, because an unknown address must answer 404. See the
 * header of `nginx.conf`: `try_files $uri /index.html` serves the bundle with a 200 for every
 * address in existence, so search engines index the error screen and uptime checks call it
 * healthy.
 */

export interface RouteDef {
  /** The path, without a trailing slash. The index route is `/`. */
  readonly path: string
  /** The label in the navigation strip. Null keeps it out of the nav. */
  readonly nav: string | null
  /** A one-line description, used by the not-found page to offer somewhere to go. */
  readonly blurb: string
  /** Requires a session. Not a security boundary — the service checks every token. */
  readonly protected: boolean
}

/**
 * ── WHERE THIS BUNDLE IS MOUNTED, AND WHY IT IS TWO SEGMENTS ─────────────────────────────────
 *
 * Tessera used to be a hostname. It is a FOLDER INSIDE ANOTHER FOLDER now: `/worlds/tessera`, wave 3f
 * of the consolidation argued in micro-deploy `docs/apex-consolidation.md`. The registry says the
 * same thing in one line — `subdomain: ''`, `basePath: '/worlds/tessera'`.
 *
 * The nesting is not decoration. This surface's own registry row calls it a TITLE rather than a
 * sixth product: it is PLAYED THROUGH Forge Worlds, appears in no product switcher, and is reached
 * from the catalogue. `<apex>/worlds/tessera` states that relationship in the address; a sibling folder
 * on the apex would have stated the opposite.
 *
 *   A ROUTER PATH is what `react-router` matches, relative to the mount — everything in `ROUTES`
 *     below, and `basename` in `src/app.tsx` puts the prefix back.
 *
 *   A PUBLIC PATH is what the address bar shows and what a crawler is handed: `/worlds/tessera/…`.
 *     Every `<loc>` in the sitemap and every `location` in `nginx.conf`.
 *
 * `publicPath()` is the one crossing and the only place `BASE` is concatenated.
 *
 * ── THE GATEWAY RULE FOR THIS PATH MUST OUTRANK THE ONE FOR `/worlds` ───────────────────────
 *
 * `/worlds/tessera` matches `PathPrefix(`/worlds/`)`, which is Forge Worlds' own bundle rule. Traefik
 * resolves that overlap by priority and nothing else, so the estate gives a NESTED bundle 650
 * against the parent's 600. Get it wrong and the catalogue answers for the game: a 200 carrying
 * the wrong application, which renders and is not this one.
 */
export const BASE = '/worlds/tessera'

/** A router path as a public one. No trailing slash: the game is `/worlds/tessera`. */
export function publicPath(path: string): string {
  const rooted = path.startsWith('/') ? path : `/${path}`
  return rooted === '/' ? BASE : `${BASE}${rooted}`
}

export const ROUTES: readonly RouteDef[] = [
  {
    path: '/',
    nav: 'World',
    blurb: 'Walk into the ward you are standing in and look at what people have built there.',
    // Not protected, and that is §5's first line rather than an oversight: "arrive at the
    // Commons — a browser tab; no download, no plugin, NO ACCOUNT WALL". A stranger handed a link
    // to somebody's parcel should see the place, and be asked to sign in when they want to change
    // it. `micro-tessera` requires a bearer token on every route including the reads, so what a
    // signed-out visitor actually gets is the screen and an invitation — not the world. That gap
    // is the service's to close and is reported, not papered over here.
    protected: false,
  },
  {
    path: '/wards',
    nav: 'Wards',
    blurb: 'How full each ward is, what it is like, and who you would be sharing it with.',
    protected: false,
  },
  {
    path: '/land',
    nav: 'Land',
    blurb: 'The ground you hold, how long each parcel has left, and how to take more for nothing.',
    protected: true,
  },
  {
    path: '/kiln',
    nav: 'Kiln',
    blurb: 'Write down what you want and get it back about a minute later, yours to keep.',
    protected: true,
  },
  {
    path: '/discover',
    nav: 'Discover',
    blurb: 'The busiest places, ranked on visits and time spent, and on nothing you can buy.',
    protected: false,
  },
  {
    path: '/workshop',
    nav: 'Workshop',
    blurb: 'Sell what you have made, in EMBER you can withdraw, and see our cut before you list.',
    protected: true,
  },
]

/** The nav, in order. Derived — never a second hand-maintained list. */
export const NAV: readonly RouteDef[] = ROUTES.filter((r) => r.nav !== null)

/**
 * Every path except the index, without its leading slash.
 *
 * This is the exact alternation nginx's `location ~ ^/(…)` block must carry. The index is excluded
 * because nginx matches `location = /` separately.
 */
export const NON_INDEX_PATHS: readonly string[] = ROUTES.filter((r) => r.path !== '/').map((r) =>
  r.path.slice(1),
)

/**
 * The addresses of this surface that belong in the sitemap `nginx.conf` serves.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * BEING SERVED AND BEING ADVERTISED ARE DIFFERENT QUESTIONS, AND `protected` ALREADY ANSWERS BOTH.
 *
 * Every route above is SERVED — each one is in nginx's enumerated block, because a signed-in
 * player must be able to hard-refresh the Kiln and get the Kiln. What a crawler is INVITED to is a
 * smaller set: `/land`, `/kiln` and `/workshop` are behind `ProtectedRoute`, so a crawler arriving
 * at one is shown a sign-in invitation and never the page. Listing them would offer a search
 * engine an address whose content no search user can reach.
 *
 * DERIVED from `protected` rather than declared as a second boolean, deliberately. On this surface
 * the gate is the only disqualifier there is: nothing here takes a path parameter — a parcel is
 * opened by a QUERY STRING, `/?parcel=<uuid>`, precisely so that a link to somebody's place is a
 * link to the world view with a place in it rather than a second address for the same screen — so
 * there is no unbounded family of addresses to keep out, and a hand-maintained `indexable` field
 * would be a second opinion about the gate that could disagree with it.
 *
 * The other half of this decision is `robots` in `src/components/shell.tsx`, which sends
 * `noindex, follow` for the same three routes. A sitemap is an invitation and a robots directive
 * is an instruction; they are made twice on purpose and must not disagree. `test/sitemap.test.ts`
 * holds this list against the document nginx actually returns.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
export const SITEMAP_PATHS: readonly string[] = ROUTES.filter((r) => !r.protected).map(
  (r) => r.path,
)

/**
 * A route the CI image job may deep-link to and expect a 200.
 *
 * A REAL route, and one that does not require a session — the probe has no token. `/discover` is
 * the screen a stranger is most likely to be handed a link to.
 */
export const DEEP_LINK_PATH = '/discover'

export function routeFor(path: string): RouteDef | undefined {
  return ROUTES.find((r) => r.path === path)
}
