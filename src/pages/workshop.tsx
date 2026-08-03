/**
 * The Workshop: what you have made, what you have listed, and what the platform takes.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE TERMS ARE SHOWN, AND THE CLIENT DOES NOT COMPUTE THEM.
 *
 * §7.2's fifth refusal: "The platform fee and the royalty cap are IDENTICAL FOR EVERY ACCOUNT,
 * and no SKU, tier or subscription reduces either. A subscription that cut your marketplace fee
 * would convert money directly into structural earning advantage over every creator who did not
 * buy it — which is compound, permanent, and exactly the thing §7.1 forbids."
 *
 * `GET /v1/terms` answers `{ platformFeeBps, maxRoyaltyBps, identicalForEveryAccount: true }` and
 * the service's own route carries the note: "The one set of terms, for everybody. There is no
 * `subject` parameter and there must not be." So this page CALLS a route that takes no subject
 * and PRINTS what it returns, including the flag.
 *
 * It does not derive `identicalForEveryAccount` from anything it knows. A client that computed
 * that claim from its own state would be a promise checking itself, which is the shape of every
 * self-referential assertion this estate has had to delete.
 *
 * ── The split is shown per listing, and it partitions ─────────────────────────────────────────
 *
 * `fee + royalty + proceeds === price` by construction: `bpsOf` rounds down deliberately in the
 * platform's disfavour and the seller's proceeds are the REMAINDER, so the identity holds by
 * subtraction rather than by three roundings agreeing. The service asserts it on every call and
 * Postgres asserts it again (`orders_partition`). This page shows all four numbers so a seller can
 * see it hold — which is a different thing from this client asserting that it does.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useRef, useState } from 'react'
import {
  createListing,
  getTerms,
  myListings,
  myObjects,
  type Listing,
  type WorldObject,
} from '../lib/tessera.ts'
import { noticeFor, type ErrorNotice } from '../lib/api.ts'
import { formatBps, formatSparks, parseAmount, sparksToWei } from '../lib/money.ts'
import { useAsync } from '../lib/useAsync.ts'
import { Empty, Failed, Loading } from '../components/states.tsx'

export function WorkshopPage() {
  const terms = useAsync(getTerms, [], 'The platform terms could not be read.')
  const listings = useAsync(myListings, [], 'Your listings could not be read.')
  const objects = useAsync(myObjects, [], 'Your objects could not be read.')

  return (
    <div className="tw-workshop">
      <header className="tw-page-head">
        <h1>Your Workshop</h1>
        <p className="tw-page-head__meta">
          A creator paid in Sparks is paid EMBER somebody else deposited. You can withdraw it to
          your own wallet the same afternoon.
        </p>
      </header>

      <section aria-labelledby="terms-heading" className="tw-terms">
        <h2 id="terms-heading">What the platform takes</h2>
        {terms.notice && <Failed notice={terms.notice} onRetry={terms.reload} />}
        {!terms.notice && terms.data === undefined && <Loading label="Reading the terms" />}
        {terms.data && (
          <dl className="tw-terms__list">
            <div>
              <dt>Platform fee</dt>
              <dd>{formatBps(terms.data.platformFeeBps)} of every sale</dd>
            </div>
            <div>
              <dt>Royalty cap</dt>
              <dd>{formatBps(terms.data.maxRoyaltyBps)}</dd>
            </div>
            <div>
              <dt>Who gets these rates</dt>
              {/*
                Printed from the flag the service sent, never derived. If micro-tessera ever stops
                sending `true`, this line says so — which is exactly what a rate that had quietly
                become per-account would look like from here.
              */}
              <dd>
                {terms.data.identicalForEveryAccount
                  ? 'Every account, identically. No SKU, tier or subscription reduces either.'
                  : 'The service is no longer stating that these rates are the same for everybody.'}
              </dd>
            </div>
          </dl>
        )}
      </section>

      <ListingForm
        objects={objects.data?.objects ?? []}
        maxRoyaltyBps={terms.data?.maxRoyaltyBps}
        onListed={listings.reload}
      />

      <section aria-labelledby="listings-heading">
        <h2 id="listings-heading">What you have listed</h2>
        {listings.notice && <Failed notice={listings.notice} onRetry={listings.reload} />}
        {!listings.notice && listings.data === undefined && <Loading label="Reading your listings" />}
        {listings.data?.listings.length === 0 && (
          <Empty title="You have listed nothing" hint="An object has to be fired before it can be sold." />
        )}
        {listings.data && listings.data.listings.length > 0 && (
          <ListingTable listings={listings.data.listings} />
        )}
      </section>
    </div>
  )
}

