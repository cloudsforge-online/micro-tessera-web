/**
 * Every route this client calls, and the line in `micro-tessera` that serves it.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY EVERY CALL IS A NAMED FUNCTION WITH A CITATION
 *
 * This estate has shipped clients written against routes that did not exist, and they survived
 * review because the call site read like an ordinary fetch. The sharpest case: `@cloudsforge/ui`
 * posted the SSO callback to `/auth/exchange`, a route `micro-identity` has never served — and
 * the test pinning it compared the URL with a copy of itself, so it could never have failed.
 *
 * So: no component calls `tessera()` directly. Each route is a function here, each carries the
 * `tessera/src/server.ts` anchor it was verified against, and `test/citations.test.ts` resolves
 * those anchors against the SIBLING CHECKOUT by content rather than by line number
 * (`@cloudsforge/ui/cite`), so a route that moves in the service is found and a route that is
 * DELETED from the service turns this repository red.
 *
 * The citations are content pins, not `path:line`. A line pin decays in silence — forty stale
 * ones were corrected across four repositories in one evening, and `micro-identity`'s route table
 * moved twice in an afternoon. A content pin that matches nothing THROWS.
 *
 * ── What is NOT here, said plainly rather than invented ───────────────────────────────────────
 *
 * Three things this client's screens want and `micro-tessera` does not yet serve. They are listed
 * in `MISSING_ROUTES` below, as data, so the gap is a value a test can read rather than a
 * paragraph a reader can skip — and so nothing in this file can quietly start calling one.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import { tessera } from './api.ts'

/* ── the wire shapes, transcribed from the service's own exported types ────────────────────── */

/** `tessera/src/world.ts` — `export interface Ward`. */
export interface Ward {
  readonly id: string
  readonly slug: string
  readonly name: string
  readonly archetype: string
  readonly ordinal: number
  readonly claimableTiles: number
  readonly claimedTiles: number
  readonly occupancy: number
  readonly communityId: string | null
  readonly instances: number
  readonly openedAt: string
}

export type Tier = 'homestead' | 'plot' | 'court' | 'quarter'
export type FallowState = 'live' | 'fallow' | 'contestable' | 'banked'

/** `tessera/src/world.ts` — `export interface Parcel`. */
export interface Parcel {
  readonly id: string
  readonly wardId: string
  readonly ownerSubject: string
  readonly tier: Tier
  readonly originX: number
  readonly originY: number
  readonly size: number
  readonly tiles: number
  /**
   * GENERATED in the database — "There is no statement that can raise it. §6.2."
   *
   * The client DISPLAYS it and never enforces it. §6.2's cap is an invariant of
   * `micro-tessera`'s schema (a deferred constraint trigger checked at commit, §11.6), and a
   * client that refused a placement locally would be asserting a business rule — the exact defect
   * that let a game client withhold four SKUs from its UI while the payment routes stayed live.
   * The build tool sends the placement; the server decides.
   */
  readonly objectCap: number
  readonly status: 'held' | 'released'
  readonly isVenue: boolean
  readonly isWorkshop: boolean
  readonly gateOpen: boolean
  readonly commissioned: boolean
  readonly claimedAt: string
  readonly lastActiveAt: string
  readonly bankedUntil: string | null
  readonly fallowState: FallowState
}

/** `tessera/src/kiln.ts` — `export interface Placement`. */
export interface WirePlacement {
  readonly id: string
  readonly parcelId: string
  readonly objectId: string
  readonly x: number
  readonly y: number
  /** Two, and only two. §2.1 — the second is a horizontal mirror applied at render time. */
  readonly facing: 'canonical' | 'mirrored'
  readonly placedAt: string
}

/** `tessera/src/kiln.ts` — `export interface WorldObject`. */
export interface WorldObject {
  readonly id: string
  readonly authorSubject: string
  readonly prompt: string
  readonly category: string
  readonly footprint: '1x1' | '2x2'
  readonly status: 'firing' | 'fired' | 'failed'
  readonly checksum: string | null
  readonly c2pa: boolean | null
  readonly anchorTx: string | null
  readonly anchorBlock: string | null
  readonly anchoredAt: string | null
  readonly createdAt: string
}

/** `tessera/src/presence.ts` — `export interface Avatar`. */
export interface Avatar {
  readonly subject: string
  readonly instance: number
  readonly x: number
  readonly y: number
  readonly updatedAt: string
}

