/**
 * The world: the canvas, and the parcel standing under it.
 *
 * ── What this screen renders, and where each piece came from ──────────────────────────────────
 *
 *   placements  `GET /v1/parcels/:id` → `{ parcel, placements }`. Authoritative.
 *   parcel      the same call. Its `objectCap` is DISPLAYED and never enforced here.
 *   ground      NOT SERVED. Laid out by `src/render/terrain.ts` from the ward's archetype, which
 *               that file says at length is a rendering choice with no authority, and which
 *               `MISSING_ROUTES` records as a gap in the service rather than a design.
 *   sprites     `/world-assets/`, same-origin, at the path the mount's own `SET.json` gives for
 *               the identity asked for — never a filename this bundle spells. No provider is
 *               nameable from here, and there is no fallback sprite: a placement whose sprite
 *               will not load is a hole with a name, listed by the canvas.
 *
 * ── The visit is recorded, once, and the client does not decide what it is worth ──────────────
 *
 * §6.5 makes footfall and dwell the whole ranking function, so recording a visit is the single
 * most abusable call in this client. It is made once per parcel per mount, with no subject in the
 * body (the service reads the authenticated one and nothing else), and the dwell is the elapsed
 * wall-clock seconds on the page — not a number this component chooses.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  getParcel,
  listWardParcels,
  listWards,
  recordVisit,
  type Parcel,
  type WirePlacement,
} from '../lib/tessera.ts'
import { SpriteCache } from '../lib/sprites.ts'
import { isArchetype, groundFor } from '../render/terrain.ts'
import type { Placement, Scene } from '../render/scene.ts'
import { useAsync } from '../lib/useAsync.ts'
import { WorldCanvas } from '../components/world-canvas.tsx'
import { Empty, Failed, Loading } from '../components/states.tsx'

export function WorldPage() {
  const [params, setParams] = useSearchParams()
  const parcelId = params.get('parcel')

  const wards = useAsync(listWards, [], 'The wards could not be read.')

  if (wards.notice) return <Failed notice={wards.notice} onRetry={wards.reload} />
  if (wards.data === undefined) return <Loading label="Finding the Mosaic" />
  if (wards.data.wards.length === 0) {
    return (
      <Empty
        title="No ward has opened yet"
        hint="The Commons opens first. Until it does there is nowhere to stand."
      />
    )
  }

  return parcelId ? (
    <ParcelView parcelId={parcelId} onLeave={() => setParams({})} />
  ) : (
    <Arrivals
      wards={wards.data.wards}
      onOpen={(id) => setParams({ parcel: id })}
    />
  )
}

function Arrivals({
  wards,
  onOpen,
}: {
  wards: readonly { id: string; name: string; archetype: string; occupancy: number }[]
  onOpen: (parcelId: string) => void
}) {
  const [wardId, setWardId] = useState(wards[0]?.id ?? '')
  // A static import. This was a dynamic one, which vite reported as pointless — the module is
  // statically imported by six other pages, so it can never move into a chunk of its own and the
  // `import()` bought a promise and nothing else.
  const parcels = useAsync(
    () => listWardParcels(wardId),
    [wardId],
    'The parcels in this ward could not be read.',
  )

  return (
    <div className="tw-arrivals">
      <header className="tw-page-head">
        <h1>Arrive</h1>
        <p className="tw-page-head__meta">
          A place with an open gate is a place you can walk into. Nothing downloads and nothing
          installs — you are already here.
        </p>
      </header>

      <label className="tw-field tw-field--inline">
        <span className="tw-field__label">Ward</span>
        <select value={wardId} onChange={(e) => setWardId(e.target.value)}>
          {wards.map((ward) => (
            <option key={ward.id} value={ward.id}>
              {ward.name} — {ward.archetype}
            </option>
          ))}
        </select>
      </label>

      {parcels.notice && <Failed notice={parcels.notice} onRetry={parcels.reload} />}
      {!parcels.notice && parcels.data === undefined && <Loading label="Looking around" />}
      {parcels.data?.parcels.length === 0 && (
        <Empty title="Nothing has been claimed in this ward yet" hint="All of it is free." />
      )}
      {parcels.data && parcels.data.parcels.length > 0 && (
        <ul className="tw-places">
          {parcels.data.parcels.map((parcel) => (
            <li key={parcel.id}>
              <button
                type="button"
                className="tw-place"
                onClick={() => onOpen(parcel.id)}
                // A shut gate is still openable as a screen — the parcel EXISTS and the world is
                // public. What is refused is changing it. The label says which it is rather than
                // hiding the closed ones, because a world with invisible buildings is a world
                // that feels empty when it is not.
                aria-label={`Open the ${parcel.tier} at ${parcel.originX}, ${parcel.originY} — gate ${parcel.gateOpen ? 'open' : 'shut'}`}
              >
                <span className="tw-place__tier">{parcel.tier}</span>
                <span className="tw-place__where">
                  {parcel.originX}, {parcel.originY}
                </span>
                <span className="tw-place__gate">{parcel.gateOpen ? 'Gate open' : 'Gate shut'}</span>
                {parcel.isWorkshop && <span className="tw-badge">workshop</span>}
                {parcel.isVenue && <span className="tw-badge">venue</span>}
                {parcel.commissioned && <span className="tw-badge">commissioned</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ParcelView({ parcelId, onLeave }: { parcelId: string; onLeave: () => void }) {
  const view = useAsync(
    () => getParcel(parcelId),
    [parcelId],
    'This parcel could not be read.',
  )
  const arrivedAt = useRef(Date.now())

  /**
   * Record footfall and dwell on the way out.
   *
   * On unmount, so the dwell is the time actually spent rather than a number picked on arrival.
   * `void` on the promise, deliberately: a failed visit must not surface as an error on a screen
   * the user has already left, and the ranking is not this client's to guarantee.
   */
  useEffect(() => {
    arrivedAt.current = Date.now()
    const id = parcelId
    return () => {
      const seconds = Math.min(86_400, Math.max(0, Math.round((Date.now() - arrivedAt.current) / 1000)))
      void recordVisit(id, seconds).catch(() => undefined)
    }
  }, [parcelId])

  if (view.notice) return <Failed notice={view.notice} onRetry={view.reload} />
  if (view.data === undefined) return <Loading label="Walking in" />
  return <Place parcel={view.data.parcel} placements={view.data.placements} onLeave={onLeave} />
}

