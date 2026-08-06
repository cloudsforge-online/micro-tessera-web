/**
 * The screens, rendered for real into `happy-dom`, addressed by accessible role and name.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * EVERY MOUNT HERE GOES THROUGH `assertMounted`, WHICH REFUSES A BODY UNDER 40 CHARACTERS.
 *
 * The reason is recorded in the harness and it is not hypothetical: a bundle that 404s leaves the
 * network perfectly idle and `domcontentloaded` fires anyway, so a smoke test that waits for the
 * network and then asserts nothing goes green against a blank page. Forty characters is the
 * threshold the frozen `beacon` harness used and it is used here for the same reason.
 *
 * Elements are addressed by role and name, never by class or DOM path. A markup change must not
 * break these tests; an accessible-name change must.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement as h } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { mount, withScreen, type Routes } from './dom.ts'
import { DiscoverPage } from '../src/pages/discover.tsx'
import { KilnPage } from '../src/pages/kiln.tsx'
import { LandPage } from '../src/pages/land.tsx'
import { WardsPage } from '../src/pages/wards.tsx'
import { WorkshopPage } from '../src/pages/workshop.tsx'
import { WorldPage } from '../src/pages/world.tsx'
import { WalletStrip } from '../src/components/wallet-strip.tsx'
import { LISTING, OBJECT, PARCEL, RANKED, SIGNED_IN, TERMS, WARD } from './fixtures.ts'

/** Everything is behind a router: `useSearchParams` throws outside one, and pages use it. */
const routed = (element: ReturnType<typeof h>) => h(MemoryRouter, null, element)

const SESSION = { storage: { ...SIGNED_IN } } as const

/* ── the guard every other test in this file rests on ──────────────────────────────────────── */

test('a screen that renders nothing is REFUSED, not returned', async () => {
  // ══════════════════════════════════════════════════════════════════════════════════════════
  // THIS TEST EXISTS BECAUSE `test/red.sh` FOUND IT MISSING.
  //
  // Loosening `assertMounted`'s 40-character floor to `>= 0` left the whole suite green: every
  // screen below happens to render plenty, so nothing depended on the floor being enforced. A
  // guard that no test can detect the removal of is a guard that will be removed by somebody
  // tidying up, and the first thing to slip past it will be a bundle that 404s — which leaves
  // the network perfectly idle while `domcontentloaded` fires anyway.
  //
  // So the floor is now driven directly: an empty render must THROW.
  // ══════════════════════════════════════════════════════════════════════════════════════════
  const Blank = () => null
  await assert.rejects(
    () => mount(h(Blank), { routes: {} }),
    /nothing mounted/,
    'a component that rendered nothing was handed back as a screen',
  )

  // And a short-but-not-empty render is refused too, which is the case that actually happens: an
  // error boundary rendering "Something went wrong" is 20 characters and looks like a page.
  const Nearly = () => h('p', null, 'Something went wrong')
  await assert.rejects(
    () => mount(h(Nearly), { routes: {} }),
    /nothing mounted/,
    'a 20-character error screen passed as a mounted application',
  )

  // The converse, so this is not passing because `mount` throws on everything: 41 characters is
  // enough.
  const Enough = () => h('p', null, 'x'.repeat(41))
  const screen = await mount(h(Enough), { routes: {} })
  await screen.unmount()
})

/* ── the wards page ────────────────────────────────────────────────────────────────────────── */

test('BJ-TES-07 ★ [T1/presentation] the wards page renders a ward, and opens who is in it — with the instance', async () => {
  const routes: Routes = {
    'GET /v1/wards': { body: { wards: [WARD] } },
    'GET /v1/wards/': {
      body: {
        avatars: [
          { subject: 'user:alice', instance: 1, x: 4, y: 4, updatedAt: '2026-08-03T00:00:00.000Z' },
          { subject: 'user:bob', instance: 2, x: 9, y: 1, updatedAt: '2026-08-03T00:00:00.000Z' },
        ],
      },
    },
  }
  await withScreen(routed(h(WardsPage)), { ...SESSION, routes }, async (s) => {
    s.byRole('heading', 'The Mosaic')
    assert.match(s.text(), /The Commons/, 'the ward is not on the page')
    assert.match(s.text(), /ashfield/, 'the archetype is not on the page')

    // The occupancy is printed from the service's own `occupancy`, not recomputed here.
    assert.match(s.text(), /25%/, 'the occupancy the service sent is not shown')

    await s.click(s.byRole('button', 'Who is in The Commons'))

    // §4: "the ward's own page says WHICH INSTANCE HOLDS WHOM, because a friend you cannot find is
    // worse than a crowd you cannot join". So the instance has to be beside the name, not a count.
    assert.match(s.text(), /Instance 1/, 'instance 1 is not named')
    assert.match(s.text(), /Instance 2/, 'instance 2 is not named')
    assert.match(s.text(), /user:alice/, 'the person in instance 1 is not named')
    s.clean('the wards page')
  })
})