/** `tessera/src/discovery.ts` — `export interface RankedParcel`. */
export interface RankedParcel {
  readonly parcelId: string
  readonly wardId: string
  readonly ownerSubject: string
  readonly inputs: { readonly footfall: number; readonly medianDwell: number; readonly ageDays: number }
  readonly score: number
}

/**
 * `tessera/src/economy.ts` — `export interface PlatformTerms`, plus the flag the route adds.
 *
 * `identicalForEveryAccount` is stated on the wire by the service and DISPLAYED here. The client
 * does not compute it and must never compute it: §7.2's fifth refusal is "the platform fee and
 * the royalty cap are identical for every account", and a client that derived that claim from its
 * own state would be a promise checking itself.
 */
export interface Terms {
  readonly platformFeeBps: number
  readonly maxRoyaltyBps: number
  readonly identicalForEveryAccount: boolean
}

/** A listing as `serialiseListing` writes it. Every amount a decimal string. */
export interface Listing {
  readonly id: string
  readonly objectId: string
  readonly sellerSubject: string
  readonly priceWei: string
  readonly priceSparks: string
  readonly royaltyBps: number
  readonly platformFeeBps: number
  readonly settlementMode: string
  readonly status: string
  readonly split: {
    readonly feeWei: string
    readonly royaltyWei: string
    readonly proceedsWei: string
    readonly proceedsSparks: string
  }
}

/* ── the routes ───────────────────────────────────────────────────────────────────────────── */

/**
 * The content anchors `test/citations.test.ts` resolves against `../tessera/src/server.ts`.
 *
 * One entry per route this file calls. A route that moves is still found; a route that is renamed
 * or deleted fails the anchor's "exactly one match" rule and turns this repository red — which is
 * the point, because that is precisely the moment this client would start calling nothing.
 */
export const ROUTE_ANCHORS: readonly string[] = [
  "define('GET', '/v1/wards'",
  "define('GET', '/v1/wards/:id'",
  "define('GET', '/v1/wards/:id/parcels'",
  "define('GET', '/v1/wards/:id/presence'",
  "define('GET', '/v1/parcels/:id'",
  "define('GET', '/v1/parcels/fallow'",
  "define('GET', '/v1/discover'",
  "define('GET', '/v1/terms'",
  "define('GET', '/v1/me/parcels'",
  "define('GET', '/v1/objects'",
  "define('GET', '/v1/objects/:id'",
  "define('GET', '/v1/listings'",
  "define('POST', '/v1/parcels'",
  "define('POST', '/v1/parcels/:id/bank'",
  "define('PATCH', '/v1/parcels/:id'",
  "define('POST', '/v1/kiln/firings'",
  "define('POST', '/v1/parcels/:id/placements'",
  "define('DELETE', '/v1/placements/:id'",
  "define('POST', '/v1/listings'",
  "define('POST', '/v1/wards/:id/presence'",
  "define('POST', '/v1/parcels/:id/visits'",
]

/**
 * Routes this client's screens need and `micro-tessera` does not serve.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * DATA RATHER THAN PROSE, SO IT CANNOT BE SKIPPED AND CANNOT BE SATISFIED BY ACCIDENT.
 *
 * `test/citations.test.ts` asserts that each of these is STILL absent from the service. When one
 * lands, that test goes red and names the screen waiting on it. A "TODO" comment would have
 * neither property: it does not fail when the gap closes, and it does not fail when a screen
 * starts calling a route that was never there.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
export const MISSING_ROUTES: readonly { readonly want: string; readonly forScreen: string; readonly why: string }[] = [
  {
    want: 'GET /v1/me/balances',
    forScreen: 'the wallet strip',
    why:
      '§8.2 specifies three figures — Available, Clearing (payout_due) and Confirming (an ' +
      'observed-but-unconfirmed deposit, from the indexer, in no balance and no total). ' +
      'micro-tessera serves none of them. It holds a ledger client (`tessera/src/ledgerclient.ts`) ' +
      'but no read route hangs off it. The strip renders the three labels and an explicit ' +
      '"not available yet" rather than a zero, because BigInt("") is 0n and a zero on an ' +
      'earnings screen is a claim.',
  },
  {
    want: 'GET /v1/wards/:id/terrain (or a `seed` on the Ward)',
    forScreen: 'the world canvas',
    why:
      '§4 says a ward is "generated from the world seed against one of eight archetypes". The ' +
      'Ward shape carries `archetype` but no seed, and no route returns ground tiles. The client ' +
      'therefore lays ground out from the archetype with a deterministic function of the tile ' +
      'coordinate — see src/render/terrain.ts, which says at length that this is a RENDERING ' +
      'choice with no authority and would be replaced the day the service serves ground.',
  },
  {
    want: 'a sprite path on WorldObject, and a route for the 96 platform seed objects',
    forScreen: 'the world canvas and the build tray',
    why:
      'A placement names an `objectId`; `GET /v1/objects/:id` returns a WorldObject whose only ' +
      'byte-level field is `checksum`. Nothing maps an object to a path under ' +
      'micro-tessera-assets, and `GET /v1/objects` returns only the caller\'s OWN fired objects — ' +
      'so the 96 seed objects that are "free to every account forever" (§2.6) are unreachable. ' +
      'The client renders a placement whose sprite it cannot resolve as an unresolved marker, ' +
      'never as a substitute sprite.',
  },
]

/** `GET /v1/wards`. */
export const listWards = (): Promise<{ wards: Ward[] }> => tessera('/v1/wards')

