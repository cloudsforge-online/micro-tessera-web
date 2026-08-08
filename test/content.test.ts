/**
 * EMBER has no monetary value, and no copy in this bundle may say otherwise.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE RULE, AND WHERE IT COMES FROM
 *
 * `docs/ecosystem/18-build-status.md:38` records it for both networks: EMBER has no market, no
 * listing, no liquidity and no price. `docs/ecosystem/32-roadmap-ui-and-content.md` §1.4 turns
 * that into a constraint on copy — "No copy may state or imply that EMBER is worth money, may be
 * sold for money, or is priced at anything" — and §4.1 names this repository as the estate's only
 * violation of it, at P1, ahead of every other item in that track.
 *
 * Three sentences were live on this surface until today:
 *
 *   1. `workshop.tsx` page head — "real EMBER … It is money, not points: take it out to a wallet
 *      you control the same afternoon". A monetary-value claim the ledger denies, plus a
 *      settlement-timing commitment that nothing on this deployment measures. Neither could have
 *      been retracted by evidence, because no evidence for either was ever collected.
 *   2. `workshop.tsx` price help — "Ordinary things go for around 400 of them". A price anchor
 *      with no distribution behind it. There are no sale prices for 400 to be near: nobody
 *      outside the project has used any of this (18-build-status.md:50), and the split table
 *      directly below that form already shows a seller how any price they choose divides, which
 *      is the honest version of the guidance the anchor was reaching for.
 *   3. `world.tsx` page head — the milder form, "sell it if somebody wants it. Payment is EMBER,
 *      which you can withdraw", which left the reader to finish the sentence.
 *
 * Deleting the three sentences fixes today. This file is what stops them being retyped, because a
 * claim like "it is money, not points" is not a bug anybody notices in review — it is a good
 * sentence, and it is the reason the copy was persuasive.
 *
 * ── THE SCAN READS COPY, NOT THE COMMENTS THAT EXPLAIN IT ─────────────────────────────────────
 *
 * `workshop.tsx` now carries a comment QUOTING the deleted sentence, so that the next person to
 * write it does not write it again by accident. That comment contains, verbatim, two of the
 * strings below. This repository has been here four times already — `routes.test.ts` matched
 * nginx.conf's own paragraph forbidding `try_files`, the provider scan matched the sentence
 * saying a provider must never be named, and `no-build-time-config.test.ts` would have matched
 * vite.config.ts's explanation of why `VITE_` is banned. Each of those would have been "fixed" by
 * excepting the file, which is how a rule stops covering the file it was written for. So comments
 * are stripped first, and the last test drives the stripper against the real sentence in both
 * positions — as copy, where it must be caught, and as a comment, where it must not be.
 *
 * ── AND WHITESPACE IS FLATTENED, WHICH IS NOT COSMETIC ────────────────────────────────────────
 *
 * The deleted promise was "take it out to a wallet you control the / same afternoon" — "the" ended
 * `workshop.tsx:55` and "same afternoon" began :56. A scan working line by line would have read
 * the file, matched nothing, and gone green over the exact string it was written to forbid. JSX
 * prose wraps wherever the formatter puts it, so the only safe unit is the sentence, and the only
 * way to get one is to collapse every run of whitespace before matching.
 *
 * ── PRECISION IS A REQUIREMENT, NOT A COURTESY ────────────────────────────────────────────────
 *
 * A forbidden-word scan that fires on honest copy gets excepted, then loosened, then deleted. So
 * every rule below carries `catches` — the real sentence it exists to stop, quoted from the diff
 * that removed it — and `allows`: copy that is live on this surface right now and must keep
 * passing. `land.tsx:207` says "ground does not cost anything", `discover.tsx:131` says "money
 * will not buy you a fourth", `wards.tsx:42` and `world.tsx:302` both say "no amount of money",
 * and `workshop.tsx:294` says "our fee, your royalty and your money". Four sentences about money
 * that are not claims about EMBER's worth, on a surface whose subject is a marketplace. A ban on
 * the word would have taken all four.
 *
 * The word "real" in "real EMBER" is deliberately NOT forbidden. It is wrong in the sentence it
 * was in, and the sentence is gone; but `site` says "a real EMBER network" about the chain, which
 * is true and checkable, and a rule that could not tell the two apart would generate exactly the
 * false positive this file is written to avoid.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')

type Rule = {
  /** What the rule refuses, in the words a failure message should use. */
  readonly name: string
  readonly pattern: RegExp
  /** Why the estate refuses it, with the citation. Printed on failure. */
  readonly why: string
  /** Real sentences this rule exists to stop. Each MUST match, or the rule guards nothing. */
  readonly catches: readonly string[]
  /** Copy that is live on this surface and must keep passing. Each MUST NOT match. */
  readonly allows: readonly string[]
}