/* ── the land page ─────────────────────────────────────────────────────────────────────────── */

test('BJ-TES-09 ★ [T1/client-request] claiming ground sends no price, and there is no price field to send one from', async () => {
  const routes: Routes = {
    'GET /v1/me/parcels': { body: { parcels: [PARCEL] } },
    'GET /v1/wards': { body: { wards: [WARD] } },
    'POST /v1/parcels': { status: 201, body: { parcel: PARCEL } },
  }
  await withScreen(routed(h(LandPage)), { ...SESSION, routes }, async (s) => {
    s.byRole('heading', 'Your land')

    // Choose the ward, then claim. The tier defaults to homestead.
    const select = s.allByRole('combobox')[0]
    assert.ok(select, 'there is no ward select')
    await s.type(select, WARD.id)
    await s.click(s.byRole('button', 'Claim this ground'))

    const posted = s.api.matching('POST /v1/parcels')
    assert.equal(posted.length, 1, 'the claim was not sent exactly once')
    const body = posted[0]?.json as Record<string, unknown>

    // ══════════════════════════════════════════════════════════════════════════════════════════
    // §4: land is claimed free and the platform never sells it. This asserts the ABSENCE, with
    // force, and it asserts it about WHAT WENT OVER THE WIRE rather than about what the form
    // looks like — a hidden price field that still posted would pass a DOM-only check.
    // ══════════════════════════════════════════════════════════════════════════════════════════
    assert.deepEqual(
      Object.keys(body).sort(),
      ['originX', 'originY', 'tier', 'wardId'],
      'the claim carried a field beyond the four the service reads — a price would be one',
    )
    for (const forbidden of ['priceWei', 'price', 'priceSparks', 'paymentId', 'sku', 'amount']) {
      assert.equal(body[forbidden], undefined, `the claim carried ${forbidden}`)
    }
    s.clean('the land page')
  })
})

test('BJ-TES-10 [T1/presentation] the Homestead tier is offered even though a second one is unrepresentable', async () => {
  const routes: Routes = {
    'GET /v1/me/parcels': { body: { parcels: [PARCEL] } },
    'GET /v1/wards': { body: { wards: [WARD] } },
  }
  await withScreen(routed(h(LandPage)), { ...SESSION, routes }, async (s) => {
    // A frontend must not assert a business rule. Whether this account may hold a Homestead is a
    // partial unique index in micro-tessera's schema, and hiding the option would be this client
    // deciding — plus a client-side test of the hidden option would pass against a service that
    // had stopped enforcing it.
    const radios = s.allByRole('radio')
    const values = radios.map((r) => r.getAttribute('value'))
    assert.deepEqual(
      values,
      ['homestead', 'plot', 'court', 'quarter'],
      'the four tiers are not all offered',
    )
    s.clean('the land page tiers')
  })
})

/* ── the discover page ─────────────────────────────────────────────────────────────────────── */

test('BJ-TES-20 ★ [T1/client-request] discovery sends no ordering parameter, and shows both inputs beside the score', async () => {
  const routes: Routes = {
    'GET /v1/wards': { body: { wards: [WARD] } },
    'GET /v1/discover': { body: { parcels: RANKED } },
  }
  await withScreen(routed(h(DiscoverPage)), { ...SESSION, routes }, async (s) => {
    s.byRole('heading', 'Where people are going')

    // ══════════════════════════════════════════════════════════════════════════════════════════
    // §7.1's first refusal, asserted as an absence on the WIRE: "no promoted placement, no paid
    // ranking, no sponsored beacons, no boost."
    // ══════════════════════════════════════════════════════════════════════════════════════════
    const calls = s.api.matching('GET /v1/discover')
    assert.ok(calls.length > 0, 'the feed was never read')
    for (const call of calls) {
      const params = [...new URL(call.url, 'https://tessera.cloudsforge.online').searchParams.keys()]
      assert.deepEqual(
        params.filter((p) => p !== 'wardId'),
        [],
        `the feed was asked for with ${params.join(', ')} — the only permitted filter is wardId`,
      )
    }

    // Both inputs on screen, so the order is checkable rather than trusted.
    assert.match(s.text(), /84 accounts/, 'footfall is not shown')
    assert.match(s.text(), /212s/, 'median dwell is not shown')
    s.before('Footfall', 'Score', 'the inputs come before the score they produce')
    s.clean('the discover page')
  })
})

