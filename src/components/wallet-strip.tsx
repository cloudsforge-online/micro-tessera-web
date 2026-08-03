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
 * ── AND micro-tessera SERVES NONE OF THEM ─────────────────────────────────────────────────────
 *
 * There is no balance route. `tessera/src/ledgerclient.ts` exists and posts entries; no read route
 * hangs off it. So this strip renders the three labels, the sentence that distinguishes them, and
 * an explicit "not available yet" — and it renders NO NUMBER.
 *
 * That is the whole point of this component existing now rather than later. The two ways to fill
 * a figure you do not have are both worse than an empty one:
 *
 *   - A zero. `BigInt('')` is `0n`, so an absent field becomes a zero without anybody writing the
 *     word. On a screen showing somebody's earnings that is displaying nothing as if it were
 *     something — a person who has been paid 3,200 Sparks reading "0 Sparks" and concluding they
 *     were not. `parseAmountOrNull` in lib/money.ts returns null rather than 0n precisely here.
 *   - A dash with no explanation, which reads as "you have none" to everyone who does not know
 *     the route is missing.
 *
 * So it says which figure is missing and why, and two tests in `test/screens.test.ts` hold it:
 * "the wallet strip prints no digit while the balance route does not exist" (line 362) asserts the
 * absence with force, the way `admin-web` asserts its missing og card, and "a real zero balance
 * reads as zero, and an absent one does not" (line 390) asserts the distinction the `wei === null`
 * check below exists for. This comment used to cite `test/wallet-strip.test.ts`, which has never
 * existed — a citation that read as verification and pointed at nothing.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import { MISSING_ROUTES } from '../lib/tessera.ts'
import { formatSparks } from '../lib/money.ts'

export interface Balances {
  /** Spendable now. `user:<id> / EMBER / available`. */
  readonly availableWei: bigint | null
  /** Yours, releasing when the dispute window closes. `payout_due`. */
  readonly clearingWei: bigint | null
  /** On chain and not yet 60 deep. From the INDEXER, in no balance and no total. */
  readonly confirming: { readonly wei: bigint; readonly at: number; readonly of: number } | null
}

/** The route whose absence this component is built around. Named so a test can find it. */
export const BALANCES_ROUTE = 'GET /v1/me/balances'

export function WalletStrip({ balances }: { balances?: Balances | undefined }) {
  const gap = MISSING_ROUTES.find((r) => r.want === BALANCES_ROUTE)

  return (
    <section className="tw-wallet" aria-label="Your EMBER">
      <Figure
        name="Available"
        meaning="Spendable now."
        wei={balances?.availableWei ?? null}
      />
      <Figure
        name="Clearing"
        meaning="Yours, releasing when the dispute window closes."
        wei={balances?.clearingWei ?? null}
      />
      <div className="tw-wallet__figure">
        <dt className="tw-wallet__name">Confirming</dt>
        <dd className="tw-wallet__value">
          {balances?.confirming
            ? `${formatSparks(balances.confirming.wei)} — ${balances.confirming.at} of ${balances.confirming.of}`
            : 'Not available yet'}
        </dd>
        {/*
          Stated on screen, not just in a comment. §8.2: an unconfirmed deposit "is in no balance
          and no total". A user who cannot see that rule being followed has to trust it; a user who
          can read it can check it.
        */}
        <dd className="tw-wallet__note">On chain, not yours yet — and in no total above.</dd>
      </div>

      {gap && (
        <p className="tw-wallet__gap" role="status">
          These figures are not being shown because <code>{gap.want}</code> does not exist yet in
          micro-tessera. Nothing here is a zero: a zero would be a claim about your money that this
          client cannot make.
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