function Place({
  parcel,
  placements,
  onLeave,
}: {
  parcel: Parcel
  placements: readonly WirePlacement[]
  onLeave: () => void
}) {
  // One cache per mount, closed on unmount: a ward's worth of decoded 512×512 RGBA is on the
  // order of a hundred megabytes of GPU memory, and a client that leaked it across navigations
  // would be an out-of-memory crash three parcels later.
  const [sprites] = useState(() => new SpriteCache(() => setTick((n) => n + 1)))
  const [, setTick] = useState(0)

  useEffect(() => () => sprites.close(), [sprites])

  const archetype = 'ashfield'
  const scene: Scene = useMemo(() => {
    const ground = isArchetype(archetype)
      ? groundFor(parcel.wardId, archetype, {
          tx: parcel.originX,
          ty: parcel.originY,
          w: parcel.size,
          h: parcel.size,
        })
      : []
    const objects: Placement[] = placements.map((p) => ({
      id: p.id,
      // The wire's x/y are PARCEL-RELATIVE — the service validates them 0..127 against the
      // parcel, not against the ward — so the origin is added here to get ward tile space, which
      // is what the projection works in.
      tile: { tx: parcel.originX + p.x, ty: parcel.originY + p.y },
      // The footprint lives on the OBJECT, not the placement, and this client has not read the
      // object. Every placement is drawn as 1x1 until `GET /v1/parcels/:id` carries the object's
      // footprint or this client fetches each object — and fetching N objects to draw N sprites
      // is a request per chair. Recorded in MISSING_ROUTES; drawn as the smaller of the two, so
      // the error is a 2×2 rendered small rather than a 1×1 covering its neighbours.
      footprint: '1x1',
      facing: p.facing === 'mirrored' ? -1 : 1,
      // Not resolvable yet: nothing maps an objectId to an asset path. The cache will report it
      // as missing, the canvas will name it, and nothing is substituted.
      sprite: `objects/${p.objectId}`,
    }))
    return { wardId: parcel.wardId, ground, placements: objects }
  }, [parcel.wardId, parcel.originX, parcel.originY, parcel.size, placements])

  useEffect(() => {
    // Ground first, then objects. On a phone the request queue is serviced in an order nobody
    // chose, and objects arriving before the floor is a field of hovering furniture.
    const paths = [
      ...new Set(scene.ground.map((g) => g.sprite)),
      ...new Set(scene.placements.map((p) => p.sprite)),
    ]
    void sprites.load(paths)
  }, [scene, sprites])

  return (
    <div className="tw-place-view">
      <header className="tw-page-head">
        <h1>
          A {parcel.tier} at {parcel.originX}, {parcel.originY}
        </h1>
        <p className="tw-page-head__meta">
          {placements.length.toLocaleString()} objects placed, of {parcel.objectCap.toLocaleString()}{' '}
          this parcel can hold. The cap is a rendering budget and is not purchasable at any price.
        </p>
        <button type="button" className="tw-button tw-button--quiet" onClick={onLeave}>
          Leave this place
        </button>
      </header>

      <WorldCanvas
        scene={scene}
        sprites={sprites}
        side={parcel.size}
        centre={{
          tx: parcel.originX + parcel.size / 2,
          ty: parcel.originY + parcel.size / 2,
        }}
        label={`A ${parcel.tier} in painterly isometric, ${placements.length} objects placed on it`}
      />

      <p className="tw-footnote">
        The ground under this parcel is drawn from the ward&apos;s archetype by this client, because
        micro-tessera serves no terrain. It is a picture, not world state — nothing here is sent
        anywhere, and it is replaced the day the service serves ground.
      </p>
    </div>
  )
}