/* ── the workshop ──────────────────────────────────────────────────────────────────────────── */

test('BJ-TES-23 ★ [T1/presentation] the workshop prints the terms the service sent, and does not derive them', async () => {
  const routes: Routes = {
    'GET /v1/terms': { body: TERMS },
    'GET /v1/listings': { body: { listings: [LISTING] } },
    'GET /v1/objects': { body: { objects: [OBJECT] } },
  }
  await withScreen(routed(h(WorkshopPage)), { ...SESSION, routes }, async (s) => {
    s.byRole('heading', 'Your Workshop')
    assert.match(s.text(), /2\.5%/, 'the platform fee is not shown')
    assert.match(s.text(), /10%/, 'the royalty cap is not shown')
    assert.match(
      s.text(),
      /Every account, identically/,
      'the identicalForEveryAccount flag the service sent is not shown',
    )
    s.clean('the workshop')
  })
})

test('BJ-TES-24 [T1/presentation] the workshop reports the service withdrawing the equal-terms claim', async () => {
  // The converse of the test above, and the reason that one is not self-referential: the page is
  // fed `identicalForEveryAccount: false` and must say something DIFFERENT. A page that printed
  // the same sentence either way would be comparing a constant with itself.
  const routes: Routes = {
    'GET /v1/terms': { body: { ...TERMS, identicalForEveryAccount: false } },
    'GET /v1/listings': { body: { listings: [] } },
    'GET /v1/objects': { body: { objects: [] } },
  }
  await withScreen(routed(h(WorkshopPage)), { ...SESSION, routes }, async (s) => {
    assert.doesNotMatch(
      s.text(),
      /Every account, identically/,
      'the page claims equal terms the service did not state',
    )
    assert.match(s.text(), /no longer stating/, 'the page does not report the withdrawn claim')
    s.clean('the workshop, terms withdrawn')
  })
})

test('BJ-TES-26 ★ [T1/client-request] a blank price never leaves the form — BigInt("") is 0n', async () => {
  const routes: Routes = {
    'GET /v1/terms': { body: TERMS },
    'GET /v1/listings': { body: { listings: [] } },
    'GET /v1/objects': { body: { objects: [OBJECT] } },
    'POST /v1/listings': { status: 201, body: { listing: LISTING } },
  }
  await withScreen(routed(h(WorkshopPage)), { ...SESSION, routes }, async (s) => {
    const selects = s.allByRole('combobox')
    const objectSelect = selects[0]
    assert.ok(objectSelect, 'there is no object select')
    await s.type(objectSelect, OBJECT.id)

    // ══════════════════════════════════════════════════════════════════════════════════════════
    // FIRST: EMPTY. The field is `required`, so the browser's own validation refuses before any
    // of this client's code runs. That is a real and sufficient guard for the empty case — and it
    // is why the assertion below is on the WIRE rather than on the sentence: the first version of
    // this test looked for the client's own refusal message and went red, because that message
    // never appears for an empty required field in a browser. The test was wrong, not the form.
    // ══════════════════════════════════════════════════════════════════════════════════════════
    await s.click(s.byRole('button', 'List it'))
    assert.equal(
      s.api.matching('POST /v1/listings').length,
      0,
      'a listing with no price was sent — BigInt("") is 0n and that is a free object',
    )

    // SECOND: non-empty and not a price, which passes `required` and reaches `sparksToWei`. This
    // is the input the client's own guard exists for, and '0' is the sharp one: it is a perfectly
    // well-formed integer that is not a price.
    const price = s.allByRole('textbox').find((el) => el.getAttribute('inputmode') === 'numeric')
    assert.ok(price, 'there is no price field')
    await s.type(price, '0')
    await s.click(s.byRole('button', 'List it'))
    assert.equal(
      s.api.matching('POST /v1/listings').length,
      0,
      'a listing at a price of zero was sent',
    )
    assert.match(s.text(), /whole number of Sparks/, 'the form did not say why it refused')

    // AND a fractional one, which BigInt would throw on rather than silently accept — but which
    // must still not reach the wire, because the failure the user sees should be a sentence next
    // to the field and not an exception in a handler.
    await s.type(price, '12.5')
    await s.click(s.byRole('button', 'List it'))
    assert.equal(s.api.matching('POST /v1/listings').length, 0, 'a fractional price was sent')

    // And the same form DOES send a real price, so the checks above are not passing because the
    // button is simply broken.
    await s.type(price, '400')
    await s.click(s.byRole('button', 'List it'))

    const sent = s.api.matching('POST /v1/listings')
    assert.equal(sent.length, 1, 'a valid price was not sent')
    const body = sent[0]?.json as Record<string, unknown>
    assert.equal(body['priceWei'], '400000000000000', '400 Sparks is 4e14 wei')
    assert.equal(typeof body['priceWei'], 'string', 'the price went over the wire as a JSON number')
    s.clean('the listing form')
  })
})

