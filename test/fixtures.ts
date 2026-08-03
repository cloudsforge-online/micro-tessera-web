/**
 * Wire fixtures, transcribed from `micro-tessera`'s own exported shapes.
 *
 * They are transcribed rather than invented: every field below appears in `tessera/src/world.ts`,
 * `tessera/src/kiln.ts`, `tessera/src/discovery.ts` or `tessera/src/economy.ts`, and
 * `test/citations.test.ts` resolves the anchors that prove those types are still there.
 *
 * A fixture the service would never produce is a test that passes against a client nothing can
 * talk to, which is the same family of defect as a client written against a route that does not
 * exist — just one layer down.
 */
import type { Listing, Parcel, RankedParcel, Terms, Ward, WirePlacement, WorldObject } from '../src/lib/tessera.ts'

export const WARD: Ward = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'commons',
  name: 'The Commons',
  archetype: 'ashfield',
  ordinal: 0,
  claimableTiles: 49152,
  claimedTiles: 12288,
  occupancy: 0.25,
  communityId: null,
  instances: 1,
  openedAt: '2026-08-01T00:00:00.000Z',
}

export const PARCEL: Parcel = {
  id: '22222222-2222-4222-8222-222222222222',
  wardId: WARD.id,
  ownerSubject: 'user:alice',
  tier: 'plot',
  originX: 32,
  originY: 48,
  size: 32,
  tiles: 1024,
  // 640 — five objects per eight tiles, GENERATED in the database. §6.2.
  objectCap: 640,
  status: 'held',
  isVenue: false,
  isWorkshop: true,
  gateOpen: true,
  commissioned: false,
  claimedAt: '2026-08-01T00:00:00.000Z',
  lastActiveAt: '2026-08-03T00:00:00.000Z',
  bankedUntil: null,
  fallowState: 'live',
}

export const HOMESTEAD: Parcel = {
  ...PARCEL,
  id: '33333333-3333-4333-8333-333333333333',
  tier: 'homestead',
  size: 16,
  tiles: 256,
  objectCap: 160,
  isWorkshop: false,
}

/**
 * A parcel of a given tier, with the tiles and cap §6.2 gives that tier.
 *
 * The cap is written out per tier rather than computed from the tiles, even though it IS five per
 * eight tiles: a fixture that derived it would agree with any client that derived it, and
 * `BJ-TES-06` exists to prove this client does not. A scenario that wants a cap the arithmetic
 * would not produce passes one.
 */
export function parcelOfTier(
  tier: 'homestead' | 'plot' | 'court' | 'quarter',
  over: Partial<Parcel> = {},
): Parcel {
  const shape = {
    homestead: { size: 16, tiles: 256, objectCap: 160 },
    plot: { size: 32, tiles: 1024, objectCap: 640 },
    court: { size: 64, tiles: 4096, objectCap: 2560 },
    quarter: { size: 128, tiles: 16384, objectCap: 10240 },
  }[tier]
  return { ...PARCEL, tier, ...shape, ...over }
}

export function placements(count: number): WirePlacement[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `44444444-4444-4444-8444-${String(i).padStart(12, '0')}`,
    parcelId: PARCEL.id,
    objectId: `55555555-5555-4555-8555-${String(i).padStart(12, '0')}`,
    x: i % 32,
    y: Math.floor(i / 32) % 32,
    facing: i % 2 === 0 ? 'canonical' : 'mirrored',
    placedAt: '2026-08-02T00:00:00.000Z',
  }))
}

export const OBJECT: WorldObject = {
  id: '55555555-5555-4555-8555-000000000000',
  authorSubject: 'user:alice',
  prompt: 'a low bench of pale scorched timber, worn smooth in the middle',
  category: 'seating',
  footprint: '1x1',
  status: 'fired',
  checksum: 'sha256:9f2c1b7e5a4d3c8f0e1b2a3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f70',
  c2pa: false,
  anchorTx: null,
  anchorBlock: null,
  anchoredAt: null,
  createdAt: '2026-08-02T00:00:00.000Z',
}

/**
 * The terms, as `GET /v1/terms` answers them.
 *
 * 250 bps and 1000 bps are `MARKET_PLATFORM_FEE_BPS` and `MARKET_MAX_ROYALTY_BPS`' defaults, and
 * `identicalForEveryAccount` is added by the route itself — "stated on the wire, because §7.2's
 * fifth refusal is a promise to users and a promise nobody can check is a marketing claim".
 */
export const TERMS: Terms = {
  platformFeeBps: 250,
  maxRoyaltyBps: 1000,
  identicalForEveryAccount: true,
}

/**
 * One listing, whose split partitions.
 *
 * 400 Sparks = 4×10¹⁴ wei. Fee at 250 bps is 10¹³; royalty at 500 bps is 2×10¹³; proceeds are the
 * REMAINDER, so fee + royalty + proceeds === price exactly. The numbers are computed here the way
 * `market/src/money.ts` computes them — floor for the two shares, subtraction for the third —
 * rather than typed by hand, because a hand-typed split that happened not to partition would make
 * every assertion about the split vacuous.
 */
const PRICE_WEI = 400n * 1_000_000_000_000n
const FEE_WEI = (PRICE_WEI * 250n) / 10_000n
const ROYALTY_WEI = (PRICE_WEI * 500n) / 10_000n

export const LISTING: Listing = {
  id: '66666666-6666-4666-8666-666666666666',
  objectId: OBJECT.id,
  sellerSubject: 'user:alice',
  priceWei: PRICE_WEI.toString(),
  priceSparks: '400',
  royaltyBps: 500,
  platformFeeBps: 250,
  settlementMode: 'custodial',
  status: 'draft',
  split: {
    feeWei: FEE_WEI.toString(),
    royaltyWei: ROYALTY_WEI.toString(),
    proceedsWei: (PRICE_WEI - FEE_WEI - ROYALTY_WEI).toString(),
    proceedsSparks: ((PRICE_WEI - FEE_WEI - ROYALTY_WEI) / 1_000_000_000_000n).toString(),
  },
}

export const RANKED: RankedParcel[] = [
  {
    parcelId: PARCEL.id,
    wardId: WARD.id,
    ownerSubject: 'user:alice',
    inputs: { footfall: 84, medianDwell: 212, ageDays: 3 },
    score: 12.418,
  },
  {
    parcelId: HOMESTEAD.id,
    wardId: WARD.id,
    ownerSubject: 'user:bob',
    inputs: { footfall: 140, medianDwell: 9, ageDays: 1 },
    score: 8.101,
  },
]

/** A signed-in session, as `lib/api.ts` reads it out of localStorage. */
export const SIGNED_IN = {
  'cf.accessToken': 'access-token-for-tests',
  'cf.refreshToken': 'refresh-token-for-tests',
} as const
