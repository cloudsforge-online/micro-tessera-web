# micro-tessera-web

[![ci](https://github.com/cloudsforge-online/micro-tessera-web/actions/workflows/ci.yml/badge.svg)](https://github.com/cloudsforge-online/micro-tessera-web/actions/workflows/ci.yml)
![licence](https://img.shields.io/badge/licence-MIT-97CA00)
![node](https://img.shields.io/badge/node-%3E%3D22-5FA04E?logo=node.js&logoColor=white)
![typescript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![module](https://img.shields.io/badge/module-ESM-F7DF1E?logo=javascript&logoColor=black)
![tests](https://img.shields.io/badge/tests-in--process%20DOM-6E56CF)

The client for **Tessera**, the fourth Forge Worlds title: a persistent, user-made isometric world
you enter in a browser tab. Claim ground for free, fire an object out of a prompt, open a place
people go to, and get paid in EMBER when someone buys what you made.

The design authority is `docs/ecosystem/23-tessera.md`. This repository implements §10's second
row: the canvas renderer, the ward map, build-and-place, the Kiln, Workshop pages and the
three-figure wallet strip.

```
pnpm install          # @cloudsforge/ui is link:../ui/packages/ui — the sibling must be checked out
pnpm dev              # vite 5172
pnpm test             # node:test, 101 tests
pnpm typecheck
pnpm build
pnpm measure          # drives a real Chromium; writes docs/render-budget.json. Minutes, not seconds.
bash test/red.sh      # breaks all 50 guards in turn and requires each to go red
```

---

## Read this first: `docs/RENDER-BUDGET.md`

§13 of the design records browser render cost for a densely built parcel as **"the riskiest
unmeasured number in the document"** and says the object caps in §6.2 were *reasoned, not
measured*. It has been measured, on a real Chromium through a verified GPU, against the real
512×512 FLUX bytes in `micro-tessera-assets`.

**Short version.** 640 sprites in a Plot holds **63 fps at 4× CPU throttling** with the cap fully
spent and the whole claim on screen — §6.2's Plot cap survives. The Court and Quarter caps do not
(20 fps and 5 fps), **but §6.2 should not change**: a per-parcel cap binds a renderer at exactly
one zoom and binds nothing either side of it. The fix belongs in this client and is implemented as
a measured zoom floor. The document has the numbers, the method, the machine, and the three things
that went wrong on the way.

---

## What `micro-deploy` must set

Every item is required. Nothing here is optional and this repository cannot do any of it.

| What | Value | Why |
| --- | --- | --- |
| `IDENTITY_HANDOFF_ORIGINS` | add this client's origin — `http://localhost:5172` in dev, `https://tessera.<apex>` in production | Sign-in is inherited, not rebuilt: clients post to `POST /auth/handoff/redeem` and `micro-identity` refuses an origin not on that list rather than minting a code that could not be redeemed. **Without this, every Sign in button on this surface fails silently.** |
| Compose services | `cf-tessera` 4140, `cf-web-tessera` 4141 | §10.1. The next after aetherholm-web's 4139. `cf-web-aetherholm` in `deploy/gateway/dynamic/estate-web.yml` is the pattern. |
| Gateway route | `tessera.<apex>` → `cf-web-tessera`, and the API on the same hostname per the registry | The `tessera` surface row now exists in `ui/packages/ui/src/surfaces.ts`. |
| **`/world-assets/`** | map the path on **this client's own origin** to wherever `micro-tessera-assets` is materialised, **`SET.json` included** | The single item most likely to be missed. The mount must be exactly what `materialise.py --into` wrote: the client reads `/world-assets/SET.json` first and resolves every sprite through it, so a mount that serves the PNGs while excluding the receipt renders as a world with no art and reports itself as unmounted. Same-origin, deliberately: a ward costs several hundred image requests and a cross-origin path puts a CORS preflight in front of every one. The art is **not** in this image — baking 392 PNGs into the bundle would mean rebuilding and re-promoting the client to change one chair. Until the mapping exists, nginx 404s and the client names each missing sprite on screen rather than substituting anything. |
| CORS on `micro-tessera` | allow this client's origin | The client and the service are separate surfaces even in production, so every API call is cross-origin. |
| Scope grants | `tessera:read`, `tessera:write` | Registered by the service. |
| Smoke check | `GET /discover` must answer **200** on a hard refresh | It is a real route and needs no session, which is why it is `DEEP_LINK_PATH`. A probe with no token against a protected route gets a 200 and a sign-in prompt, which it cannot tell from a working page. |

Note the nginx rule this image ships and why: **`error_page 404 /index.html`, never
`try_files $uri /index.html`.** The routes are enumerated so an unknown address answers 404 while
still serving the app shell. `test/routes.test.ts` holds `nginx.conf`, `src/lib/routes.ts` and
`src/app.tsx` against each other.

---

## Routes this client needs and `micro-tessera` does not serve

They are **data**, in `MISSING_ROUTES` (`src/lib/tessera.ts`), not TODO comments — so
`test/citations.test.ts` can assert each is *still absent* and go red when one lands, naming the
screen that was waiting.

1. **`GET /v1/me/balances`** — for the wallet strip. §8.2 specifies three figures that mean three
   different things: Available (`available`), Clearing (`payout_due`), Confirming (from the
   *indexer*, in no balance and no total, because posting a liability before 60 confirmations is
   the estate's oldest defect). `micro-tessera` holds a ledger client and hangs no read route off
   it. **The strip therefore prints no digit at all** — a zero would be `BigInt('') === 0n` wearing
   a label, and on a screen showing somebody's earnings that is nothing displayed as something.
2. **Ward terrain, or a `seed` on the `Ward`** — §4 says a ward is generated from the world seed,
   but `Ward` carries only `archetype` and no route returns ground. `src/render/terrain.ts` lays
   ground out from the archetype with a hash of the tile coordinate, and says at length that this
   is a *picture* with no authority: nothing it produces is ever sent anywhere.
3. **A sprite path on `WorldObject`, and a route for the 96 seed objects** — a placement names an
   `objectId`; the object's only byte-level field is `checksum`. Nothing maps an object to a path,
   and `GET /v1/objects` returns only the caller's *own* fired objects, so the 96 platform seed
   objects that are "free to every account forever" (§2.6) are unreachable from a client. The Kiln
   screen says so in those words rather than working around it.

Everything this client *does* call is a named function in `src/lib/tessera.ts` carrying the content
anchor in `tessera/src/server.ts` it was verified against, resolved by `@cloudsforge/ui/cite`
against the sibling checkout. `@cloudsforge/ui` once posted the SSO callback to `/auth/exchange`, a
route identity has never served, and the test pinning it compared the URL with a copy of itself.

---

## Two rules this client keeps that are easy to break

**It asserts no business rule.** Every rule is asserted server-side, and the client test asserts
only that the client sends what it claims to send. So: the Homestead tier is offered even though a
second one is unrepresentable in the database; the royalty input maxes at the wire's range rather
than the cap; the object cap is displayed and never enforced; and `POST /v1/parcels` carries no
price because there is no price. A game client once withheld four SKUs from its UI while the
payment routes stayed live and chargeable, and a client-side test of the hidden catalogue would
have passed against that defect.

**Money is `bigint`, arriving as decimal strings.** `src/lib/money.ts` refuses everything `BigInt`
silently accepts — `''`, `' 12 '`, `'0x10'` — with a regex *before* `BigInt` is called, the way
`market/src/money.ts` makes the hazard unreachable rather than handled.
`parseAmountOrNull` returns `null` for absent and `0n` for a real zero, because a balance that has
not arrived and a balance of zero look identical once both are numbers.

---

## Testing

`node:test` only, real components rendered into `happy-dom`, elements addressed by accessible role
and name. `mount()` **refuses to return a screen whose body is under 40 characters** — a bundle
that 404s leaves the network perfectly idle and `domcontentloaded` fires anyway, so a smoke test
passes against a blank page.

### The browser-journey catalogue

`test/journeys.ts` is this surface's slice of `docs/ecosystem/22-browser-journeys.md` **as data**,
and `test/journeys.test.ts` runs it. **Doc 22 predates Tessera entirely** — it enumerates fifteen
bundles and this is not one of them, and its adversarial matrix stops at `BJ-ADV-21` — so the ids
are *allocated here* rather than transcribed, which `journeys.ts` states along with what should
happen to them when doc 22 is next revised.

**40 scenarios run; 10 are recorded as blocked, with the reason.** Seven of those ten carry a
`blockedWhile` anchor — a `<repo>/<path>#<string>` a meta-test resolves — because a blocker is a
claim about the estate written at one moment and a claim nothing checks is a claim that rots. When
the terrain route lands, or a build tool starts calling `placeObjects`, or `micro-ui` installs
axe-core, the blocker goes **stale and red** and names the scenario that is now writable. Without
that, a gap that has quietly closed reads exactly like a gap that is still open.

Four meta-tests hold the catalogue together, and a fifth proves *they* can fail: a scenario whose
outcome turns on a server rule must name the test that owns it (doc 22 §3.2); every `ownedBy` that
can be resolved must resolve; **every screen must carry at least one scenario that runs**; and a
scenario cannot be declared, counted and never written.

### The asset path: a complete, validated mount that rendered every tile as a hole

The most instructive failure this repository has had, and **everything upstream of it was
correct**. `micro-deploy`'s `scripts/estate-verify.sh` found it by driving the estate rather than
reading it:

```
client   GET /world-assets/tiles/ashfield-ground-a.png       404
mount        /world-assets/tiles/ashfield-ground-a-256x128.png
```

The asset set was complete — 392 entries, reconciled both directions with zero orphans, every byte
served identically through the container, the mount validator proven by removing one file and
watching it fail at 391/392. And the world rendered nothing, because **this client composed a
filename out of an identity**: `fetch(\`${assetBase()}/${path}.png\`)`. Every materialised filename
carries its delivered size; no identity does.

**This side was wrong.** The contract was never ambiguous — `providers.json` declares the identity
block, `MANIFEST.json` carries `asset` and `path` as different strings on all 392 entries, and
`materialise.py` writes `SET.json` mapping one to the other. Nothing was asked of
`micro-tessera-assets`; nothing there changed. The suffix is meaningful besides: the 96 terrain
tiles are *derived*, cut and projected from 32 plates by `project_iso.py`, and `-256x128` records
the geometry that produced them.

So `src/lib/asset-set.ts` reads the mount's own receipt and `src/lib/sprites.ts` composes nothing.
A file renamed in the set now resolves; an *identity* that diverges is a hole with a name and a
reason on screen. **An nginx rewrite was refused** for the reason `estate-verify.sh` gives: it
would leave two naming conventions in the estate with the invisible one in the deploy, where
neither repository would look.

Why thirty-eight implemented scenarios missed it: **not one of them had ever served a sprite.**
`createImageBitmap` exists in neither Node nor happy-dom, so every 200 threw and landed in `failed`
exactly like a 404 — so every world scenario stubbed `/world-assets/` as 404 and asserted the shape
of a world with no art in it, which is identical to the shape of this defect. `MountOptions.
decodeImages` closes that, and `BJ-TES-37` drives the real set: the receipt built from
`micro-tessera-assets`' own `MANIFEST.json`, a 200 for exactly the paths it names and a 404 for
everything else. It asserts `FrameStats.ground`, the renderer's count of tiles it actually drew.

Driven, not asserted — the same 392-asset mount, two bundles, one real Chromium:

| | requests to `/world-assets/` | ground drawn | canvas |
| --- | --- | --- | --- |
| before | 3, **all 404**, at `tiles/ashfield-ground-a.png` | 0 | 0 of 756,000 pixels painted |
| after | 4, **all 200**, at `SET.json` and `tiles/ashfield-ground-a-256x128.png` | **256 tiles** | 361,706 of 756,000 painted |

`python3 materialise.py --provider flux-2-pro --into <dir>` in `micro-tessera-assets`, that
directory mounted at `/usr/share/nginx/html/world-assets` in this image, `/v1/*` stubbed at the
browser and nothing else.

The screen could not have told anyone either, and that is fixed in the same change: the live region
counted **objects** only, so a world standing on solid ground and a world with nothing under it
produced the same sentence — and `setStats` did not even re-render on a change in the ground count,
so the missing tiles were never listed. The canvas now says how much floor it drew, and an empty
world says *which* of the two causes it is: no set mounted, or a set mounted whose names this
client cannot resolve. They have different owners.

**One thing for `micro-deploy`**, reported rather than reached into: `scripts/estate-verify.sh`
probes `/world-assets/tiles/ashfield-ground-a.png` as "the path tessera-web's own renderer asks
for". That is no longer a path this client can ask for. The equivalent check is that
`/world-assets/SET.json` is served and that a `files[].path` taken out of it answers 200 — which
the lines just above it already do.

### Proving the tests can fail

`bash test/red.sh` applies one real defect at a time, runs the whole suite, requires a failure and
restores the file. **55 guards, 55 proven red, none stayed green.**

Three of those fifty put back a defect this suite *found* rather than a property it confirmed. All
three commit forms — fire an object, list one, claim ground — guarded themselves with `if (busy)
return` and `disabled={busy}`, and neither can see a second click in the same tick: `busy` is read
out of the render closure, `setBusy(true)` only schedules a render, and `disabled` is not on the
button until that render commits. Two clicks produced **two firings, two listings and two claims**.
A firing has a real marginal cost in USD at the provider. The latch is a ref now.

It **refuses to start unless the baseline is green**, which it did not do at first and which made
it briefly worthless. `mutate` reads a non-zero exit as proof the guard caught the mutation — so
with the suite already failing for an unrelated reason, every mutation reports red without one of
them being caught by anything. That is not hypothetical: `citations.test.ts` goes red the day one
of the routes in `MISSING_ROUTES` lands, and one has (see below).

Three outcomes are printed differently, because confusing any two of them is how a broken check
gets recorded as a working one:

| Report | Meaning |
| --- | --- |
| `ok` | the suite went red; the guard guards |
| `!!` | the suite stayed green; the guard does not guard |
| `??` | the mutation could not be applied; the guard may have moved |
| `--` | **not proven here**: the sibling repository the assertion reads is not checked out, so the test skipped and had nothing to catch |

The last one was added after a run in a scratch directory reported the `/auth/exchange` guard as
broken. It is not: `citations.test.ts` reads `../tessera/src/server.ts` and correctly skips without
it. Applied where `micro-tessera` is checked out, it fails immediately with `cite: nothing in
.../server.ts matches "define('GET', '/v1/discover/promoted'"`. A guard that cannot run is not a
guard that does not work.

## CI

This repository calls the estate's reusable workflow — `.github/workflows/ci.yml` →
`cloudsforge-online/micro-org/.github/workflows/web-ci.yml@main`, plus `secret-hygiene.yml`. It is
**the first frontend outside `micro-web-template` to call it**: web-ci.yml had zero callers and
could not have worked if it had any, because every frontend resolves `@cloudsforge/ui` through
`link:../ui/packages/ui` while the workflow did a single checkout. It now checks micro-ui out as a
sibling and installs it first.

**No run of it has ever been observed, and this section will not pretend otherwise.** GitHub
Actions is billing-blocked across the org: jobs fail in 3–16 seconds with zero steps and no logs.
So every job was reproduced by hand instead, against **fresh clones in a scratch directory** with
only this repository and micro-ui present — which is exactly what web-ci.yml checks out:

* **build** — install sibling, install, typecheck, test, build, `dist/index.html` exists. Beside
  the estate the suite is **101 tests, 101 pass**; in a scratch checkout the assertions that read
  `../tessera` and `../tessera-assets` **skip** rather than pass, which is worth knowing about
  rather than being reassured by.
* **runtime-hosts** — all four checks run verbatim. The first one **failed**, on test fixtures that
  spelled out `import.meta.env.VITE_…` in order to prove the local scanner can fail. The expression
  is assembled now; reading the workflow would not have found that.
* **image** — built with `uipkg` as a named build context, then probed: `/` 200, an unknown path
  404, `/discover` 200, and all five files in `public/` served with the sha256s
  `micro-tessera-assets/MANIFEST.json` records.

What was **not** verified: that GitHub resolves `micro-org/.github/workflows/web-ci.yml@main`, that
`ESTATE_READ_TOKEN` is set on this repository, and that the runner's `cache: pnpm` and
`type=gha` layer cache behave. None of those can be exercised locally, and none of them are green
until somebody sees a run.

### The suite went red beside the estate twice, and both times that was the mechanism working

**`GET /v1/me/balances` landed.** `MISSING_ROUTES` recorded it as absent and `citations.test.ts`
asserts those routes are *still* absent, so the suite failed whenever `../tessera` was checked out
beside this repository, with the message *"wire it up and delete this entry from MISSING_ROUTES"*.
The fix was the wiring, not the deletion: the strip now calls the route, an anchor pins it, and the
test asserts from **both sides** that it is served *and* called — so removing the entry alone
cannot pass. The refusal the strip was built around is unchanged and is now reached by a different
road: the service answers **503 with no figures rather than a zero**, so an empty strip is still a
correct strip. `Confirming` stays unavailable even on a fully successful read, because it is not a
ledger balance and never may be.

**`micro-tessera-assets` regenerated its chrome set**, so the five sha256s `brand-chrome.test.ts`
pins against its `MANIFEST.json` all moved. Same shape, different sibling: an assertion whose other
side is a repository somebody else is working in will go red without this one changing at all. The
files were re-copied and the digests re-pinned *from the manifest*, never from the bytes that
happened to be sitting in `public/`.

`MISSING_ROUTES` still records **three** routes as absent — ward terrain or a `seed`, a sprite path
on `WorldObject`, and a route for the 96 seed objects. Those tests go red the day the routes land.
**That is the mechanism; do not delete them.**

---

## Provenance

The code in this repository was written by **Claude Opus 5** and **Claude Fable 5**, assets
generated with **FLUX 2 Pro**, under human direction and review.