/* ── the Kiln ──────────────────────────────────────────────────────────────────────────────── */

test('BJ-TES-16 ★ [T1/presentation] a cold Kiln says so, in the words the service uses, rather than as a failure', async () => {
  const routes: Routes = {
    'GET /v1/objects': { body: { objects: [] } },
    'POST /v1/kiln/firings': {
      status: 503,
      body: {
        error: {
          code: 'kiln_unconfigured',
          message: 'the Kiln is not configured here',
          requestId: 'req-cold-0001',
        },
      },
    },
  }
  await withScreen(routed(h(KilnPage)), { ...SESSION, routes }, async (s) => {
    const prompt = s.allByRole('textbox')[0]
    assert.ok(prompt, 'there is no prompt field')
    await s.type(prompt, 'a low bench of pale scorched timber')
    await s.click(s.byRole('button', 'Fire it'))

    assert.match(
      s.text(),
      /supported state rather than an outage/,
      'a 503 kiln_unconfigured was rendered as a generic failure',
    )
    // `role="status"`, not `alert`: nothing is wrong, and retrying will not help.
    assert.equal(s.queryByRole('alert', /Kiln/), null, 'the cold Kiln was announced as an alert')
    s.clean('the cold kiln')
  })
})

test('BJ-TES-17 [T1/presentation] the Kiln offers two footprints, because there are two', async () => {
  await withScreen(
    routed(h(KilnPage)),
    { ...SESSION, routes: { 'GET /v1/objects': { body: { objects: [] } } } },
    async (s) => {
      const values = s.allByRole('radio').map((r) => r.getAttribute('value'))
      assert.deepEqual(values, ['1x1', '2x2'], '§6.3 has two footprints and only two')
      s.clean('the kiln footprints')
    },
  )
})

test('BJ-TES-18 [T1/presentation] the seed set is named as absent rather than substituted', async () => {
  await withScreen(
    routed(h(KilnPage)),
    { ...SESSION, routes: { 'GET /v1/objects': { body: { objects: [] } } } },
    async (s) => {
      s.byRole('heading', 'The 96 seed objects')
      assert.match(
        s.text(),
        /serves no route that lists them/,
        'the missing seed-object route is not stated',
      )
      s.clean('the seed gap')
    },
  )
})

/* ── the wallet strip ──────────────────────────────────────────────────────────────────────── */

