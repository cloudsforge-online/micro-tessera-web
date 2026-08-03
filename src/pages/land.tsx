/**
 * Your parcels, the fallow clock on each, and the form that claims free ground.
 *
 * ── Three things this page deliberately does not do ───────────────────────────────────────────
 *
 * 1. **It shows no price and has no payment step.** §4: land is claimed free and the platform
 *    never sells it. `POST /v1/parcels` takes `wardId`, `tier`, `originX`, `originY` and nothing
 *    else — there is no field here that could grow into one.
 *
 * 2. **It does not compute the fallow state.** `parcel.fallowState` arrives decided, computed
 *    lazily on read from `(lastFootfallAt, lastEditAt, bankedUntil)` against the DATABASE'S clock
 *    (§11.4). A client that counted 90 days from a timestamp would be doing domain arithmetic on
 *    a clock the server does not trust, and would disagree with it for every user whose machine
 *    is wrong — which, for a rule that takes somebody's land away, is not an acceptable class of
 *    disagreement.
 *
 * 3. **It does not refuse a claim.** The Homestead is one per account and a second is
 *    UNREPRESENTABLE — a partial unique index, not a validator (§11.6). So the form offers the
 *    tier, sends it, and renders whatever the database says. Hiding the option would be a client
 *    asserting a business rule, and a client-side test of the hidden option would pass against a
 *    service that had quietly stopped enforcing it.
 */
import { useState } from 'react'
import {
  bankParcel,
  claimParcel,
  listWards,
  myParcels,
  setParcelFlags,
  type Parcel,
  type Tier,
} from '../lib/tessera.ts'
import { noticeFor, type ErrorNotice } from '../lib/api.ts'
import { useAsync } from '../lib/useAsync.ts'
import { Empty, Failed, Loading } from '../components/states.tsx'

const TIERS: readonly { tier: Tier; label: string; note: string }[] = [
  { tier: 'homestead', label: 'Homestead — 16×16', note: 'One per account, free, never fallow, never tradeable.' },
  { tier: 'plot', label: 'Plot — 32×32', note: 'Free to claim. Held by liveliness, not by rent.' },
  { tier: 'court', label: 'Court — 64×64', note: 'Free to claim. Counts against your Deed Slots.' },
  { tier: 'quarter', label: 'Quarter — 128×128', note: 'Free to claim. Counts against your Deed Slots.' },
]

/** What the fallow clock means, in words, for each state the service can return. */
const FALLOW_COPY: Record<string, string> = {
  live: 'Live.',
  banked: 'Banked — the clock is extended to 270 days.',
  fallow: 'Fallow — no visitor and no edit for 90 days. Contestable after a further 30.',
  contestable: 'Contestable — anyone may claim this now.',
}

export function LandPage() {
  const parcels = useAsync(myParcels, [], 'Your parcels could not be read.')
  const wards = useAsync(listWards, [], 'The wards could not be read.')

  return (
    <div className="tw-land">
      <header className="tw-page-head">
        <h1>Your land</h1>
        <p className="tw-page-head__meta">
          Ground is claimed, never bought — the platform sells no land at any tier. What holds a
          parcel is that people come to it.
        </p>
      </header>

      <ClaimForm
        wards={wards.data?.wards ?? []}
        wardsFailed={wards.notice}
        onClaimed={parcels.reload}
      />

      {parcels.notice && <Failed notice={parcels.notice} onRetry={parcels.reload} />}
      {!parcels.notice && parcels.data === undefined && <Loading label="Reading your deeds" />}
      {parcels.data?.parcels.length === 0 && (
        <Empty
          title="You hold no ground yet"
          hint="A Homestead is free, one per account, and nobody can ever take it. Claim one above."
        />
      )}
      {parcels.data && parcels.data.parcels.length > 0 && (
        <ParcelList parcels={parcels.data.parcels} onChanged={parcels.reload} />
      )}
    </div>
  )
}

