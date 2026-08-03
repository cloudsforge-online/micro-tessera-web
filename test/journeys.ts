/**
 * This surface's browser-journey catalogue, as data.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * DOC 22 PREDATES TESSERA ENTIRELY, SO THESE IDS ARE ALLOCATED HERE RATHER THAN TRANSCRIBED.
 *
 * `docs/ecosystem/22-browser-journeys.md` enumerates fifteen bundles (§5) and Tessera is not one
 * of them: its "Last verified" line is the same day this title's design document was written, and
 * its adversarial matrix (§6.19) stops at `BJ-ADV-21`. Every other frontend's catalogue in this
 * estate transcribes ids from doc 22; this one cannot, because there is nothing to transcribe.
 *
 * So the allocation is stated rather than smuggled:
 *
 *   `BJ-TES-nn`          a new group, in the place doc 22 would put "Group U — Tessera".
 *   `BJ-TESSERA-404`     doc 22 §5.1's universal per-surface property, whose id shape is fixed by
 *                        the doc (`BJ-MARKET-404`, `BJ-WORLDS-404`, `BJ-AETHERHOLM-404` all
 *                        exist in their repositories already).
 *   `BJ-ADV-TES-nn-Hn`   doc 22 §6.19's matrix, for this surface's forms. The doc's own shape is
 *                        `BJ-ADV-<form>-H<hazard>` with `<form>` a number IT assigns. Taking the
 *                        next free numbers — 22, 23, 24 — would collide the day doc 22 is revised
 *                        and would also collide with `BJ-ADV-22` and `BJ-ADV-23`, which the doc
 *                        has already used for its two page-level rows. `TES` in the form slot
 *                        cannot collide with a number, and it says where the row came from.
 *   `BJ-ADV-22`, `BJ-ADV-23`, `BJ-A11Y-*`   taken from doc 22 unchanged: those rows are written
 *                        as properties of EVERY surface, not of one, so this surface is held to
 *                        the same ids as the other fourteen.
 *
 * When doc 22 is next revised to include Tessera, the group letter it assigns is the only thing
 * that should move, and the `BJ-TES-nn` numbers should be adopted rather than renumbered — doc 22
 * §6.0: "Stable. Never renumbered — a renamed scenario abandons its metric history."
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── WHY THE CATALOGUE IS DATA AND NOT JUST A LIST OF TEST TITLES ──────────────────────────────
 *
 * Two reasons, both of them mechanical.
 *
 * 1. Doc 22 §3.2 makes the layer boundary a test rather than advice: every scenario declares one
 *    `asserts` kind, and any scenario whose outcome depends on a SERVER-SIDE rule must carry
 *    `ownedBy` — "a path, resolvable by grep, in the service that enforces the rule".
 *    {@link checkCatalogue} reads these and refuses the suite when one is missing. The rule exists
 *    because of a recorded incident: a game client withheld four SKUs from its UI while the
 *    payment routes stayed live and chargeable, and a client-side test of the hidden catalogue
 *    would have passed, green, against the defect — because hiding them WAS the entire control.
 *
 * 2. Doc 22 §8 argues, correctly, that "a scenario that exists and cannot run is a gap somebody
 *    can close, and an absent scenario is a gap nobody can see". So the ones this client cannot
 *    carry are here too, with the blocker named — and, wherever the blocker is a fact about a
 *    file, with a `blockedWhile` anchor a machine can check. That last part is not decoration: a
 *    blocker is a claim about the estate written at one moment, and `aetherholm-web` shipped one
 *    ("nothing in the estate serves a sign-in page") that was false within days with nothing going
 *    red. A gap that has quietly closed reads exactly like a gap that is still open.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The estate root, when the sibling repositories happen to be checked out beside this one. */
const ESTATE = fileURLToPath(new URL('../../', import.meta.url))

/** Doc 22 §3.1. `absence` is deliberately not a kind. */
export type Asserts = 'presentation' | 'client-request' | 'navigation'

/** Doc 22 §4. T3 is not implemented here — it lives in `micro-beacon`. */
export type Tier = 'T1' | 'T2' | 'T3'

/**
 * The seven screens of `src/pages/`, plus the shell chrome that is on every one of them.
 *
 * Declared so {@link checkCatalogue} can hold the catalogue to covering all of them. This repo's
 * coverage was measured as "3 BJ-tagged scenarios across seven screens" against market-web's 24
 * and foresight-web's 25, and a count is only a floor if something enforces it.
 */
export const SCREENS = [
  'world',
  'wards',
  'land',
  'kiln',
  'discover',
  'workshop',
  'not-found',
  'shell',
] as const