test('BJ-TES-27 ★ [T1/presentation] a 503 from the balance route prints no digit, and says so rather than showing zero', async () => {
  // The route EXISTS now. What it answers when the ledger is unconfigured or unreachable is a 503
  // with no figures — its own handler says "a player looking at their own earnings must never be
  // shown a confident zero that means 'we did not ask'". This is the client half of that.
  const routes: Routes = {
    'GET /v1/me/balances': {
      status: 503,
      body: {
        error: {
          code: 'ledger_unconfigured',
          message: 'balances are unavailable — this is not a balance of zero',
          requestId: 'req-noledger-0001',
        },
      },
    },
  }
  await withScreen(h(WalletStrip), { ...SESSION, allowEmpty: true, routes }, async (s) => {
    const strip = s.document.querySelector('[aria-label="Your EMBER"]')
    assert.ok(strip, 'the wallet strip did not render')
    const text = s.textOf(strip)

    // ══════════════════════════════════════════════════════════════════════════════════════════
    // AN ABSENCE, ASSERTED WITH FORCE. The only digits permitted anywhere in this strip are the
    // ones inside the route name and the request id it is quoting, so they are removed before the
    // check. A zero here would be `BigInt('') === 0n` wearing a label: on a screen about
    // somebody's earnings, nothing displayed as if it were something.
    // ══════════════════════════════════════════════════════════════════════════════════════════
    const withoutRouteName = text.replace(/v1/g, '').replace(/req-[a-z]+-\d+/g, '')
    assert.doesNotMatch(
      withoutRouteName,
      /\d/,
      `the wallet strip printed a figure it does not have: ${text}`,
    )

    assert.match(text, /Available/, 'Available is not labelled')
    assert.match(text, /Clearing/, 'Clearing is not labelled')
    assert.match(text, /Confirming/, 'Confirming is not labelled')
    assert.match(text, /in no total/, 'the confirming figure is not excluded from the totals')
    assert.match(text, /GET \/v1\/me\/balances/, 'the route that declined to answer is not named')
    assert.match(text, /not a balance of zero/, "the service's own words are not shown")
    s.clean('the wallet strip, 503')
  })
})

test('BJ-TES-29 [T1/client-request] the wallet strip reads the balance route, and asks for nobody in particular', async () => {
  // The converse of the test above, so that one is not passing because the strip is simply broken.
  // A 200 must produce the figures — and the request must carry no `subject`: the route reads the
  // authenticated one, and a client-supplied subject is somebody else's earnings on your screen.
  const routes: Routes = {
    'GET /v1/me/balances': {
      body: {
        assetCode: 'EMBER',
        balances: {
          availableWei: '12480000000000000',
          availableSparks: '12480',
          reservedWei: '0',
          reservedSparks: '0',
          payoutDueWei: '3200000000000000',
          payoutDueSparks: '3200',
        },
      },
    },
  }
  await withScreen(h(WalletStrip), { ...SESSION, allowEmpty: true, routes }, async (s) => {
    const text = s.textOf(s.document.querySelector('[aria-label="Your EMBER"]'))
    assert.match(text, /Available\s*12,480 Sparks/, 'the available balance is not printed')
    assert.match(text, /Clearing\s*3,200 Sparks/, 'payout_due is not printed as Clearing')

    // Confirming is NOT a ledger balance and this route does not carry one. §8.2: posting a
    // liability before 60 confirmations is `convertCoinToEmber`, the estate's oldest defect. So it
    // stays unavailable even on a fully successful read, and that is correct rather than a gap.
    assert.match(
      text,
      /Confirming\s*Not available yet/,
      'an unconfirmed deposit was invented from a ledger read',
    )

    const calls = s.api.matching('GET /v1/me/balances')
    assert.equal(calls.length, 1, 'the balances were not read exactly once')
    const params = [
      ...new URL(calls[0]?.url ?? '', 'https://tessera.cloudsforge.online').searchParams.keys(),
    ]
    assert.deepEqual(params, [], `the strip asked for balances with ${params.join(', ')}`)
    s.clean('the wallet strip, read')
  })
})

test('BJ-TES-28 [T1/presentation] a real zero balance reads as zero, and an absent one does not', async () => {
  // The `wei === null` versus `!wei` distinction, driven rather than commented. `!0n` is true, so
  // a falsy check would tell a user with no money that the service was broken.
  await withScreen(
    h(WalletStrip, {
      balances: { availableWei: 0n, clearingWei: null, confirming: null },
    }),
    { allowEmpty: true, routes: {} },
    async (s) => {
      const text = s.textOf(s.document.querySelector('[aria-label="Your EMBER"]'))
      // `\s*`, because a `<dt>` and its `<dd>` are adjacent in the DOM with no whitespace between
      // them and `textOf` collapses runs of whitespace rather than inserting any. The first
      // version of this assertion expected a space that markup never produced.
      assert.match(text, /Available\s*0 Sparks/, 'a real zero balance was hidden as "not available"')
      assert.match(
        text,
        /Clearing\s*Not available yet/,
        'an absent balance was rendered as a number',
      )
      s.clean('the wallet strip, zero')
    },
  )
})

/* ── a signed-out visitor is invited, not told the world is broken ─────────────────────────── */