function ClaimForm({
  wards,
  wardsFailed,
  onClaimed,
}: {
  wards: readonly { id: string; name: string }[]
  wardsFailed: ErrorNotice | null
  onClaimed: () => void
}) {
  const [wardId, setWardId] = useState('')
  const [tier, setTier] = useState<Tier>('homestead')
  const [originX, setOriginX] = useState('0')
  const [originY, setOriginY] = useState('0')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<ErrorNotice | null>(null)
  const [claimed, setClaimed] = useState<Parcel | null>(null)

  const submit = (event: React.FormEvent): void => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setNotice(null)
    setClaimed(null)
    claimParcel({ wardId, tier, originX: Number(originX), originY: Number(originY) })
      .then((res) => {
        setClaimed(res.parcel)
        onClaimed()
      })
      .catch((err: unknown) =>
        // The refusal the user is most likely to meet is a second Homestead, and it comes from a
        // partial unique index rather than from a validator. Whatever sentence the service sends
        // is the sentence shown — this client does not translate a database error into a guess
        // about which rule was broken.
        setNotice(noticeFor(err, 'The claim was not accepted.')),
      )
      .finally(() => setBusy(false))
  }

  return (
    <form className="tw-form" onSubmit={submit} aria-labelledby="claim-heading">
      <h2 id="claim-heading">Claim free ground</h2>

      {wardsFailed && (
        <p className="tw-form__error" role="alert">
          The wards could not be read, so there is nothing to claim in. {wardsFailed.message}
        </p>
      )}

      <label className="tw-field">
        <span className="tw-field__label">Ward</span>
        <select value={wardId} onChange={(e) => setWardId(e.target.value)} required>
          <option value="">Choose a ward</option>
          {wards.map((ward) => (
            <option key={ward.id} value={ward.id}>
              {ward.name}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="tw-field">
        <legend className="tw-field__label">Tier</legend>
        {TIERS.map((option) => (
          <label key={option.tier} className="tw-radio">
            <input
              type="radio"
              name="tier"
              value={option.tier}
              checked={tier === option.tier}
              onChange={() => setTier(option.tier)}
            />
            <span>
              {option.label} <span className="tw-muted">{option.note}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="tw-field-row">
        <label className="tw-field">
          <span className="tw-field__label">Origin X</span>
          <input
            type="number"
            min={0}
            max={255}
            value={originX}
            onChange={(e) => setOriginX(e.target.value)}
            required
          />
        </label>
        <label className="tw-field">
          <span className="tw-field__label">Origin Y</span>
          <input
            type="number"
            min={0}
            max={255}
            value={originY}
            onChange={(e) => setOriginY(e.target.value)}
            required
          />
        </label>
      </div>

      <p className="tw-form__note">
        There is no price on this form and no payment step, because there is no price. The platform
        takes its ordinary fee when a parcel is traded between players and never mints supply for
        money.
      </p>

      <button type="submit" className="tw-button" disabled={busy}>
        {busy ? 'Claiming…' : 'Claim this ground'}
      </button>

      {notice && (
        <p className="tw-form__error" role="alert">
          {notice.message}
          {notice.requestId ? ` (request ${notice.requestId})` : ''}
        </p>
      )}
      {claimed && (
        <p className="tw-form__ok" role="status">
          Claimed. A {claimed.tier} of {claimed.tiles.toLocaleString()} tiles, holding up to{' '}
          {claimed.objectCap.toLocaleString()} objects.
        </p>
      )}
    </form>
  )
}

function ParcelList({ parcels, onChanged }: { parcels: readonly Parcel[]; onChanged: () => void }) {
  return (
    <div className="tw-scroll">
      <table className="tw-table">
        <caption className="tw-visually-hidden">Your parcels and the fallow clock on each</caption>
        <thead>
          <tr>
            <th scope="col">Tier</th>
            <th scope="col">Where</th>
            <th scope="col">Object cap</th>
            <th scope="col">Gate</th>
            <th scope="col">Fallow</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {parcels.map((parcel) => (
            <ParcelRow key={parcel.id} parcel={parcel} onChanged={onChanged} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ParcelRow({ parcel, onChanged }: { parcel: Parcel; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<ErrorNotice | null>(null)

  const act = (work: () => Promise<unknown>, fallback: string): void => {
    if (busy) return
    setBusy(true)
    setNotice(null)
    work()
      .then(onChanged)
      .catch((err: unknown) => setNotice(noticeFor(err, fallback)))
      .finally(() => setBusy(false))
  }

  return (
    <tr>
      <th scope="row">
        {parcel.tier}
        {parcel.commissioned && (
          // §8.6: commissioned parcels are "labelled as commissioned, publicly, on the parcel
          // itself". That is the platform saying it paid for this, in the one place it matters.
          <span className="tw-badge"> commissioned</span>
        )}
      </th>
      <td>
        {parcel.originX}, {parcel.originY} — {parcel.size}×{parcel.size}
      </td>
      <td>{parcel.objectCap.toLocaleString()}</td>
      <td>{parcel.gateOpen ? 'Open' : 'Shut'}</td>
      <td>{FALLOW_COPY[parcel.fallowState] ?? parcel.fallowState}</td>
      <td>
        <button
          type="button"
          className="tw-button tw-button--quiet"
          disabled={busy}
          onClick={() =>
            act(
              () => setParcelFlags(parcel.id, { gateOpen: !parcel.gateOpen }),
              'The gate could not be changed.',
            )
          }
        >
          {parcel.gateOpen ? 'Shut the gate' : 'Open the gate'}
        </button>
        {/*
          Banking is offered on every non-Homestead parcel, including one the service will refuse
          because it has been banked this year already. The refusal is the service's — a client
          that hid the button would be counting a year on its own clock.
        */}
        {parcel.tier !== 'homestead' && (
          <button
            type="button"
            className="tw-button tw-button--quiet"
            disabled={busy}
            onClick={() => act(() => bankParcel(parcel.id), 'This parcel could not be banked.')}
          >
            Bank this parcel
          </button>
        )}
        {notice && (
          <span className="tw-inline-error" role="alert">
            {notice.message}
          </span>
        )}
      </td>
    </tr>
  )
}