export type Screen = (typeof SCREENS)[number]

export interface Scenario {
  /** Stable. Never renumbered: a renamed scenario abandons its metric history (doc 22 §6.0). */
  readonly id: string
  /** What fails if the feature breaks, stated as the defect rather than as the step. */
  readonly what: string
  readonly screen: Screen
  readonly asserts: Asserts
  readonly tier: Tier
  /** ★ — a release candidate does not promote until this is green. */
  readonly gate?: boolean
  /**
   * The test file that carries it. Defaults to `test/journeys.test.ts`.
   *
   * Several of these were written before this catalogue existed and are good tests in the wrong
   * place. Moving them would have churned `test/red.sh`'s targets for no gain, so they keep their
   * home and carry their id in their title, and the meta-test resolves the id in the named file.
   */
  readonly implementedIn?: string
  /**
   * The server-side rule this scenario's outcome turns on. Setting it makes `ownedBy` mandatory.
   * Leave unset when the scenario asserts only what this client rendered or sent.
   */
  readonly serverRule?: string
  /** `<repo>/<path>[#<string>]` of the test that owns that rule. Never a description. */
  readonly ownedBy?: string
  /**
   * Why no server rule is involved, when the wording reads as though one might be.
   *
   * The refusal check below matches a word in a sentence, so it fires on a scenario ABOUT refusals
   * as readily as on one asserting a 403. Narrowing the pattern until it stops complaining is how
   * a guard loses its teeth; a bypass nobody has to justify is how it loses them faster. So the
   * third answer is a sentence the author writes.
   */
  readonly noServerRule?: string
  /** For `navigation`: the HTTP status the address must answer under. */
  readonly expectStatus?: number
  /** ⛔ — why this cannot be written here today. A specification, never a claim of coverage. */
  readonly blocked?: string
  /**
   * The blocker as something a machine can check, relative to the estate root.
   *
   *   `{ absent: 'tessera/src/server.ts#/v1/wards/:id/terrain' }`  blocked BECAUSE it is missing.
   *   `{ present: 'tessera-web/src/render/renderer.ts#…' }`        blocked because it is still there.
   *
   * Omit it only when the blocker is genuinely not a fact about a file — "this needs two browser
   * contexts" — and say that in `blocked`.
   */
  readonly blockedWhile?: { readonly absent?: string; readonly present?: string }
}