/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE DEFECT A REAL BROWSER FOUND AND EVERY MOCKED JOURNEY MISSED.
 *
 * Driven through the live gateway with no session, `tessera.<apex>/` rendered:
 *
 *     ■ That did not load
 *     a valid bearer token is required
 *     Quote this to support: 79n3w6xpgdvkwh56
 *     [Try again]
 *
 * — 196 characters of red alert, on the public front door of the product, offering a retry button
 * that could never succeed and a support reference for a thing that had not gone wrong.
 *
 * IT IS NOT AN AUTH BUG. `tessera/src/server.ts` calls `authenticate(ctx, deps)` before
 * `GET /v1/wards` returns anything, so 401 is the service answering correctly. And this app's own
 * `src/lib/routes.ts` had already written down what should happen — "what a signed-out visitor
 * actually gets is the screen and an invitation — not the world" — while three pages rendered
 * `<Failed>` instead, because `noticeFor` singled out 403 and let 401 fall through to the generic
 * failure.
 *
 * WHY NO MOCKED TEST COULD HAVE CAUGHT IT BEFORE: every scenario above passes `SESSION`, and a
 * stub table answers 200 to a request carrying no token. The unauthenticated path was never once
 * rendered. So these three cases assert it directly, with NO storage seeded — which is exactly
 * what a stranger with a link has.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
/**
 * The assertion, written once and named three times.
 *
 * The ids are spelled out LITERALLY in each `test(...)` title below rather than interpolated from
 * a loop variable. That is not style: `test/journeys.test.ts`'s catalogue check greps this file's
 * source for `<id>` followed by a space or a star, and a title built from `${id}` leaves the id
 * inside an array of strings where the grep cannot see it. The first draft of this block did
 * exactly that and the meta-test caught it — a scenario claiming a test in a file that appeared to
 * have none. The check is right and the loop was wrong.
 */
async function assertInvitesSignIn(name: string, element: ReturnType<typeof h>): Promise<void> {
  // What micro-tessera actually returns to a request with no bearer token. The message is the
  // service's own sentence, transcribed from the live estate rather than invented.
  const refused = {
    status: 401,
    body: { error: { code: 'unauthorized', message: 'a valid bearer token is required' } },
  }
  const routes: Routes = {
    'GET /v1/wards': refused,
    'GET /v1/parcels': refused,
    'GET /v1/discover': refused,
  }
  // NO `storage`, deliberately: this is a visitor who has never signed in.
  await withScreen(element, { routes }, async (s) => {
    const text = s.text()

    // The invitation is present, and it is a BUTTON — something the reader can act on.
    s.byRole('button', 'Sign in')
    assert.match(text, /Sign in to see/, `${name} did not invite a signed-out visitor to sign in`)

    // And the failure screen is absent, in all three of the ways it announced itself.
    assert.doesNotMatch(text, /That did not load/, `${name} still renders the failure screen`)
    assert.doesNotMatch(
      text,
      /Try again/,
      `${name} offers a retry that cannot succeed — the request will be refused identically`,
    )
    assert.doesNotMatch(
      text,
      /Quote this to support/,
      `${name} prints a support reference for something that did not go wrong`,
    )

    // The class is the machine-readable half of the same claim: `.tw-state--failed` carries
    // `role="alert"`, and a screen reader must not be told about an error that is not happening.
    // A DOM-text check alone would pass on a page rendering the right words in the wrong role.
    assert.equal(
      s.document.querySelector('.tw-state--failed'),
      null,
      `${name} still mounts the failed state`,
    )
    assert.ok(
      s.document.querySelector('.tw-state--signedout'),
      `${name} did not mount the signed-out state`,
    )
  })
}

test('BJ-TES-39 \u2605 [T1/presentation] the world page invites a signed-out visitor to sign in, and does not call it a failure', async () => {
  await assertInvitesSignIn('the world page', routed(h(WorldPage)))
})

test('BJ-TES-40 [T1/presentation] the wards page invites a signed-out visitor to sign in, and does not call it a failure', async () => {
  await assertInvitesSignIn('the wards page', routed(h(WardsPage)))
})

test('BJ-TES-41 [T1/presentation] the discover page invites a signed-out visitor to sign in, and does not call it a failure', async () => {
  await assertInvitesSignIn('the discover page', routed(h(DiscoverPage)))
})
