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

test('the wards page renders a ward, and opens who is in it — with the instance', async () => {
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

test('claiming ground sends no price, and there is no price field to send one from', async () => {
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

test('the Homestead tier is offered even though a second one is unrepresentable', async () => {
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

test('discovery sends no ordering parameter, and shows both inputs beside the score', async () => {
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

test('the workshop prints the terms the service sent, and does not derive them', async () => {
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

test('the workshop reports the service withdrawing the equal-terms claim', async () => {
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

test('a blank price never leaves the form — BigInt("") is 0n', async () => {
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

test('a cold Kiln says so, in the words the service uses, rather than as a failure', async () => {
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

test('the Kiln offers two footprints, because there are two', async () => {
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

test('the seed set is named as absent rather than substituted', async () => {
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

test('the wallet strip prints no digit while the balance route does not exist', async () => {
  await withScreen(h(WalletStrip), { allowEmpty: true, routes: {} }, async (s) => {
    const strip = s.document.querySelector('[aria-label="Your EMBER"]')
    assert.ok(strip, 'the wallet strip did not render')
    const text = s.textOf(strip)

    // ══════════════════════════════════════════════════════════════════════════════════════════
    // AN ABSENCE, ASSERTED WITH FORCE. The only digits permitted anywhere in this strip are the
    // ones inside the route name it is complaining about, so they are removed before the check.
    // A zero here would be `BigInt('') === 0n` wearing a label: on a screen about somebody's
    // earnings, nothing displayed as if it were something.
    // ══════════════════════════════════════════════════════════════════════════════════════════
    const withoutRouteName = text.replace(/v1/g, '')
    assert.doesNotMatch(
      withoutRouteName,
      /\d/,
      `the wallet strip printed a figure it does not have: ${text}`,
    )

    assert.match(text, /Available/, 'Available is not labelled')
    assert.match(text, /Clearing/, 'Clearing is not labelled')
    assert.match(text, /Confirming/, 'Confirming is not labelled')
    assert.match(text, /in no total/, 'the confirming figure is not excluded from the totals')
    assert.match(text, /GET \/v1\/me\/balances/, 'the missing route is not named')
    s.clean('the wallet strip')
  })
})

test('a real zero balance reads as zero, and an absent one does not', async () => {
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
