/**
 * Money, which is `bigint` here and a decimal string on the wire — and never a `Number`.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * `BigInt('')` IS `0n`, AND THAT IS THE WHOLE REASON THIS FILE EXISTS.
 *
 * An empty string silently becomes zero. On a form that lists an object for sale, that is a free
 * purchase. On a screen showing somebody's earnings, it is displaying nothing as if it were
 * something — which is worse than an error, because an error is visible.
 *
 * `micro-market` makes the hazard UNREACHABLE rather than handled: `parseAmount` requires
 * `/^\d{1,78}$/` BEFORE calling `BigInt` (`market/src/money.ts`), and `micro-tessera`'s
 * `parsePriceWei` does the same on its side of the wire. This file is the third copy of that one
 * idea, on the browser's side, and it is a copy rather than an import because
 * `@cloudsforge/contracts-money` is not a dependency any frontend in this estate carries.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── Sparks, which is a denomination and not a currency ────────────────────────────────────────
 *
 * §8.1, and it is the most important sentence in that section:
 *
 *   > **Sparks is a display denomination of EMBER. It is not a second `assetCode`, and it must
 *   > never become one.**
 *
 * A Spark is 10⁻⁶ EMBER — one micro-EMBER, exactly 10¹² wei. So this module converts for DISPLAY
 * and there is deliberately no function here that produces a Sparks value to send anywhere: every
 * amount that leaves this client leaves in wei. If Sparks were ever a thing the wire carried, the
 * ledger's per-asset balancing trigger would let Sparks and EMBER drift apart, and reconciling
 * them would need a rate — which is the mechanism of the estate's oldest defect, the
 * `convertCoinToEmber` path that credits custodial EMBER with no on-chain movement behind it.
 */

/** Wei in one Spark. §8.1: "exactly 10¹² wei". */
export const WEI_PER_SPARK = 1_000_000_000_000n

/** Wei in one EMBER. 18 decimals (`contracts/packages/chain/src/index.ts`). */
export const WEI_PER_EMBER = 1_000_000_000_000_000_000n

export class AmountError extends RangeError {
  constructor(what: string, value: unknown) {
    super(`${what} is not a decimal amount: ${describe(value)}`)
    this.name = 'AmountError'
  }
}

/**
 * A value, safely, for an error message.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * `JSON.stringify(1n)` THROWS `TypeError: Do not know how to serialize a BigInt`.
 *
 * This constructor used to call `JSON.stringify` directly, and `test/money.test.ts` caught it by
 * passing a `bigint` among the values `parseAmount` must refuse. A `bigint` is exactly what a
 * caller who has already parsed an amount once would pass by mistake — so the failure mode was:
 * the guard against a silent zero raises a DIFFERENT error, from inside its own error path, and
 * whatever the caller was told is not that the amount was malformed.
 *
 * An error message that can throw is worse than no error message, because it replaces a
 * diagnosable failure with an undiagnosable one at the exact moment something is already wrong.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
function describe(value: unknown): string {
  if (typeof value === 'bigint') return `${value}n`
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return Object.prototype.toString.call(value)
  }
}

/**
 * A wire decimal string → `bigint`, or a throw.
 *
 * The pattern is checked before `BigInt` is called, not after. `BigInt` accepts `''` (0n),
 * `' 12 '` (12n), `'0x10'` (16n) and `'1e3'` throws — four different behaviours across four
 * inputs a malformed payload can easily contain. Deciding the answer with a regex first means
 * exactly one of those is accepted.
 *
 * 78 digits because ledger amounts are `numeric(78,0)`, "chosen precisely because 78 digits holds
 * any uint256" (`ledger/src/migrations.ts`).
 */
export function parseAmount(value: unknown, what: string): bigint {
  if (typeof value !== 'string' || !/^\d{1,78}$/.test(value)) throw new AmountError(what, value)
  return BigInt(value)
}

/**
 * The same, but for a value that is allowed to be absent — a field the service has not sent.
 *
 * Returns `null`, NEVER `0n`. That distinction is the whole point of this function: a balance
 * that has not arrived and a balance of zero look identical once both are numbers, and one of
 * them is a statement about somebody's money that this client is not entitled to make.
 */
export function parseAmountOrNull(value: unknown, what: string): bigint | null {
  if (value === undefined || value === null || value === '') return null
  return parseAmount(value, what)
}

/** Wei → whole Sparks, truncating. Display only. */
export function toSparks(wei: bigint): bigint {
  return wei / WEI_PER_SPARK
}

/** Group a decimal string: `'1234567'` → `'1,234,567'`. String in, string out — no `Number`. */
export function groupDigits(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** `12480n` → `'12,480 Sparks'`. The unit is in the string because §8.2 shows three of them. */
export function formatSparks(wei: bigint): string {
  return `${groupDigits(toSparks(wei).toString())} Sparks`
}

/**
 * A user-typed price → wei, or `null` if it is not a price.
 *
 * ── The floor is a whole Spark, and this client refuses BEFORE the database does ─────────────
 *
 * §8.1: every in-world price carries `CHECK (price_wei % 1000000000000 = 0)` — no price finer
 * than one Spark. The CHECK is the enforcement and this is not: this is the form declining to
 * submit something it can see the shape of, which is a different thing from asserting a rule.
 * The distinction matters and is worth being precise about — a frontend must not assert business
 * rules, and the rule here is not "prices are whole Sparks", it is "a price is a whole number".
 * The client is refusing to build a malformed REQUEST, not refusing a legal one.
 *
 * If the service later permits sub-Spark prices, this function starts sending them the moment the
 * input allows a decimal point, and nothing here has to be found and deleted.
 */
export function sparksToWei(input: string): string | null {
  const trimmed = input.trim().replace(/,/g, '')
  if (!/^\d{1,60}$/.test(trimmed)) return null
  const sparks = BigInt(trimmed)
  if (sparks <= 0n) return null
  return (sparks * WEI_PER_SPARK).toString()
}

/**
 * Basis points → a percentage string. `250` → `'2.5%'`.
 *
 * Integer arithmetic on the way through, because 250/10000 in floating point is 0.025 and
 * `0.025 * 100` is `2.5000000000000004`. That is harmless here and would not be somewhere else,
 * and there is no reason to have two habits.
 */
export function formatBps(bps: number): string {
  const whole = Math.trunc(bps / 100)
  const frac = Math.abs(bps % 100)
  return frac === 0 ? `${whole}%` : `${whole}.${String(frac).padStart(2, '0').replace(/0$/, '')}%`
}