const RULES: readonly Rule[] = [
  {
    name: 'EMBER described as money',
    pattern: /\b(?:it|this|that|ember|sparks?|payment|what\s+you\s+(?:are\s+paid|earn|make|get))\s+(?:is|are)\s+(?:real\s+|actual\s+)?money\b|\bmoney,\s*not\s+points\b/i,
    why:
      'EMBER has no monetary value on either network — no market, no listing, no liquidity, no ' +
      'price (docs/ecosystem/18-build-status.md:38). Say what the coin DOES — it is credited, it ' +
      'can be withdrawn, spent in the ecosystem, or mined — and say "EMBER has no market price".',
    catches: [
      'It is money, not points: take it out to a wallet you control the same afternoon',
      'EMBER is real money',
      'The Sparks are money, not points',
      'What you are paid is money. It is not points.',
    ],
    allows: [
      'and no amount of money raises it',
      'get three per parcel a week, and money will not buy you a fourth',
      'how each price divides into our fee, your royalty and your money',
      'ever needs money badly enough to sell discovery, it needs to be shut down instead',
      'a duplicate is money as well as a duplicate object',
      'Sell what you have made and you are paid in Sparks — EMBER, credited to your account by the person who bought it.',
    ],
  },
  {
    name: 'EMBER described as worth money',
    pattern: /\bworth\s+(?:real\s+)?money\b|\bcash(?:es|ed)?\s+(?:it\s+)?out\b|\bconvert(?:s|ed|ible)?\s+(?:it\s+)?(?:in)?to\s+(?:cash|dollars|money|fiat)\b|\bin\s+(?:dollars|euros|pounds)\b/i,
    why:
      'The same rule from the other side: a coin that can be turned into money is a coin with a ' +
      'price. Nothing in this estate converts EMBER into currency and no copy may suggest one ' +
      'does (docs/ecosystem/32-roadmap-ui-and-content.md §1.4).',
    catches: [
      'what you earn here is worth real money',
      'you can cash it out whenever you like',
      'convert it to dollars in the wallet',
      'a Spark is worth about a tenth of a cent in dollars',
    ],
    allows: [
      'somewhere good is to make it worth the walk',
      'The visit is recorded, once, and the client does not decide what it is worth',
      'a ward’s worth of decoded 512×512 RGBA is on the heap',
    ],
  },
  {
    name: 'EMBER given a price',
    pattern: /(?<!\bno )\bmarket\s+(?:price|value|rate)\b|\bexchange\s+rate\b|\bprice\s+of\s+(?:an?\s+)?EMBER\b|\bEMBER\b[^.\n]{0,40}\b(?:is\s+worth|costs?|trades?\s+at|is\s+priced)\b/i,
    why:
      'There is no market to take a price from. 18-build-status.md:38 restates it for both ' +
      'networks at :118-122. The only admissible sentence about EMBER and price is the denial.',
    catches: [
      'the market price of EMBER',
      'the current market value',
      'at the going exchange rate',
      'the price of an EMBER',
      'One EMBER costs roughly what a coffee does',
      'EMBER trades at a few cents',
    ],
    allows: [
      'EMBER has no market price.',
      '— or mine yourself, in a browser tab, on a key that never leaves your machine. EMBER has no market price.',
      'You will not find a price here, or a payment step, because ground does not cost anything.',
      'A price is a whole number of Sparks, above zero.',
      'capacity is a convenience rather than the price of being able to build at all',
      'What you are selling, and how each price divides into our fee, your royalty and your money',
      'Sell what you have made, in EMBER you can withdraw, and see our cut before you list.',
      'land, or sell to somebody else for EMBER.',
    ],
  },
  {
    name: 'a settlement-timing promise',
    pattern: /\bthe\s+same\s+(?:afternoon|day|morning|evening|hour)\b|\b(?:withdraw\w*|paid|payout|settle[sd]?|settlement)\b[^.\n]{0,48}\b(?:within\s+(?:seconds|minutes|hours)|in\s+(?:seconds|minutes)|instantly|straight\s+away|right\s+away)\b|\b(?:within\s+(?:seconds|minutes|hours)|instantly)\b[^.\n]{0,48}\b(?:withdraw\w*|paid|payout)\b/i,
    why:
      'Nothing on this deployment measures how long a withdrawal takes, so any figure or phrase ' +
      'naming one is a promise the surface cannot keep and cannot check. Say that a withdrawal ' +
      'is possible; do not say when it lands.',
    catches: [
      'take it out to a wallet you control the same afternoon',
      'you are paid within minutes',
      'withdrawals settle instantly',
      'instantly withdrawn to a wallet you control',
    ],
    allows: [
      'You can withdraw it to a wallet you control, spend it anywhere in the ecosystem, or mine more of it in a browser tab.',
      'Otherwise the top, instantly.',
      "window.scrollTo({ top: 0, left: 0, behavior: 'instant' })",
      'You are paid this every time it changes hands again, for as long as it exists.',
    ],
  },
  {
    name: 'a price anchor',
    pattern: /\b(?:around|about|roughly|typically|usually|ordinarily|averages?|on\s+average)\s+[\d,]+\s*(?:of\s+them|sparks?|ember)\b|\bgo\s+for\s+(?:around|about|roughly)\s+[\d,]+\b/i,
    why:
      'A typical price implies a distribution of real prices, and there is not one: nobody ' +
      'outside the project has used any of this (18-build-status.md:50). The split table under ' +
      'the listing form shows a seller how whatever price they choose divides, which is the ' +
      'honest form of this guidance (32-roadmap-ui-and-content.md §4.1).',
    catches: [
      'A Spark is a millionth of an EMBER. Ordinary things go for around 400 of them.',
      'most objects sell for about 400 Sparks',
      'prices are typically 400 sparks',
    ],
    allows: [
      'A Spark is a millionth of an EMBER.',
      'A price is a whole number of Sparks, above zero.',
      'The most you may ask is 10%.',
      'you get three per parcel a week',
    ],
  },
]