/** `GET /v1/wards/:id`. */
export const getWard = (id: string): Promise<{ ward: Ward }> =>
  tessera(`/v1/wards/${encodeURIComponent(id)}`)

/** `GET /v1/wards/:id/parcels`. */
export const listWardParcels = (id: string): Promise<{ parcels: Parcel[] }> =>
  tessera(`/v1/wards/${encodeURIComponent(id)}/parcels`)

/** `GET /v1/wards/:id/presence` — who is in the ward, and in which instance. §4. */
export const wardPresence = (id: string): Promise<{ avatars: Avatar[] }> =>
  tessera(`/v1/wards/${encodeURIComponent(id)}/presence`)

/** `GET /v1/parcels/:id` — the parcel and everything standing on it. */
export const getParcel = (
  id: string,
): Promise<{ parcel: Parcel; placements: WirePlacement[] }> =>
  tessera(`/v1/parcels/${encodeURIComponent(id)}`)

/**
 * `GET /v1/parcels/fallow`.
 *
 * "The lazy fallow read. §4, §11.4: no sweep produced this list — it is a range scan against the
 * database's own clock, made when somebody asks." So the client asking is what computes it, and
 * the client does not compute the state itself: `parcel.fallowState` arrives decided.
 */
export const listFallow = (): Promise<{ parcels: Parcel[] }> => tessera('/v1/parcels/fallow')

/**
 * `GET /v1/discover` — the feed.
 *
 * Two inputs, never three. There is no `sort` parameter to pass and no `promoted` flag to read,
 * and this function takes no argument that could become one: §7.1's first refusal is "no promoted
 * placement, no paid ranking, no sponsored beacons, no boost", and a client that accepted an
 * ordering parameter would be the first half of building one.
 */
export const discover = (wardId?: string): Promise<{ parcels: RankedParcel[] }> =>
  tessera('/v1/discover', wardId === undefined ? {} : { query: { wardId } })

/** `GET /v1/terms` — the one set of terms, for everybody. */
export const getTerms = (): Promise<Terms> => tessera('/v1/terms')

/** `GET /v1/me/parcels`. */
export const myParcels = (): Promise<{ parcels: Parcel[] }> => tessera('/v1/me/parcels')

/** `GET /v1/objects` — the caller's own fired objects. */
export const myObjects = (): Promise<{ objects: WorldObject[] }> => tessera('/v1/objects')

/** `GET /v1/objects/:id` — also the `statusUrl` a firing's 202 hands back. */
export const getObject = (id: string): Promise<{ object: WorldObject }> =>
  tessera(`/v1/objects/${encodeURIComponent(id)}`)

/** `GET /v1/listings` — the caller's own. */
export const myListings = (): Promise<{ listings: Listing[] }> => tessera('/v1/listings')

/**
 * `POST /v1/parcels` — claim ground.
 *
 * NO PRICE AND NO PAYMENT CALL, and that is load-bearing rather than an omission: §4, land is
 * claimed free and the platform never sells it. The service's own handler carries the same note
 * and `world.test.ts` asserts the absence of both from the file. This function has no `priceWei`
 * parameter for the same reason.
 */
export const claimParcel = (input: {
  wardId: string
  tier: Tier
  originX: number
  originY: number
}): Promise<{ parcel: Parcel }> => tessera('/v1/parcels', { method: 'POST', body: input })

/** `POST /v1/parcels/:id/bank` — the free once-a-year extension to 270 days. §4. */
export const bankParcel = (id: string): Promise<{ parcel: Parcel }> =>
  tessera(`/v1/parcels/${encodeURIComponent(id)}/bank`, { method: 'POST', body: {} })