export const SCENARIOS: readonly Scenario[] = [
  /* ══ the world: a Canvas 2D isometric renderer, and the parcel standing under it ═══════════ */

  {
    id: 'BJ-TES-01',
    what:
      'a player opening their own fully-built Plot is shown their objects rather than bare ' +
      'ground: the zoom floor sits BELOW the zoom a Plot fits at, and the client says which of ' +
      'the two states it is in',
    screen: 'world',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
    noServerRule:
      'the zoom floor is a rendering decision made entirely inside this bundle — ' +
      'SPRITE_MIN_ZOOM in src/render/renderer.ts, compared against zoomToFit for the parcel the ' +
      'service returned. micro-tessera has no opinion about zoom and serves no such field.',
  },
  {
    id: 'BJ-TES-02',
    what:
      'a Court, which does not fit above the floor, states that its objects are not drawn and ' +
      'what to do about it — the alternative is a place that looks empty and is not',
    screen: 'world',
    asserts: 'presentation',
    tier: 'T1',
    noServerRule:
      'as BJ-TES-01: the degradation is this renderer comparing its own measured floor against ' +
      'its own camera, and nothing about it crosses the wire.',
  },
  {
    id: 'BJ-TES-03',
    what:
      'a placement whose sprite will not load is counted and named, and no substitute is drawn — ' +
      'a world where every unresolvable chair became the same grey box is a world nobody can ' +
      'tell is broken',
    screen: 'world',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
    noServerRule:
      'src/lib/sprites.ts decides this: `get` returns undefined for a sprite it does not hold and ' +
      '`missing` lists the paths. There is no fallback asset anywhere for a service to serve.',
  },
  {
    id: 'BJ-TES-37',
    what:
      'a parcel standing on a MOUNTED asset set is drawn on ground, at the filenames the set ' +
      'itself gives for the identities this client asks for — the client spelled those filenames ' +
      'once, got every one of them wrong, and rendered a complete validated 392-asset mount as a ' +
      'world of holes with nothing red anywhere',
    screen: 'world',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
    noServerRule:
      'the asset path crosses no service at all. micro-tessera serves no sprite and knows no ' +
      'filename: the identity comes from src/render/terrain.ts and the file it resolves to comes ' +
      "from the mount's own SET.json, which micro-tessera-assets' materialise.py wrote.",
  },
  {
    id: 'BJ-TES-38',
    what:
      'a world with no art in it says WHICH of the two causes it is — no set mounted, or a set ' +
      'mounted whose names this client cannot resolve — because they look identical on screen, ' +
      'have different owners, and the estate spent a night unable to tell them apart',
    screen: 'world',
    asserts: 'presentation',
    tier: 'T1',
    noServerRule:
      'both states are properties of the mount and of this bundle. The deploy maps the volume ' +
      'and micro-tessera-assets names the assets; micro-tessera is not in the path and has no ' +
      'route that could report either one.',
  },
  {
    id: 'BJ-TES-04',
    what:
      'leaving a parcel records exactly one visit, carrying a dwell measured from the clock and ' +
      'no subject at all — a body-supplied visitor is synthetic footfall, and footfall is half ' +
      'the ranking function',
    screen: 'world',
    asserts: 'client-request',
    tier: 'T1',
    gate: true,
    serverRule: 'the visitor is the authenticated subject and a non-user subject is refused',
    ownedBy: 'tessera/src/discovery.ts#recordVisit',
  },
  {
    id: 'BJ-TES-05',
    what:
      'the arrivals list holds one entry per parcel the ward returned, shut gates included, and ' +
      'each entry names its gate state — a world that hid its closed buildings would feel empty ' +
      'while being full',
    screen: 'world',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-TES-06',
    what:
      "the object cap on screen is the parcel's own `objectCap` from the response, not five per " +
      'eight tiles recomputed here — a client that derived the cap would keep printing the old ' +
      'one after the schema changed it',
    screen: 'world',
    asserts: 'presentation',
    tier: 'T1',
    serverRule: 'the cap is GENERATED in the database and no statement can raise it (§6.2)',
    ownedBy: 'tessera/src/migrations.ts#object_cap',
  },

  /* ══ the wards: occupancy, and which instance holds whom ═══════════════════════════════════ */

  {
    id: 'BJ-TES-07',
    what:
      "the ward's own page names which instance holds whom, per person — a friend you cannot " +
      'find is worse than a crowd you cannot join, and a headcount does not answer the question',
    screen: 'wards',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
    implementedIn: 'test/screens.test.ts',
  },
  {
    id: 'BJ-TES-08',
    what:
      "occupancy is printed from the service's own figure and never recomputed from the tile " +
      'counts beside it — 70% is the trigger that mints the next ward, and a client doing that ' +
      'arithmetic would disagree with the service about when the world grows',
    screen: 'wards',
    asserts: 'presentation',
    tier: 'T1',
  },

  /* ══ the land: claim, gate, bank, and the fallow clock ════════════════════════════════════ */

  {
    id: 'BJ-TES-09',
    what:
      'a claim carries exactly the four fields the service reads and nothing that could carry a ' +
      'price — land is claimed free and the platform never sells it, and a hidden price field ' +
      'that still posted would pass a check that only read the form',
    screen: 'land',
    asserts: 'client-request',
    tier: 'T1',
    gate: true,
    implementedIn: 'test/screens.test.ts',
  },
  {
    id: 'BJ-TES-10',
    what:
      'all four tiers are offered, including the one this account may already hold — hiding it ' +
      'would be this client deciding, and a test of the hidden option would pass against a ' +
      'service that had stopped enforcing it',
    screen: 'land',
    asserts: 'presentation',
    tier: 'T1',
    implementedIn: 'test/screens.test.ts',
    serverRule: 'a second Homestead is unrepresentable — a partial unique index, not a validator',
    ownedBy: 'tessera/src/migrations.ts#tessera_one_homestead',
  },
  {
    id: 'BJ-TES-11',
    what:
      'every fallow state the service can send is rendered as the sentence that state means, and ' +
      'a state this client does not recognise is shown as itself — defaulting to "Live." would ' +
      'tell somebody their land was safe on the day it became contestable',
    screen: 'land',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
    serverRule: 'fallow is computed lazily on read against the database clock (§4, §11.4)',
    ownedBy: 'tessera/src/world.ts#fallowState',
  },
  {
    id: 'BJ-TES-12',
    what:
      'banking sends the parcel id and an empty body, and is offered on a parcel that has ' +
      'already been banked — a client that hid the control would be counting a year on the ' +
      "user's own clock, which is the clock the rule is deliberately not read from",
    screen: 'land',
    asserts: 'client-request',
    tier: 'T1',
    serverRule: 'one bank per year, evaluated on the database clock',
    ownedBy: 'tessera/src/world.ts#bankParcel',
  },
  {
    id: 'BJ-TES-13',
    what:
      "the gate control sends the negation of the state the SERVICE last reported, so pressing " +
      'it twice against a service that did not change anything sends the same value twice rather ' +
      'than oscillating a local guess',
    screen: 'land',
    asserts: 'client-request',
    tier: 'T1',
  },

  /* ══ the Kiln: prompt → 202 → poll ════════════════════════════════════════════════════════ */

  {
    id: 'BJ-TES-14',
    what:
      'a 202 is not proof of anything: the page reports the object as still firing until the ' +
      'poll returns a terminal state, and only then names the checksum — studio answers 202 ' +
      'before it has touched a model, so a page that read acceptance as success would tell a ' +
      'creator their object exists before anything had been generated',
    screen: 'kiln',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
    serverRule: 'generation is a leased job; the 202 is an enqueue and not a result',
    ownedBy: 'studio/src/generation.ts#runGeneration',
  },
  {
    id: 'BJ-TES-15',
    what:
      'a firing that ends in the failed state says so, says nothing was charged for it, and the ' +
      'polling STOPS — a poll with no terminal condition is a tab making a request every two ' +
      'seconds overnight against a job that died',
    screen: 'kiln',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-TES-16',
    what:
      'a Kiln with no upstream is reported as a supported state of the world in the service\'s ' +
      'own words, announced as status rather than as an alert — a generic failure invites a ' +
      'retry that cannot work',
    screen: 'kiln',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
    implementedIn: 'test/screens.test.ts',
    noServerRule:
      'the 503 kiln_unconfigured is arranged by the scenario; what is asserted is the sentence ' +
      'and the ARIA role this client chose for it, which is doc 22 §3.4 exactly.',
  },
  {
    id: 'BJ-TES-17',
    what:
      'two footprints are offered and only two, because §6.3 has two — a third control here ' +
      'would be a control whose only outcome is a 400',
    screen: 'kiln',
    asserts: 'presentation',
    tier: 'T1',
    implementedIn: 'test/screens.test.ts',
  },
  {
    id: 'BJ-TES-18',
    what:
      'the 96 platform seed objects are named as unreachable rather than replaced by the ' +
      "caller's own shorter list — they are the counterweight that makes paying for Kiln " +
      'capacity honest, and a screen that quietly showed six would misrepresent the free tier',
    screen: 'kiln',
    asserts: 'presentation',
    tier: 'T1',
    implementedIn: 'test/screens.test.ts',
  },

  /* ══ discover: two signals, neither for sale ══════════════════════════════════════════════ */

  {
    id: 'BJ-TES-19',
    what:
      'the feed renders in the order the service returned it, with BOTH ranking inputs beside ' +
      'each score on every row — discovery is one of the things the no-pay-to-win argument says ' +
      'can never be bought, and a reader who cannot see why something ranks cannot check that',
    screen: 'discover',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
    serverRule: 'rankParcels reads visits and parcels and admits exactly two inputs (§6.5)',
    ownedBy: 'tessera/src/discovery.ts#rankParcels',
  },
  {
    id: 'BJ-TES-20',
    what:
      'the feed is asked for with no ordering parameter of any kind — a client that could send ' +
      'one is the first half of a paid ranking, and there is no sort control for it to come from',
    screen: 'discover',
    asserts: 'client-request',
    tier: 'T1',
    gate: true,
    implementedIn: 'test/screens.test.ts',
  },
  {
    id: 'BJ-TES-21',
    what:
      'narrowing to one ward sends `wardId` and STILL sends nothing else — the ward filter is ' +
      'the one permitted parameter, and the request that carries it is where a second one would ' +
      'first appear',
    screen: 'discover',
    asserts: 'client-request',
    tier: 'T1',
  },

  /* ══ the workshop: the terms, and the split every price makes ═════════════════════════════ */

  {
    id: 'BJ-TES-22',
    what:
      "the fee, royalty and proceeds shown against a listing are the service's own figures and " +
      'not this client multiplying the price by the basis points beside it — the split is proved ' +
      'server-side three ways including a database CHECK, and a client that recomputed it would ' +
      'show a partition that agreed with itself while the real one drifted',
    screen: 'workshop',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
    serverRule: 'fee + royalty + proceeds === price, by construction and by constraint',
    ownedBy: 'market/src/money.ts#assertPartition',
  },
  {
    id: 'BJ-TES-23',
    what:
      'the equal-terms claim on screen is the flag the service sent — the whole no-pay-to-win ' +
      'argument turns on the rate being the same for everyone, and a client that derived that ' +
      'sentence from its own state would be a promise checking itself',
    screen: 'workshop',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
    implementedIn: 'test/screens.test.ts',
  },
  {
    id: 'BJ-TES-24',
    what:
      'a service that stops stating the equal-terms claim produces a DIFFERENT sentence — ' +
      'without this the scenario above compares a constant with itself',
    screen: 'workshop',
    asserts: 'presentation',
    tier: 'T1',
    implementedIn: 'test/screens.test.ts',
  },
  {
    id: 'BJ-TES-25',
    what:
      "the royalty field's range is the WIRE's 0–10000 while the cap is shown beside it as text " +
      '— clamping the input to the cap would be this client asserting the rule, and a test of ' +
      'the clamp would pass against a service that had stopped enforcing it',
    screen: 'workshop',
    asserts: 'presentation',
    tier: 'T1',
    serverRule: 'the royalty cap, and listings_terms_leave_the_seller_something',
    ownedBy: 'market/src/migrations.ts#listings_terms_leave_the_seller_something',
  },
  {
    id: 'BJ-TES-26',
    what:
      "a price that is blank, zero or fractional never reaches the wire — BigInt('') is 0n, and " +
      'on a listing form that is an object given away for nothing',
    screen: 'workshop',
    asserts: 'client-request',
    tier: 'T1',
    gate: true,
    implementedIn: 'test/screens.test.ts',
  },

  /* ══ the wallet strip, which is on every screen ═══════════════════════════════════════════ */

  {
    id: 'BJ-TES-27',
    what:
      'a balance route that answers 503 leaves the strip with no digit anywhere on it — a zero ' +
      'on a screen about somebody\'s earnings is a claim, and "we have none" and "we could not ' +
      'ask" must never look the same',
    screen: 'shell',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
    implementedIn: 'test/screens.test.ts',
    noServerRule:
      'the 503 is arranged by the scenario. What is asserted is that this client prints no figure ' +
      'it was not given, which is a property of the strip and of nothing else.',
  },
  {
    id: 'BJ-TES-28',
    what:
      'a balance that really is zero reads as zero, and an absent one does not — `!0n` is true, ' +
      'so one lazy falsy check tells a user with no money that the service is broken and a user ' +
      'the service cannot answer for that they have none',
    screen: 'shell',
    asserts: 'presentation',
    tier: 'T1',
    implementedIn: 'test/screens.test.ts',
  },
  {
    id: 'BJ-TES-29',
    what:
      'the strip reads the balance route once and asks for nobody in particular — a subject ' +
      "parameter here is somebody else's earnings on your screen",
    screen: 'shell',
    asserts: 'client-request',
    tier: 'T1',
    implementedIn: 'test/screens.test.ts',
  },

  /* ══ doc 22 §5.1 — the universal per-surface property ═════════════════════════════════════ */

  {
    id: 'BJ-TESSERA-404',
    what:
      'an address this surface does not own renders the not-found screen inside the shell, and ' +
      'nginx serves it UNDER a 404 — `try_files $uri /index.html` answers 200 for every address ' +
      'in existence, so search engines index the error screen and a deploy that dropped a route ' +
      'would look exactly like one that did not',
    screen: 'not-found',
    asserts: 'navigation',
    tier: 'T2',
    expectStatus: 404,
    ownedBy: 'tessera-web/test/routes.test.ts#error_page 404',
  },

  /* ══ doc 22 §6.19 — the adversarial matrix, for this surface's three commit points ════════ */

  {
    id: 'BJ-ADV-TES-01-H1',
    what:
      'double-pressing Fire it produces exactly one firing — a firing costs real USD at the ' +
      'provider, so a second one is money as well as a duplicate object',
    screen: 'kiln',
    asserts: 'client-request',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-ADV-TES-01-H3',
    what: 'two tabs, one firing: exactly one object, and the losing tab says so in words',
    screen: 'kiln',
    asserts: 'client-request',
    tier: 'T3',
    blocked:
      'two browser contexts against one service. Doc 22 §4 makes that tier 3 by definition and ' +
      'puts tier 3 in micro-beacon; nothing in this repository can hold two browsers open. The ' +
      'single-context half — one mount, two presses, one request — is BJ-ADV-TES-01-H1, and the ' +
      'serialisation itself is micro-studio\'s lease on `owner:<subject>`. Not a fact about a ' +
      'file, so no blockedWhile: it is a fact about how many browsers exist.',
  },
  {
    id: 'BJ-ADV-TES-01-H5',
    what: 'the session expires between describing an object and firing it',
    screen: 'kiln',
    asserts: 'presentation',
    tier: 'T3',
    blocked:
      'the re-authentication path leaves this bundle entirely: `signIn()` assigns ' +
      "`location.href` to micro-identity's authorize URL, and happy-dom will not follow a " +
      'navigation to a second origin. Doc 22 §6.19 already puts H5 at tier 3 for every form in ' +
      'the estate for the same reason. Not a fact about a file, so no blockedWhile.',
  },
  {
    id: 'BJ-ADV-TES-02-H1',
    what: 'double-pressing List it produces exactly one listing',
    screen: 'workshop',
    asserts: 'client-request',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-ADV-TES-02-H4',
    what:
      'a listing the service refuses leaves the form filled in, states the failure in the ' +
      "service's words, and offers the request id — a form that clears itself on a failure makes " +
      'the user retype the thing that was refused without telling them why',
    screen: 'workshop',
    asserts: 'presentation',
    tier: 'T1',
    noServerRule:
      'the refusal is arranged by the scenario. What is asserted is doc 22 §3.4 exactly: the ' +
      'sentence the user is shown, and whether the form kept their input.',
  },
  {
    id: 'BJ-ADV-TES-03-H1',
    what: 'double-pressing Claim this ground claims exactly once',
    screen: 'land',
    asserts: 'client-request',
    tier: 'T1',
  },
  {
    id: 'BJ-ADV-22',
    what:
      'degraded, not down: a screen whose reads answer slowly paints what it has, marks the slow ' +
      'part as pending, and leaves nothing hanging — a page that waits for its slowest upstream ' +
      'before showing anything turns one slow service into a broken product',
    screen: 'workshop',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-ADV-23',
    what:
      'every failure state carries the request id to quote to support — an error with no id is ' +
      'an error nobody can find in a log',
    screen: 'workshop',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
  },

  /* ══ doc 22 §6.20 — accessibility ═════════════════════════════════════════════════════════ */

  {
    id: 'BJ-A11Y-01',
    what: 'axe on every route of this surface: zero serious or critical violations',
    screen: 'shell',
    asserts: 'presentation',
    tier: 'T2',
    gate: true,
    blocked:
      'axe-core is not installed anywhere in the estate and doc 22 §1 records that as true of all ' +
      'fifteen bundles. Adding it here would hold ONE surface to a rule the other fourteen are ' +
      'not held to, and doc 22 §7.2 makes the axe sweep estate-wide by construction ("Any PR in ' +
      'ui — every surface\'s T1 axe set"), which puts it in the shared design system rather than ' +
      'in this repository. What is asserted here without an engine is BJ-A11Y-10 and -12.',
    blockedWhile: { absent: 'ui/packages/ui/package.json#axe-core' },
  },
  {
    id: 'BJ-A11Y-10',
    what:
      'colour is never the only channel: an open gate and a shut one differ by a WORD, not only ' +
      'by a swatch — this world sorts its places by whether you can walk in',
    screen: 'world',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-A11Y-12',
    what:
      'one main landmark, a skip link that is the first focusable thing and becomes visible when ' +
      'it takes focus, and a heading order with no level skipped',
    screen: 'shell',
    asserts: 'presentation',
    tier: 'T1',
  },

  /* ══ recorded rather than omitted: what this client cannot carry, and why ═════════════════ */

  {
    id: 'BJ-TES-30',
    what: 'clicking an object on the canvas selects that object and no other',
    screen: 'world',
    asserts: 'presentation',
    tier: 'T1',
    blocked:
      'object picking is DELIBERATELY unimplemented. `WorldRenderer.tileAt` resolves a point to ' +
      'GROUND only, and its own comment says why: picking the object under a point needs the ' +
      'depth order and the sprite\'s alpha, and "an approximate version would be worse than none: ' +
      'a build tool that picks the wrong object is a tool that deletes the wrong object". A ' +
      'scenario written now would be a scenario written against a feature whose absence is the ' +
      'design.',
    blockedWhile: {
      present: 'tessera-web/src/render/renderer.ts#Picking the OBJECT under a point',
    },
  },
  {
    id: 'BJ-TES-31',
    what: 'placing an object from the tray sends one batch, and the whole paste is one request',
    screen: 'world',
    asserts: 'client-request',
    tier: 'T1',
    blocked:
      'there is no build tool. `placeObjects` and `removePlacement` are declared in ' +
      'src/lib/tessera.ts against real routes and no page calls either of them — the world screen ' +
      'is read-only so far. The batching property they exist for (one transaction, so the ' +
      'deferred object-cap trigger checks once rather than N times) has nothing on screen to ' +
      'drive it.',
    blockedWhile: { absent: 'tessera-web/src/pages/world.tsx#placeObjects' },
  },
  {
    id: 'BJ-TES-32',
    what: 'the ground under a parcel is the ground the service says is there',
    screen: 'world',
    asserts: 'presentation',
    tier: 'T1',
    blocked:
      'micro-tessera serves no terrain and the Ward carries no seed, so src/render/terrain.ts ' +
      'lays ground out from the archetype as a RENDERING choice with no authority — which that ' +
      'file states at length. A scenario asserting the ground is correct would be asserting this ' +
      'client agrees with itself. The gap is recorded in MISSING_ROUTES and citations.test.ts ' +
      'goes red the day the route lands.',
    blockedWhile: { absent: 'tessera/src/server.ts#/v1/wards/:id/terrain' },
  },
  {
    id: 'BJ-TES-33',
    what: 'the 96 platform seed objects are browsable, and every account sees the same 96',
    screen: 'kiln',
    asserts: 'presentation',
    tier: 'T1',
    blocked:
      '`GET /v1/objects` returns only the caller\'s own fired objects, so there is no route this ' +
      'client can call to list the seed set. BJ-TES-18 asserts the honest version — that the ' +
      'screen names them as unreachable rather than showing a shorter list. This unblocks when ' +
      'MISSING_ROUTES stops recording the gap, which citations.test.ts forces the day a route ' +
      'lands.',
    blockedWhile: {
      present: 'tessera-web/src/lib/tessera.ts#a route for the 96 platform seed objects',
    },
  },
  {
    id: 'BJ-TES-34',
    what: 'somebody arriving in a ward appears on the ward page without a reload',
    screen: 'wards',
    asserts: 'presentation',
    tier: 'T1',
    blocked:
      'presence is push-on-change — a move writes a row and raises a Postgres NOTIFY, and the SSE ' +
      'handler forwards it (§4) — and this bundle consumes no event stream at all: there is no ' +
      'EventSource anywhere in src/. The ward page reads presence once per open. The scenario is ' +
      'writable the day this client subscribes.',
    blockedWhile: { absent: 'tessera-web/src/lib/tessera.ts#EventSource' },
  },
  {
    id: 'BJ-TES-35',
    what: 'the canvas actually paints the parcel, and the sprites land where the projection says',
    screen: 'world',
    asserts: 'presentation',
    tier: 'T3',
    blocked:
      'happy-dom does not rasterise. This suite gives the canvas a RECORDING 2D context so the ' +
      "renderer's own loop runs and its FrameStats can be read as text, which is what BJ-TES-01 " +
      'to -03 assert — but no pixel is produced and none is asserted. The geometry is covered ' +
      'without a browser by test/iso.test.ts, and the cost of drawing it by pnpm measure against ' +
      'a real Chromium. What is left is a genuine tier 3 job for micro-beacon. Not a fact about ' +
      'a file, so no blockedWhile.',
  },
  {
    id: 'BJ-TES-36',
    what:
      'the Confirming figure shows an observed deposit and its depth — "5,000 Sparks, 34 of 60" ' +
      '— while staying out of every total',
    screen: 'shell',
    asserts: 'presentation',
    tier: 'T1',
    blocked:
      'Confirming is NOT a ledger balance and must never become one: posting a liability before ' +
      '60 confirmations is convertCoinToEmber, the estate\'s oldest defect. It comes from the ' +
      "indexer, and micro-tessera's balance route reads the ledger — its body carries " +
      'availableWei, reservedWei and payoutDueWei and no confirming figure at all. The strip ' +
      'renders the label and "Not available yet", which BJ-TES-29 asserts survives even a fully ' +
      'successful read.',
    blockedWhile: { absent: 'tessera/src/server.ts#confirmingWei' },
  },
]