/** The denial the two corrected page heads must both carry. */
const DENIAL = 'EMBER has no market price'

/** Pages whose copy asserted the opposite until 2026-08-08, and must now carry the denial. */
const MUST_DENY = ['src/pages/workshop.tsx', 'src/pages/world.tsx']

/** TypeScript and JSX with comments removed — the rationale below quotes what it forbids. */
const stripTs = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** HTML with its comments removed. index.html's chrome block is several paragraphs of them. */
const stripHtml = (text: string): string => text.replace(/<!--[\s\S]*?-->/g, '')

/** One sentence per line is a formatting accident; the scan must not depend on it. */
const flatten = (text: string): string => text.replace(/\s+/g, ' ')

const copyIn = (file: string): string =>
  flatten((file.endsWith('.html') ? stripHtml : stripTs)(readFileSync(file, 'utf8')))

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/** Everything a reader can end up looking at: the app's own source, and the entry document. */
const surfaces = (): string[] => [...walk(join(REPO, 'src')), join(REPO, 'index.html')]

test('no copy on this surface says EMBER is worth money, promises a settlement time, or anchors a price', () => {
  const files = surfaces()
  // Asserted, because a walk that silently returns nothing is a scan passing over an empty
  // haystack — and reads exactly like a clean repository.
  assert.ok(files.length > 10, `only ${files.length} files were scanned — walk() is broken`)
  assert.ok(
    files.some((f) => f.endsWith('index.html')),
    'index.html was not scanned; its meta description is copy a search result shows',
  )
  for (const file of files) {
    const copy = copyIn(file)
    for (const rule of RULES) {
      const hit = copy.match(rule.pattern)
      assert.equal(
        hit,
        null,
        `${relative(REPO, file)} contains ${rule.name}: ${JSON.stringify(hit?.[0])}\n\n${rule.why}`,
      )
    }
  }
})