function ListingForm({
  objects,
  maxRoyaltyBps,
  onListed,
}: {
  objects: readonly WorldObject[]
  maxRoyaltyBps: number | undefined
  onListed: () => void
}) {
  const [objectId, setObjectId] = useState('')
  const [sparks, setSparks] = useState('')
  const [royaltyBps, setRoyaltyBps] = useState('500')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<ErrorNotice | null>(null)
  const [malformed, setMalformed] = useState<string | null>(null)

  /**
   * The in-flight latch. A REF, because `busy` cannot stop a double submit — see the long note on
   * the same latch in `src/pages/kiln.tsx`. `BJ-ADV-TES-02-H1` was written against this form and
   * reported **two listings** from two clicks in one tick.
   *
   * Two listings for one object is not merely untidy: the second is a live, buyable offer of a
   * thing the seller meant to sell once, at a price they set once.
   */
  const inFlight = useRef(false)

  // Only fired objects can be sold; a `firing` one has no bytes yet. This is not a business rule
  // being asserted — it is the list of things there is anything to sell.
  const sellable = objects.filter((o) => o.status === 'fired')

  const submit = (event: React.FormEvent): void => {
    event.preventDefault()
    if (inFlight.current) return

    // ════════════════════════════════════════════════════════════════════════════════════════
    // THE `BigInt('') === 0n` DOOR, SHUT ON THIS SIDE TOO.
    //
    // `sparksToWei` returns null for anything that is not a positive whole number, so a blank
    // field cannot become `'0'` and a listing cannot be created at a price of nothing. The
    // service's `parsePriceWei` requires `/^\d{1,78}$/` before BigInt as well; this is the second
    // of two doors, not the only one, and it exists so the failure is a sentence next to the
    // field rather than a 400 the user has to interpret.
    // ════════════════════════════════════════════════════════════════════════════════════════
    const priceWei = sparksToWei(sparks)
    if (priceWei === null) {
      setMalformed('A price is a whole number of Sparks, above zero.')
      return
    }
    setMalformed(null)
    // Latched HERE and not at the top of the handler: a malformed price returns above without
    // sending anything, and a latch taken before that check would never be released, leaving the
    // user with a form that has silently stopped submitting and no sentence saying why.
    inFlight.current = true
    setBusy(true)
    setNotice(null)
    createListing({ objectId, priceWei, royaltyBps: Number(royaltyBps) })
      .then(() => {
        setSparks('')
        onListed()
      })
      .catch((err: unknown) => setNotice(noticeFor(err, 'The listing was not accepted.')))
      .finally(() => {
        inFlight.current = false
        setBusy(false)
      })
  }

  return (
    <form className="tw-form" onSubmit={submit} aria-labelledby="list-heading">
      <h2 id="list-heading">List something for sale</h2>

      <label className="tw-field">
        <span className="tw-field__label">Object</span>
        <select value={objectId} onChange={(e) => setObjectId(e.target.value)} required>
          <option value="">Choose one of yours</option>
          {sellable.map((object) => (
            <option key={object.id} value={object.id}>
              {object.prompt.slice(0, 60)}
            </option>
          ))}
        </select>
      </label>

      <div className="tw-field-row">
        <label className="tw-field">
          <span className="tw-field__label">Price in Sparks</span>
          <input
            // `text`, not `number`. A number input hands back `''` for "1e5" and for "-" in
            // several browsers, which is the exact value that becomes 0n — and it lets the
            // browser's own stepper produce fractions this price cannot express. A text field
            // and one regex is fewer moving parts than a number field and four exceptions.
            type="text"
            inputMode="numeric"
            value={sparks}
            onChange={(e) => setSparks(e.target.value)}
            aria-describedby="price-help"
            required
          />
          <span id="price-help" className="tw-field__help">
            A Spark is one micro-EMBER. A common object is about 400.
          </span>
        </label>

        <label className="tw-field">
          <span className="tw-field__label">Royalty, basis points</span>
          <input
            type="number"
            min={0}
            max={10000}
            value={royaltyBps}
            onChange={(e) => setRoyaltyBps(e.target.value)}
            aria-describedby="royalty-help"
            required
          />
          <span id="royalty-help" className="tw-field__help">
            {/*
              The cap is DISPLAYED from `GET /v1/terms` and the input's max is 10000 — the wire's
              range, not the rule. The rule is enforced by the service and by a CHECK named
              `listings_terms_leave_the_seller_something`. Setting max to the cap here would be
              this client asserting the cap, and a test of that would pass against a service that
              had stopped enforcing it.
            */}
            {maxRoyaltyBps === undefined
              ? 'Paid on every resale, forever.'
              : `Paid on every resale, forever. The cap is ${formatBps(maxRoyaltyBps)}.`}
          </span>
        </label>
      </div>

      <p className="tw-form__note">
        Every listing here settles custodially, without exception. The royalty is enforced only on
        that path — an on-chain listing records a royalty on the order row and never posts it — so
        custodial is the only mode in which the royalty exists at all. There is no control on this
        form that could choose the other one.
      </p>

      <button type="submit" className="tw-button" disabled={busy}>
        {busy ? 'Listing…' : 'List it'}
      </button>

      {malformed && (
        <p className="tw-form__error" role="alert">
          {malformed}
        </p>
      )}
      {notice && (
        <p className="tw-form__error" role="alert">
          {notice.message}
          {notice.requestId ? ` (request ${notice.requestId})` : ''}
        </p>
      )}
    </form>
  )
}

function ListingTable({ listings }: { listings: readonly Listing[] }) {
  return (
    <div className="tw-scroll">
      <table className="tw-table">
        <caption className="tw-visually-hidden">
          Your listings, with the fee, royalty and proceeds each price splits into
        </caption>
        <thead>
          <tr>
            <th scope="col">Object</th>
            <th scope="col">Price</th>
            <th scope="col">Platform fee</th>
            <th scope="col">Royalty</th>
            <th scope="col">You receive</th>
            <th scope="col">Settles</th>
            <th scope="col">State</th>
          </tr>
        </thead>
        <tbody>
          {listings.map((listing) => (
            <tr key={listing.id}>
              <th scope="row" className="tw-mono">
                {listing.objectId.slice(0, 8)}
              </th>
              {/*
                Parsed through `parseAmount`, which refuses anything that is not 1–78 digits, so a
                malformed field from the wire is a loud throw rather than a silent zero on a screen
                about somebody's earnings.
              */}
              <td>{formatSparks(parseAmount(listing.priceWei, 'priceWei'))}</td>
              <td>{formatSparks(parseAmount(listing.split.feeWei, 'feeWei'))}</td>
              <td>{formatSparks(parseAmount(listing.split.royaltyWei, 'royaltyWei'))}</td>
              <td>{formatSparks(parseAmount(listing.split.proceedsWei, 'proceedsWei'))}</td>
              <td>{listing.settlementMode}</td>
              <td>{listing.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
