/**
 * The three-figure wallet strip, and the fact that it currently has no numbers to print.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * §8.2 SPECIFIES THREE FIGURES THAT MEAN THREE DIFFERENT THINGS:
 *
 *     Available    12,480 Sparks    spendable now
 *     Clearing      3,200 Sparks    yours, releasing when the dispute window closes
 *     Confirming    5,000 Sparks    on chain, 34/60 — not yours yet, and not in any total
 *
 * Available is `user:<id> / EMBER / available`. Clearing is `payout_due`, which is a real balance
 * in a real account and is structurally unspendable — nothing debits it but the release, and a
 * spend attempt would be an overdraft `ledger_assert_no_overdraft` refuses. Confirming is NOT a
 * ledger balance and MUST NEVER BE: posting a liability before 60 confirmations is
 * `convertCoinToEmber` again, the estate's oldest defect — "a liability minted against nothing,
 * with no counter-account and therefore nothing that could ever notice".
 *
 * ── THE ROUTE LANDED. THE REFUSAL DID NOT MOVE ────────────────────────────────────────────────
 *
 * `GET /v1/me/balances` now exists, and this strip calls it. It was in `MISSING_ROUTES` and
 * `citations.test.ts` went red the day it appeared — which is that mechanism doing its job rather
 * than a test that needed relaxing.
 *
 * What has not changed is what happens when there is no figure to print. The service's own handler
 * answers **503 with no figures, never a `0`**, on the stated grounds that "a player looking at
 * their own earnings must never be shown a confident zero that means 'we did not ask'". So an
 * empty strip is still a correct strip, and it is reached by a different road: not "the route does
 * not exist" but "the route declined to guess".
 *
 * Two of the three figures come from the ledger. **Confirming does not and must not** — an
 * observed-but-unconfirmed deposit is not a ledger balance, and posting one is `convertCoinToEmber`
 * again. It is in no balance and no total, and it stays unavailable here until the indexer is
 * reachable from this surface.
 *
 * That is the whole point of this component. The two ways to fill a figure you do not have are
 * both worse than an empty one:
 *
 *   - A zero. `BigInt('')` is `0n`, so an absent field becomes a zero without anybody writing the
 *     word. On a screen showing somebody's earnings that is displaying nothing as if it were
 *     something — a person who has been paid 3,200 Sparks reading "0 Sparks" and concluding they
 *     were not. `parseAmountOrNull` in lib/money.ts returns null rather than 0n precisely here.
 *   - A dash with no explanation, which reads as "you have none" to everyone who does not know
 *     the route is missing.
 *
 * So it says which figure is missing and why, and `test/screens.test.ts` holds it: "a 503 from the
 * balance route prints no digit" asserts the absence with force, the way `admin-web` asserts its
 * missing og card, and "a real zero balance reads as zero, and an absent one does not" asserts the
 * distinction the `wei === null` check below exists for. This comment used to cite
 * `test/wallet-strip.test.ts`, which has never existed — a citation that read as verification and
 * pointed at nothing.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import { myBalances } from '../lib/tessera.ts'
import { parseAmount, formatSparks } from '../lib/money.ts'
import { useAsync } from '../lib/useAsync.ts'

export interface Balances {
  /** Spendable now. `user:<id> / EMBER / available`. */
  readonly availableWei: bigint | null
  /** Yours, releasing when the dispute window closes. `payout_due`. */
  readonly clearingWei: bigint | null
  /** On chain and not yet 60 deep. From the INDEXER, in no balance and no total. */
  readonly confirming: { readonly wei: bigint; readonly at: number; readonly of: number } | null
}

/** The route this component reads. Named so a test can find it without retyping the path. */
export const BALANCES_ROUTE = 'GET /v1/me/balances'

export function WalletStrip({ balances }: { balances?: Balances | undefined }) {
  // The prop wins when it is given, so a scenario can drive a figure this component would
  // otherwise have to arrange over the wire. When it is absent the route is read.
  const read = useAsync(
    myBalances,
    [],
    'Your balances are unavailable — this is not a balance of zero.',
  )
  const live: Balances | undefined =
    balances ??
    (read.data
      ? {
          // `parseAmount`, which refuses anything that is not 1–78 digits, rather than `BigInt`.
          // A malformed figure from the wire is a loud throw and never a silent `0n` on a screen
          // about somebody's earnings — the `BigInt('') === 0n` door, shut on the read side too.
          availableWei: parseAmount(read.data.balances.availableWei, 'availableWei'),
          clearingWei: parseAmount(read.data.balances.payoutDueWei, 'payoutDueWei'),
          // The ledger cannot answer this one and the route does not pretend to. §8.2.
          confirming: null,
        }
      : undefined)

  // Not `read.notice`: a strip that has not answered YET must also print no digit, and the two
  // are the same on screen for the same reason. `undefined` is the state both leave `live` in.
  const unavailable = live === undefined

  return (
    <section className="tw-wallet" aria-label="Your EMBER">
      <Figure name="Available" meaning="Spendable now." wei={live?.availableWei ?? null} />
      <Figure
        name="Clearing"
        meaning="Yours, releasing when the dispute window closes."
        wei={live?.clearingWei ?? null}
      />
      <div className="tw-wallet__figure">
        <dt className="tw-wallet__name">Confirming</dt>
        <dd className="tw-wallet__value">
          {live?.confirming
            ? `${formatSparks(live.confirming.wei)} — ${live.confirming.at} of ${live.confirming.of}`
            : 'Not available yet'}
        </dd>
        {/*
          Stated on screen, not just in a comment. §8.2: an unconfirmed deposit "is in no balance
          and no total". A user who cannot see that rule being followed has to trust it; a user who
          can read it can check it.
        */}
        <dd className="tw-wallet__note">On chain, not yours yet — and in no total above.</dd>
      </div>

      {unavailable && (
        <p className="tw-wallet__gap" role="status">
          {/*
            `role="status"` and not `alert`. An unconfigured ledger is a supported state of this
            estate rather than something going wrong, and it is the state every environment without
            LEDGER_URL is in. Retrying will not change it.

            The sentence says WHICH figures and WHY there is no number, because "—" reads as "you
            have none" to everybody who does not know the route answered 503.
          */}
          These figures are not being shown: <code>{BALANCES_ROUTE}</code> did not answer with any.
          Nothing here is a zero — a zero would be a claim about your money that this client cannot
          make, and the service refuses to make it either.
          {read.notice ? ` ${read.notice.message}` : ''}
        </p>
      )}
    </section>
  )
}

function Figure({
  name,
  meaning,
  wei,
}: {
  name: string
  meaning: string
  wei: bigint | null
}) {
  return (
    <div className="tw-wallet__figure">
      <dt className="tw-wallet__name">{name}</dt>
      {/*
        `wei === null` rather than `!wei`, and the distinction is the whole file: `!0n` is true, so
        the falsy check would render "Not available yet" for somebody whose balance really is zero
        — telling a user with no money that the service is broken, and a user the service cannot
        answer for that they have none. Two different wrong answers from one lazy operator.
      */}
      <dd className="tw-wallet__value">{wei === null ? 'Not available yet' : formatSparks(wei)}</dd>
      <dd className="tw-wallet__note">{meaning}</dd>
    </div>
  )
}