export const byId = (id: string): Scenario => {
  const found = SCENARIOS.find((s) => s.id === id)
  if (!found) throw new Error(`no scenario ${id} in test/journeys.ts`)
  return found
}

export const isImplemented = (s: Scenario): boolean => s.blocked === undefined

/** Where a scenario's test lives, relative to this repository. */
export const homeOf = (s: Scenario): string => s.implementedIn ?? 'test/journeys.test.ts'

/* ── the meta-checks ───────────────────────────────────────────────────────────────────────── */

export interface Finding {
  readonly id: string
  readonly problem: string
}

/**
 * The vocabulary of a scenario whose outcome somebody else decides.
 *
 * Matched against `what` — short, authored text — and never against the surrounding prose, because
 * six guards in this estate have already been found firing on their own written-down rationale.
 */
const REFUSAL =
  /\b(refus\w*|denied|deny|forbidden|403|401|rejected|unrepresentable|not permitted|unauthorised)\b/i

export function checkCatalogue(scenarios: readonly Scenario[]): Finding[] {
  const findings: Finding[] = []
  const seen = new Set<string>()

  for (const s of scenarios) {
    if (!/^BJ-[A-Z0-9]+(-[A-Z0-9]+)*$/.test(s.id)) {
      findings.push({ id: s.id, problem: 'id is not a BJ- identifier' })
    }
    if (seen.has(s.id)) findings.push({ id: s.id, problem: 'duplicate id' })
    seen.add(s.id)

    // Long enough that it has to be a defect rather than a step. "Clicking Buy works" fits in
    // twelve characters; "a second order is created" does not.
    if (s.what.trim().length < 40) findings.push({ id: s.id, problem: 'what says nothing' })

    if (s.blocked) {
      if (s.blocked.trim().length < 40) {
        findings.push({ id: s.id, problem: 'is blocked without saying what the blocker is' })
      }
      const where = s.blockedWhile
      if (where && !where.absent && !where.present) {
        findings.push({ id: s.id, problem: 'blockedWhile names neither an absent nor a present anchor' })
      }
      for (const anchor of [where?.absent, where?.present]) {
        if (anchor && !/^[\w.-]+\/[^\s#]+#.+$/.test(anchor)) {
          findings.push({ id: s.id, problem: `blockedWhile "${anchor}" is not a <repo>/<path>#<string>` })
        }
      }
      continue
    }

    if (s.serverRule && !s.ownedBy) {
      findings.push({ id: s.id, problem: `turns on "${s.serverRule}" and names no ownedBy` })
    }
    if (s.asserts === 'navigation' && s.expectStatus === undefined) {
      findings.push({ id: s.id, problem: 'asserts navigation without declaring the status it expects' })
    }
    if (
      s.asserts === 'navigation' &&
      s.expectStatus !== undefined &&
      (s.expectStatus < 200 || s.expectStatus > 299) &&
      !s.ownedBy
    ) {
      findings.push({ id: s.id, problem: `expects HTTP ${s.expectStatus} and names no ownedBy` })
    }
    if (REFUSAL.test(s.what) && !s.ownedBy && !s.serverRule && !s.noServerRule) {
      findings.push({
        id: s.id,
        problem:
          'describes a refusal. Name the server test that owns it in ownedBy, restate it as the ' +
          'sentence the user is shown, or say in noServerRule why no server rule is involved',
      })
    }
    if (s.noServerRule && s.noServerRule.trim().length < 40) {
      findings.push({ id: s.id, problem: 'noServerRule is a shrug rather than a reason' })
    }
    if (s.noServerRule && (s.ownedBy || s.serverRule)) {
      findings.push({ id: s.id, problem: 'claims both that a server rule owns it and that none does' })
    }
    if (s.ownedBy && !/^[\w.-]+\/[^\s#]+(#.+)?$/.test(s.ownedBy)) {
      findings.push({ id: s.id, problem: `ownedBy "${s.ownedBy}" is not a repo-relative path` })
    }
    if (s.tier === 'T3') {
      findings.push({
        id: s.id,
        problem: 'is tier 3 and not blocked — tier 3 lives in micro-beacon (doc 22 §2.2)',
      })
    }
  }
  return findings
}

/**
 * Does the path exist, and does the string it names appear in it?
 *
 * Resolvable only where the sibling repository is on disk — true in a working tree, false in CI,
 * where web-ci.yml checks out this repository and micro-ui and nothing else. So the three outcomes
 * are distinguished and REPORTED rather than collapsed into a pass: a check whose result does not
 * depend on anything is the defect this whole suite exists to stop producing.
 */
export function resolve(ref: string): 'resolved' | 'missing' | 'unavailable' {
  const [path, anchor] = ref.split('#')
  const repo = (path ?? '').split('/')[0] ?? ''
  if (!existsSync(join(ESTATE, repo))) return 'unavailable'
  const full = join(ESTATE, path ?? '')
  if (!existsSync(full)) return 'missing'
  if (anchor && !readFileSync(full, 'utf8').includes(anchor)) return 'missing'
  return 'resolved'
}
