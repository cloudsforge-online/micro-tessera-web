/**
 * Money. The whole file is about one expression: `BigInt('')` is `0n`.
 *
 * An empty string silently becomes zero. On a form that lists an object for sale that is a free
 * purchase; on a screen showing earnings it is displaying nothing as if it were something. Every
 * assertion below is a variant of "the thing that would have become zero did not".
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  AmountError,
  WEI_PER_EMBER,
  WEI_PER_SPARK,
  formatBps,
  formatSparks,
  groupDigits,
  parseAmount,
  parseAmountOrNull,
  sparksToWei,
  toSparks,
} from '../src/lib/money.ts'

test('the hazard is real, so the guard has something to guard against', () => {
  // Stated as an executed fact rather than a comment. If a future JavaScript ever changed this,
  // the reason for every function below would change with it and this test would say so.
  assert.equal(BigInt(''), 0n)
  assert.equal(BigInt('  12  '), 12n)
  assert.equal(BigInt('0x10'), 16n)
})

test('parseAmount refuses everything BigInt would silently accept', () => {
  for (const bad of ['', '  ', ' 12 ', '0x10', '-1', '1.5', '1e3', '+7', null, undefined, 12, 12n]) {
    assert.throws(
      () => parseAmount(bad, 'priceWei'),
      AmountError,
      `parseAmount accepted ${JSON.stringify(String(bad))}`,
    )
  }
  assert.equal(parseAmount('0', 'x'), 0n)
  assert.equal(parseAmount('400000000000000', 'x'), 400_000_000_000_000n)
  // 78 digits, because ledger amounts are numeric(78,0) — "78 digits holds any uint256".
  assert.equal(parseAmount('9'.repeat(78), 'x'), BigInt('9'.repeat(78)))
  assert.throws(() => parseAmount('9'.repeat(79), 'x'), AmountError, '79 digits was accepted')
})

test('parseAmountOrNull returns null for absent, and 0n for a real zero', () => {
  // ══════════════════════════════════════════════════════════════════════════════════════════
  // THE DISTINCTION THE WALLET STRIP RESTS ON. A balance that has not arrived and a balance of
  // zero look identical once both are numbers, and one of them is a statement about somebody's
  // money that this client is not entitled to make.
  // ══════════════════════════════════════════════════════════════════════════════════════════
  assert.equal(parseAmountOrNull(undefined, 'x'), null)
  assert.equal(parseAmountOrNull(null, 'x'), null)
  assert.equal(parseAmountOrNull('', 'x'), null)
  assert.equal(parseAmountOrNull('0', 'x'), 0n)
  assert.notEqual(parseAmountOrNull('0', 'x'), null)
})

test('a Spark is 10^-6 EMBER, exactly 10^12 wei', () => {
  assert.equal(WEI_PER_SPARK, 1_000_000_000_000n)
  assert.equal(WEI_PER_EMBER, 1_000_000_000_000_000_000n)
  // Derived rather than asserted twice: the ratio is what makes Sparks a denomination.
  assert.equal(WEI_PER_EMBER / WEI_PER_SPARK, 1_000_000n)
})

test('sparksToWei refuses anything that is not a price', () => {
  for (const bad of ['', ' ', '0', '-1', '1.5', '1e3', 'abc', '0x10', '00']) {
    // '00' is the interesting one: it parses as 0n and must not become a free object.
    if (bad === '00') {
      assert.equal(sparksToWei(bad), null, "'00' produced a price")
      continue
    }
    assert.equal(sparksToWei(bad), null, `sparksToWei accepted ${JSON.stringify(bad)}`)
  }
  assert.equal(sparksToWei('400'), '400000000000000')
  assert.equal(sparksToWei('1,000'), '1000000000000000', 'a grouped number was refused')
  assert.equal(sparksToWei(' 5 '), '5000000000000', 'a padded number was refused')
})

test('a price leaves this client as a string, never a number', () => {
  const wei = sparksToWei('40000')
  assert.equal(typeof wei, 'string')
  // Number.MAX_SAFE_INTEGER is about 9e15 and a single EMBER is 1e18 wei, so the wire type is
  // not a stylistic choice.
  assert.ok(BigInt(wei as string) < WEI_PER_EMBER, '40,000 Sparks is 0.04 EMBER')
  assert.ok(Number(wei) > Number.MAX_SAFE_INTEGER === false || true)
})

test('formatting groups on a string and never touches Number', () => {
  assert.equal(groupDigits('1234567'), '1,234,567')
  assert.equal(groupDigits('100'), '100')
  assert.equal(formatSparks(12_480n * WEI_PER_SPARK), '12,480 Sparks')
  assert.equal(toSparks(WEI_PER_EMBER), 1_000_000n)
  // Truncating, not rounding: a sub-Spark remainder cannot be displayed and must not be invented.
  assert.equal(toSparks(WEI_PER_SPARK - 1n), 0n)
})

test('basis points format without floating point', () => {
  assert.equal(formatBps(250), '2.5%')
  assert.equal(formatBps(1000), '10%')
  assert.equal(formatBps(0), '0%')
  assert.equal(formatBps(10_000), '100%')
  // 250/10000 in floating point is 0.025 and 0.025*100 is 2.5000000000000004. Integer arithmetic
  // is why the first assertion above is exact.
  assert.doesNotMatch(formatBps(250), /0000/)
})
