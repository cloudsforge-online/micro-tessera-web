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
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
// The plain function, not `useSession().signIn`. They are the same redirect; this form keeps the
// page mountable outside `<AuthProvider>`, which is how the screen tests render it.
import { signIn } from '../lib/api.ts'
import { WorldCanvas } from '../components/world-canvas.tsx'
import { Empty, Failed, Loading, SignedOut } from '../components/states.tsx'

/**
 * The four whole-page states, under a heading that says where the reader is.
 *
 * Every branch below replaces the ENTIRE page, and each one used to render a bare `<p>` — so on a
 * deployment with no ward open, the front door of Tessera was one sentence, "The Commons opens
 * first. Until it does there is nowhere to stand.", with no heading of any level above it. A
 * screen reader's heading list came back empty, and a stranger who followed a link here was told
 * nothing about what Tessera is before being told it was shut.
 *
 * The states themselves stay as they are: `Empty`, `Failed` and the rest are also used mid-page,
 * inside sections that already have their own heading, and promoting their titles to `h1` there
 * would put two first-level headings on one screen.
 */
function Doorway({ children }: { children: ReactNode }) {
  return (
    <div className="tw-arrivals">
      <header className="tw-page-head">
        <h1>A world made by the people standing in it</h1>
        <p className="tw-page-head__meta">
          Tessera runs in a browser tab. Ground is claimed for nothing, you describe the things you
          want and they are made for you, and anything you make is yours to keep, stand up on your
          land, or sell to somebody else for EMBER.
        </p>
      </header>
      {children}
    </div>
  )
}

export function WorldPage() {
  const [params, setParams] = useSearchParams()
  const parcelId = params.get('parcel')

  const wards = useAsync(listWards, [], 'The wards could not be read.')

  // This is the estate's FRONT DOOR for Tessera — the index route, deliberately not behind
  // `ProtectedRoute` (see src/app.tsx and src/lib/routes.ts). Since the service authenticates its
  // reads, a stranger following a link here gets a 401, and until now the first and only thing
  // they saw was "That did not load". Checked before the generic failure for that reason.
  if (wards.notice?.unauthenticated)
    return (
      <Doorway>
        <SignedOut onSignIn={() => signIn()} />
      </Doorway>
    )
  if (wards.notice)
    return (
      <Doorway>
        <Failed notice={wards.notice} onRetry={wards.reload} />
      </Doorway>
    )
  if (wards.data === undefined)
    return (
      <Doorway>
        <Loading label="Finding the Mosaic" />
      </Doorway>
    )
  if (wards.data.wards.length === 0) {
    return (
      <Doorway>
        <Empty
          title="No neighbourhood has opened yet"
          hint="The first one is the Commons, and it has not been opened on this deployment. Nothing is broken and there is nothing to wait for — come back once it has."
        />
      </Doorway>
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
        {/*
          Not "Arrive". A one-word imperative on the front page of a product names the action the
          reader has already taken by being here, and says nothing about what they arrived at.
        */}
        <h1>Walk into a world other people built</h1>
        <p className="tw-page-head__meta">
          Any place with its gate open is a place you can walk straight into. There is no download
          and no installer, because you are standing in it. Tessera is one of the titles inside
          Forge Worlds, so the account you signed in with is the same account that plays Emberkin
          and Aetherholm, and what you own travels between all three.
        </p>
        <p className="tw-page-head__meta">
          Everything here is made by the people in it. You take ground for nothing, describe a
          thing until the Kiln fires it, put it down where visitors will find it, and sell it if
          somebody wants it. Payment is EMBER, which you can withdraw to a wallet you control — or
          mine yourself, in a browser tab, on a key that never leaves your machine.
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
        <Empty title="Nobody has taken anything in this ward" hint="Every tile of it is yours for the asking." />
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
          {placements.length.toLocaleString()} things standing here, out of the{' '}
          {parcel.objectCap.toLocaleString()} this parcel takes. That ceiling exists so the scene
          draws smoothly on an ordinary machine, and no amount of money raises it.
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
        The floor you are looking at is invented here in your browser from the ward&apos;s character,
        since the service keeps no terrain of its own. Treat it as scenery rather than something
        anybody owns. Nothing about it is recorded, and it gives way the day real ground arrives.
      </p>
    </div>
  )
}