test('the two page heads that used to claim otherwise now carry the denial', () => {
  for (const page of MUST_DENY) {
    // Read out of the STRIPPED copy, so that a comment about the denial cannot satisfy the
    // assertion that the denial is on the page. That is the same failure this file is guarding
    // against, one level up.
    assert.ok(
      copyIn(join(REPO, page)).includes(DENIAL),
      `${page} no longer tells the reader "${DENIAL}". It is the one sentence about EMBER and ` +
        'price this surface is allowed to print, and the page it is missing from is a page that ' +
        'asks somebody to sell something.',
    )
  }
})

test('every rule can still fail, and none of them fires on copy that is fine', () => {
  // An ABSENCE that cannot fail is this estate's most common defect: six tests that `return`ed
  // instead of skipping, a CI rule found inverted, a grep that skipped files with NUL bytes. So
  // every rule is driven against the real sentence it was written for.
  assert.ok(RULES.length >= 5, 'rules have been deleted from this file')
  for (const rule of RULES) {
    assert.ok(rule.catches.length > 0, `${rule.name} names nothing it catches`)
    for (const sentence of rule.catches) {
      assert.match(
        flatten(sentence),
        rule.pattern,
        `the "${rule.name}" rule does not catch the sentence it exists to forbid: ${sentence}`,
      )
    }
    for (const sentence of rule.allows) {
      assert.doesNotMatch(
        flatten(sentence),
        rule.pattern,
        `the "${rule.name}" rule fires on honest copy: ${sentence}. A scan that fails on good ` +
          'writing is excepted, then loosened, then deleted.',
      )
    }
  }
})

test('the scan reads copy, not the comments explaining what the copy may not say', () => {
  // workshop.tsx really does carry the deleted sentence inside a comment, so this is the
  // difference between a guard and an exception list. Both fixtures below hold the SAME sentence.
  const claim = 'It is money, not points: take it out to a wallet you control the same afternoon.'
  const asCopy = `export const Page = () => <p>${claim}</p>`
  const asJsxComment = `export const Page = () => (\n  <p>\n    {/*\n      Never write: ${claim}\n    */}\n    Paid in Sparks.\n  </p>\n)`
  const asBlockComment = `/**\n * Deleted 2026-08-08: ${claim}\n */\nexport const Page = () => <p>Paid in Sparks.</p>`
  const asLineComment = `// Deleted 2026-08-08: ${claim}\nexport const Page = () => <p>Paid in Sparks.</p>`

  // By name rather than by index: a rule reordered above these two would otherwise silently
  // repoint this test at a rule the fixtures were never written for, and it would stay green.
  const ruleNamed = (name: string): Rule => {
    const rule = RULES.find((r) => r.name === name)
    assert.ok(rule, `no rule named "${name}" — this test is grading a rule that no longer exists`)
    return rule
  }
  const money = ruleNamed('EMBER described as money')
  const timing = ruleNamed('a settlement-timing promise')
  assert.match(flatten(stripTs(asCopy)), money.pattern, 'the scan misses the claim as real copy')
  assert.match(flatten(stripTs(asCopy)), timing.pattern, 'the scan misses the promise as real copy')
  for (const [label, source] of [
    ['a JSX comment', asJsxComment],
    ['a block comment', asBlockComment],
    ['a line comment', asLineComment],
  ] as const) {
    const stripped = flatten(stripTs(source))
    assert.doesNotMatch(stripped, money.pattern, `the scan still matches ${label}`)
    assert.doesNotMatch(stripped, timing.pattern, `the scan still matches ${label}`)
  }

  // And the wrapping that broke "the / same afternoon" across two lines must not hide it either.
  assert.match(
    flatten(stripTs('export const P = () => <p>take it out to a wallet you control the\n  same afternoon, spend it anywhere.</p>')),
    timing.pattern,
    'the scan misses a sentence that JSX wrapped across two lines — which is how it was written',
  )
})
