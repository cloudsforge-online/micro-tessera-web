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

export const ROUTES: readonly RouteDef[] = [
  {
    path: '/',
    nav: 'World',
    blurb: 'The canvas: the ward you are standing in, the ground, and everything on it.',
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
    blurb: 'Every ward, its occupancy, and which instance holds whom.',
    protected: false,
  },
  {
    path: '/land',
    nav: 'Land',
    blurb: 'Your parcels, the fallow clock on each, and the free ground you can claim.',
    protected: true,
  },
  {
    path: '/kiln',
    nav: 'Kiln',
    blurb: 'Describe a thing into existence. A prompt, a footprint, about a minute.',
    protected: true,
  },
  {
    path: '/discover',
    nav: 'Discover',
    blurb: 'Where people are going: footfall and dwell, and nothing else, ever.',
    protected: false,
  },
  {
    path: '/workshop',
    nav: 'Workshop',
    blurb: 'What you have made, what you have listed, and what the platform takes.',
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
