/**
 * Discovery: two signals, neither for sale.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE SHORTNESS IS THE POINT, AND THIS SCREEN IS ARRANGED TO MAKE IT CHECKABLE.
 *
 * §6.5: footfall (distinct accounts that entered, per day) and dwell (the median seconds those
 * accounts stayed). "That is the whole ranking function, and the shortness is the point. Dwell is
 * included because footfall alone rewards a doorway that tricks people in; dwell punishes it.
 * There is no third signal, and specifically there is no paid one — ever."
 *
 * So the table shows BOTH INPUTS AND THE SCORE, in columns, for every row. A feed that showed only
 * a rank would be a feed you have to trust; showing the inputs beside it means a reader can see
 * that the order follows from them — and would see it immediately if it stopped.
 *
 * And there is no sort control. Not "the sort control is disabled" — there is no parameter to
 * send: `discover(wardId?)` in lib/tessera.ts takes a ward filter and nothing else, and the
 * service's `rankParcels` "touches `visits` and `parcels` and nothing else; there is no join to
 * `entitlements`, no join to `listings`, and no `promoted` column to join to". §7.1's first
 * refusal: "no promoted placement, no paid ranking, no sponsored beacons, no boost. If Tessera
 * ever needs money badly enough to sell discovery, it needs to be shut down instead."
 *
 * `test/discovery.test.ts` asserts the absence: no request this page makes carries a query
 * parameter other than `wardId`.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useState } from 'react'
import { discover, listWards } from '../lib/tessera.ts'
import { useAsync } from '../lib/useAsync.ts'
import { Empty, Failed, Loading } from '../components/states.tsx'

export function DiscoverPage() {
  const [wardId, setWardId] = useState('')
  const wards = useAsync(listWards, [], 'The wards could not be read.')
  const feed = useAsync(
    () => discover(wardId === '' ? undefined : wardId),
    [wardId],
    'The feed could not be read.',
  )

  return (
    <div className="tw-discover">
      <header className="tw-page-head">
        <h1>Where people are going</h1>
        <p className="tw-page-head__meta">
          Ordered by footfall, dwell and recency, and by nothing else. Both inputs are in the table
          so you can see the order follows from them — no placement here has ever been bought, and
          none can be.
        </p>
      </header>

      <label className="tw-field tw-field--inline">
        <span className="tw-field__label">Ward</span>
        <select value={wardId} onChange={(e) => setWardId(e.target.value)}>
          <option value="">Everywhere</option>
          {(wards.data?.wards ?? []).map((ward) => (
            <option key={ward.id} value={ward.id}>
              {ward.name}
            </option>
          ))}
        </select>
      </label>

      {feed.notice && <Failed notice={feed.notice} onRetry={feed.reload} />}
      {!feed.notice && feed.data === undefined && <Loading label="Reading the feed" />}
      {feed.data?.parcels.length === 0 && (
        <Empty
          title="Nobody has been anywhere yet"
          hint="Footfall is counted when somebody walks into a parcel with its gate open."
        />
      )}

      {feed.data && feed.data.parcels.length > 0 && (
        <div className="tw-scroll">
          <table className="tw-table">
            <caption className="tw-visually-hidden">
              Parcels ranked by footfall and dwell, with both inputs shown
            </caption>
            <thead>
              <tr>
                <th scope="col">Parcel</th>
                <th scope="col">Kept by</th>
                <th scope="col">Footfall</th>
                <th scope="col">Median dwell</th>
                <th scope="col">Age</th>
                <th scope="col">Score</th>
              </tr>
            </thead>
            <tbody>
              {feed.data.parcels.map((row) => (
                <tr key={row.parcelId}>
                  <th scope="row" className="tw-mono">
                    {row.parcelId.slice(0, 8)}
                  </th>
                  <td>{row.ownerSubject}</td>
                  <td>{row.inputs.footfall} accounts</td>
                  <td>{row.inputs.medianDwell}s</td>
                  <td>{row.inputs.ageDays}d</td>
                  <td>{row.score.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="tw-footnote">
        Beacons light a Venue for an event. They are free, limited to three per parcel per seven
        days, and the limit cannot be raised by paying — a Beacon that could be bought would stop
        meaning anything.
      </p>
    </div>
  )
}
