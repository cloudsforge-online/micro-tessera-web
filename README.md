# micro-tessera-web

The client for **Tessera**, the fourth Forge Worlds title: a persistent, user-made isometric world
you enter in a browser tab. Claim ground for free, fire an object out of a prompt, open a place
people go to, and get paid in EMBER when someone buys what you made.

The design authority is `docs/ecosystem/23-tessera.md`. This repository implements §10's second
row: the canvas renderer, the ward map, build-and-place, the Kiln, Workshop pages and the
three-figure wallet strip.

```
pnpm install          # @cloudsforge/ui is link:../ui/packages/ui — the sibling must be checked out
pnpm dev              # vite 5172
pnpm test             # node:test, 53 tests
pnpm typecheck
pnpm build
pnpm measure          # drives a real Chromium; writes docs/render-budget.json. Minutes, not seconds.
bash test/red.sh      # breaks all 18 guards in turn and requires each to go red
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
| Compose services | `cf-tessera` 4140, `cf-web-tessera` 4141 | §10.1. The next after aetherholm-web's 4139. `cf-web-aetherholm` at `deploy/gateway/dynamic/estate-web.yml:310-315`, `:426-428` is the pattern. |
| Gateway route | `tessera.<apex>` → `cf-web-tessera`, and the API on the same hostname per the registry | The `tessera` surface row now exists in `ui/packages/ui/src/surfaces.ts`. |
| **`/world-assets/`** | map the path on **this client's own origin** to wherever `micro-tessera-assets` is materialised | The single item most likely to be missed. The client asks for `/world-assets/objects/<slug>.png` **same-origin**, deliberately: a ward costs several hundred image requests and a cross-origin path puts a CORS preflight in front of every one. The art is **not** in this image — baking 784 PNGs into the bundle would mean rebuilding and re-promoting the client to change one chair. Until the mapping exists, nginx 404s and the client names each missing sprite on screen rather than substituting anything. |
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
`market/src/money.ts:222-227` makes the hazard unreachable rather than handled.
`parseAmountOrNull` returns `null` for absent and `0n` for a real zero, because a balance that has
not arrived and a balance of zero look identical once both are numbers.

---

## Testing

`node:test` only, real components rendered into `happy-dom`, elements addressed by accessible role
and name. `mount()` **refuses to return a screen whose body is under 40 characters** — a bundle
that 404s leaves the network perfectly idle and `domcontentloaded` fires anyway, so a smoke test
passes against a blank page.

`bash test/red.sh` applies one real defect at a time, runs the whole suite, requires a failure and
restores the file. **18 guards, all proven red.** Two did not guard on the first run and both were
fixed rather than explained; the script prints "mutation not applied" differently from "stayed
green", because confusing those two is how a broken check gets recorded as a working one.

## CI

**There is no workflow in this repository, deliberately, and it is not because CI is unnecessary.**
GitHub Actions is billing-blocked across the org — jobs fail in about four seconds with zero steps
— so a workflow added now would produce a red run that says nothing about this code, and a green
badge here would be a claim nobody verified. Everything above was run locally and the numbers in
this README and in `docs/RENDER-BUDGET.md` are numbers that were seen.