/** `PATCH /v1/parcels/:id` — gate open or shut, venue, workshop. */
export const setParcelFlags = (
  id: string,
  flags: { gateOpen?: boolean; isVenue?: boolean; isWorkshop?: boolean },
): Promise<{ parcel: Parcel }> =>
  tessera(`/v1/parcels/${encodeURIComponent(id)}`, { method: 'PATCH', body: flags })

/**
 * `POST /v1/kiln/firings` — fire an object out of a prompt.
 *
 * Answers **202** with `{ object, statusUrl }`, not 200 with a finished object: generation is a
 * leased job, not a request handler, on both sides of the call. The client polls `statusUrl`,
 * which is `/v1/objects/<id>`.
 *
 * It also answers **503 `kiln_unconfigured`** where the Kiln has no upstream, and that is a
 * SUPPORTED mode rather than an outage — "a world you can walk around in with a cold Kiln is
 * better than a title that refuses to boot over one dependency". The Kiln screen says so in
 * those terms rather than showing a generic error.
 */
export const fireObject = (input: {
  prompt: string
  category: string
  footprint: '1x1' | '2x2'
}): Promise<{ object: WorldObject; statusUrl: string }> =>
  tessera('/v1/kiln/firings', { method: 'POST', body: input })

/**
 * `POST /v1/parcels/:id/placements` — place objects, as ONE batch.
 *
 * The whole batch is one transaction on the service side, which is what makes the deferred
 * object-cap trigger check once rather than once per object — and what makes a paste that is
 * legal only as a whole legal at all (§11.6). So this function takes an ARRAY and there is
 * deliberately no single-placement convenience wrapper: a caller that looped would convert one
 * legal paste into N illegal ones.
 */
export const placeObjects = (
  parcelId: string,
  placements: readonly {
    objectId: string
    x: number
    y: number
    facing?: 'canonical' | 'mirrored'
  }[],
): Promise<{ placements: WirePlacement[] }> =>
  tessera(`/v1/parcels/${encodeURIComponent(parcelId)}/placements`, {
    method: 'POST',
    body: { placements },
  })

/** `DELETE /v1/placements/:id`. 204. */
export const removePlacement = (id: string): Promise<void> =>
  tessera(`/v1/placements/${encodeURIComponent(id)}`, { method: 'DELETE' })

/**
 * `POST /v1/listings` — list an object for sale.
 *
 * `priceWei` is a decimal STRING, never a JSON number: `Number.MAX_SAFE_INTEGER` is about 9×10¹⁵
 * and a single EMBER is 10¹⁸ wei. The service's `parsePriceWei` requires `/^\d{1,78}$/` before
 * calling `BigInt`, which makes the `BigInt('') === 0n` hazard — a missing amount becoming a free
 * purchase — unreachable through this door rather than handled behind it. `src/lib/money.ts`
 * refuses to produce a non-conforming string on this side too, so a blank field fails in the form
 * rather than as a 400.
 *
 * `platformFeeBps` and `settlementMode` are NOT sent, because the service does not read them: the
 * fee comes from `platform_terms` and the mode is always custodial. "A parameter that exists only
 * to be refused is a parameter somebody will one day wire to an entitlement."
 */
export const createListing = (input: {
  objectId: string
  priceWei: string
  royaltyBps: number
}): Promise<{ listing: Listing }> => tessera('/v1/listings', { method: 'POST', body: input })

/** `POST /v1/wards/:id/presence` — arrive. Answers the avatar, including which instance. */
export const arrive = (
  wardId: string,
  at: { x: number; y: number },
): Promise<{ avatar: Avatar }> =>
  tessera(`/v1/wards/${encodeURIComponent(wardId)}/presence`, { method: 'POST', body: at })

/**
 * `POST /v1/parcels/:id/visits` — record footfall and dwell. 204.
 *
 * The visitor is the AUTHENTICATED subject and is never in the body — this function has no
 * `subject` parameter, and the service reads none. "A body-supplied visitor is synthetic footfall
 * with extra steps, and footfall is half the ranking function." §8.6 forbids synthetic footfall
 * outright and the database refuses a non-`user:` subject as a second line.
 */
export const recordVisit = (parcelId: string, dwellSeconds: number): Promise<void> =>
  tessera(`/v1/parcels/${encodeURIComponent(parcelId)}/visits`, {
    method: 'POST',
    body: { dwellSeconds },
  })
