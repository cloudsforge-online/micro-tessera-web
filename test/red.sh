#!/usr/bin/env bash
#
# BREAK EVERY GUARD, WATCH IT GO RED, PUT IT BACK.
#
# ══════════════════════════════════════════════════════════════════════════════════════════════
# WHY THIS FILE EXISTS
#
# A green suite proves the code passes its tests. It does not prove the tests can fail. This
# estate has, in one evening, produced: six tests that `return`ed instead of skipping and
# therefore passed; a CI rule that INVERTED and reported a live invariant missing; four tests
# grading the wrong function because their citations had drifted; and a self-referential assertion
# where a page was compared against the same constant it rendered from. Every one of those was
# green.
#
# So each mutation below is a defect this repository's guards exist to catch. The script applies
# it, runs the suite, requires a FAILURE, and restores the file. A mutation that leaves the suite
# green is reported as such — that is a guard that does not guard, and finding one is the point.
#
# `pnpm test` is run in full each time rather than one file, because a mutation that breaks the
# suite somewhere OTHER than the guard it targets is also worth knowing about.
#
# Run: bash test/red.sh
# ══════════════════════════════════════════════════════════════════════════════════════════════
set -uo pipefail
cd "$(dirname "$0")/.."

pass=0
fail=0

# ══════════════════════════════════════════════════════════════════════════════════════════════
# THE BASELINE MUST BE GREEN, AND THIS SCRIPT WAS SILENTLY WORTHLESS WITHOUT THIS CHECK.
#
# `mutate` applies a defect and requires `pnpm test` to FAIL. It reads a non-zero exit as proof
# that the guard caught the mutation. If the suite is ALREADY failing for some unrelated reason,
# every mutation "proves red" without any of them being caught by anything — fifty guards reported
# as working, on the strength of one failure that none of them caused.
#
# That is not hypothetical here, and it has now happened twice.
#
#   - `citations.test.ts` asserts that routes recorded in MISSING_ROUTES are still ABSENT from
#     micro-tessera, and goes red the day one lands. `GET /v1/me/balances` landed, and the suite
#     was red whenever `../tessera` was checked out beside this repository. Running this script
#     there would have printed "26 guards proven red" and meant nothing. The fix was to WIRE THE
#     ROUTE UP, which is what the red was for.
#   - `brand-chrome.test.ts` pins five `public/` files against micro-tessera-assets' MANIFEST.json,
#     and that repository regenerated its chrome set. Same shape, different sibling: an assertion
#     whose other side is a repo somebody else is working in will go red without this repository
#     changing at all.
#
# Both are the mechanism working. Neither is a reason to relax the check, and both are reasons the
# baseline gate below has to exist.
#
# So: refuse to start unless the suite is green. It is the same shape as every other rule in this
# file — a check that cannot distinguish success from failure is worse than no check, because
# somebody reads its output and believes it.
# ══════════════════════════════════════════════════════════════════════════════════════════════
if ! pnpm test >/tmp/tessera-red-baseline.log 2>&1; then
  echo "REFUSING TO RUN: the suite is already failing before any mutation is applied."
  echo
  echo "Every mutation below would be reported as 'red' on the strength of this failure rather"
  echo "than on the strength of the guard it targets. Fix the baseline first, or run this where"
  echo "the sibling repositories that some assertions read are not checked out."
  echo
  grep -E '^(not ok|✖|  Assertion|  AssertionError)' /tmp/tessera-red-baseline.log | head -20
  exit 2
fi
echo "baseline: green. Every failure below is therefore attributable to its mutation."
echo

skipped=0

# ══════════════════════════════════════════════════════════════════════════════════════════════
# A GUARD THAT CANNOT RUN IS NOT A GUARD THAT DOES NOT WORK, and this script could not tell the
# difference until it reported one.
#
# Run in a scratch directory with only this repository and micro-ui cloned — which is exactly what
# web-ci.yml checks out, and therefore the shape of every CI run — mutation 8 was reported as "THE
# SUITE STAYED GREEN. This guard does not guard." It guards. `citations.test.ts` reads
# `../tessera/src/server.ts`, correctly SKIPS when that sibling is absent, and a skipped test
# cannot catch anything. Applying the same mutation where micro-tessera is checked out fails it
# immediately, with `cite: nothing in .../server.ts matches "define('GET', '/v1/discover/promoted'"`
# — which is the whole /auth/exchange guard doing its job.
#
# This is the same class of confusion the header already documents for a mutation that misses its
# target: an unhelpful report is worse than no report, because somebody acts on it. The third
# outcome now has its own name and its own count, and `needs` says which sibling makes it real.
# ══════════════════════════════════════════════════════════════════════════════════════════════

# mutate <label> <file> <find> <replace> [sibling-required]
mutate() {
  local label="$1" file="$2" find="$3" replace="$4" needs="${5:-}"
  if [ -n "$needs" ] && [ ! -d "../$needs" ]; then
    printf '  -- %s — NOT PROVEN: ../%s is not checked out, so the guard is skipped rather than run\n' \
      "$label" "$needs"
    skipped=$((skipped + 1))
    return
  fi
  cp "$file" "$file.red-backup"
  python3 - "$file" "$find" "$replace" <<'PY'
import sys
path, find, replace = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(path).read()
if find not in s:
    sys.stderr.write(f"MUTATION TARGET NOT FOUND in {path}: {find!r}\n")
    sys.exit(3)
open(path, 'w').write(s.replace(find, replace, 1))
PY
  local applied=$?
  if [ $applied -ne 0 ]; then
    mv "$file.red-backup" "$file"
    printf '  ?? %s — the mutation could not be applied; the guard may have moved\n' "$label"
    fail=$((fail + 1))
    return
  fi

  if pnpm test >/tmp/tessera-red.log 2>&1; then
    printf '  !! %s — THE SUITE STAYED GREEN. This guard does not guard.\n' "$label"
    fail=$((fail + 1))
  else
    printf '  ok %s — red, as it must be\n' "$label"
    pass=$((pass + 1))
  fi
  mv "$file.red-backup" "$file"
}

echo "Breaking each guard in turn."
echo

# 1. The 40-character mounted assertion. A bundle that 404s leaves the network idle and
#    domcontentloaded fires anyway, so this is what stops a scenario passing against a blank page.
mutate 'assertMounted, the 40-character floor' test/dom.ts \
  'body.length > 40' 'body.length >= 0'

# 2. The wallet strip must print no digit while GET /v1/me/balances does not exist. A zero here is
#    BigInt('') === 0n wearing a label.
mutate 'the wallet strip prints no figure it does not have' src/components/wallet-strip.tsx \
  "{wei === null ? 'Not available yet' : formatSparks(wei)}" \
  '{formatSparks(wei ?? 0n)}'

# 3. Land is claimed free. §4.
mutate 'the claim carries no price' src/pages/land.tsx \
  'claimParcel({ wardId, tier, originX: Number(originX), originY: Number(originY) })' \
  'claimParcel({ wardId, tier, originX: Number(originX), originY: Number(originY), priceWei: "0" } as never)'

# 4. Discovery admits two inputs and no ordering parameter. §7.1's first refusal.
mutate 'discovery sends no ordering parameter' src/lib/tessera.ts \
  "tessera('/v1/discover', wardId === undefined ? {} : { query: { wardId } })" \
  "tessera('/v1/discover', { query: { sort: 'promoted', ...(wardId === undefined ? {} : { wardId }) } })"

# 5. nginx must not serve the shell with a 200 for every address in existence.
mutate 'nginx never falls back with try_files $uri /index.html' nginx.conf \
  '    location / {
        try_files $uri =404;
    }' \
  '    location / {
        try_files $uri /index.html;
    }'

# 6. nginx and routes.ts must agree about which addresses exist.
mutate 'nginx enumerates exactly the declared routes' nginx.conf \
  '^/(wards|land|kiln|discover|workshop)/?$' \
  '^/(wards|land|kiln|discover)/?$'

# 7. A sprite request must 404 rather than decode index.html as a corrupt PNG.
mutate '/world-assets 404s a missing sprite' nginx.conf \
  '    location /world-assets/ {
        try_files $uri =404;' \
  '    location /world-assets/ {
        try_files $uri /index.html;'

# 8. Every route this client calls must exist in micro-tessera. This is the /auth/exchange guard.
#     The ANCHOR is rewritten to name a route micro-tessera does not serve. `cite()` must find
#     zero matches and throw, which is precisely what would have happened to `/auth/exchange`.
#
#     ANSI-C quoting, because the anchor contains a single quote and the target must be the entry
#     in ROUTE_ANCHORS rather than the function call below it. The first attempt used a plain
#     single-quoted pattern, could not include the quote, and therefore matched the FUNCTION CALL
#     instead — the suite stayed green and reported a guard that does not guard, when what had
#     actually happened was that the mutation missed. A mutation that cannot express its target is
#     indistinguishable from a guard that does not work, which is why the script prints the two
#     outcomes differently.
#
#     `tessera` is declared as REQUIRED: the assertion reads ../tessera/src/server.ts and skips
#     without it, and a skipped test catches nothing. Reported as not proven rather than as a
#     broken guard — see the note on `mutate`.
mutate 'a route this client calls must exist in the service' src/lib/tessera.ts \
  $'"define(\'GET\', \'/v1/discover\'"' \
  $'"define(\'GET\', \'/v1/discover/promoted\'"' \
  tessera

# 9. No file in the bundle may name an asset provider. The target moved when sprites.ts stopped
#    composing URLs at all: the one remaining place a provider directory could be written into a
#    request is where the receipt is fetched.
mutate 'no source file names an asset provider' src/lib/asset-set.ts \
  'const res = await fetch(`${base}/${RECEIPT}`)' \
  'const res = await fetch(`${base}/candidates/qwen-image-2512/${RECEIPT}`)'

# 10. parseAmount must refuse everything BigInt silently accepts.
mutate 'parseAmount refuses what BigInt accepts' src/lib/money.ts \
  "!/^\\d{1,78}\$/.test(value)" \
  'false'

# 11. sparksToWei must refuse a blank, so a listing cannot be created at a price of nothing.
mutate 'a blank price cannot become zero' src/lib/money.ts \
  "if (!/^\\d{1,60}\$/.test(trimmed)) return null" \
  'if (false) return null'

# 12. A 2x2 must sort on its nearest corner, or it is painted under the object standing in front
#     of it.
mutate 'a 2x2 sorts on its nearest corner' src/render/iso.ts \
  "const span = footprint === '2x2' ? 1 : 0" \
  'const span = 0'

# 13. worldToTile must floor rather than truncate, or there is a seam of unclickable ground
#     through the middle of every ward.
mutate 'worldToTile floors rather than truncates' src/render/iso.ts \
  'return { tx: Math.floor(b + a), ty: Math.floor(b - a) }' \
  'return { tx: Math.trunc(b + a), ty: Math.trunc(b - a) }'

# 14. The terms flag is printed from the wire, never derived. If the page said the same thing
#     whatever the service sent, it would be comparing a constant with itself.
mutate 'the equal-terms claim is printed, not derived' src/pages/workshop.tsx \
  'terms.data.identicalForEveryAccount' 'true'

# 15. The client must not withhold a tier the service is the one to refuse.
mutate 'every tier is offered' src/pages/land.tsx \
  "{ tier: 'homestead', label: 'Homestead — 16×16', note: 'One per account, free, never fallow, never tradeable.' }," \
  ''

# 16. DRAW_BUDGET must follow from the measured cost per draw, not from taste.
mutate 'DRAW_BUDGET follows the measurement' src/render/renderer.ts \
  'export const DRAW_BUDGET = 2000' \
  'export const DRAW_BUDGET = 6000'

# 17. The zoom floor must not degrade a fitted Plot. This is the value the measurement corrected,
#     and it was wrong by 1.2%.
mutate 'the zoom floor does not degrade a fitted Plot' src/render/renderer.ts \
  'export const SPRITE_MIN_ZOOM = 0.17' \
  'export const SPRITE_MIN_ZOOM = 0.18'

# 18. The recorded numbers must have come from a GPU. Headless Chromium rasterises on the CPU by
#     default and reported 200us per draw before the flags were added.
mutate 'the recorded run used a GPU' docs/render-budget.json \
  '"softwareRaster": false' \
  '"softwareRaster": true'

# 19. The Dockerfile must copy public/. This is THE defect this repository shipped: public/ tracked
#     zero files, git does not store an empty directory, and `COPY public ./public` therefore failed
#     on every clean checkout — the image built only on the machine that authored it. The guard has
#     to survive the line being removed as well as the directory being emptied.
mutate 'the Dockerfile copies public/ into the image' Dockerfile \
  'COPY public ./public' \
  '# COPY public ./public'

# 20. index.html must link every icon it ships. A file in public/ that nothing points at is dead
#     weight that looks like it is working; the two-way check is what makes a placeholder visible.
mutate 'index.html links every icon it ships' index.html \
  '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-180x180.png" />' \
  ''

# 21. index.html must link nothing it does not ship. The other direction: a href to a file that is
#     not in public/ is a 404 in every tab, and nothing about the page looks wrong.
mutate 'index.html ships every icon it links' index.html \
  '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />' \
  '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-16x16.png" />'

# 22. The og card must be a file that ships, not just a tag that exists.
mutate 'the og:image names a file that is really there' index.html \
  '<meta property="og:image" content="/og-1200x630.png" />' \
  '<meta property="og:image" content="/og-title-1200x630.png" />'

# 23. The workflow must deep-link to the path this repository DECLARES. `/wards` is the value the
#     brief for this change asked for, and it would have passed the image probe: it is in nginx's
#     enumerated block and it is unprotected. It is still wrong, because it disagrees with
#     DEEP_LINK_PATH with nothing anywhere to notice. That is the mutation, precisely.
mutate 'CI deep-links to the declared path' .github/workflows/ci.yml \
  'deep-link-path: /discover' \
  'deep-link-path: /wards'

# 24. The workflow must name the app micro-deploy builds, or CI tags an artefact by a second name.
mutate 'CI names the app micro-deploy builds' .github/workflows/ci.yml \
  'app: tessera-web' \
  'app: micro-tessera-web'

# 25. Without the estate token the private micro-ui checkout 404s, `link:` installs as a dangling
#     symlink, and Typecheck fails on the first @cloudsforge/ui import with no clue as to why.
mutate 'CI passes a token that can read the private micro-ui' .github/workflows/ci.yml \
  'estate_token: ${{ secrets.ESTATE_READ_TOKEN }}' \
  'estate_token: ${{ secrets.GITHUB_TOKEN }}'

# 26. No source file may read a build-time environment variable. Vite inlines it, the bundle then
#     carries its environment, and one image stops serving every environment. Written as REAL CODE,
#     because the scan strips comments — the trap this repository has fallen into three times.
#
#     THE EXPRESSION IS ASSEMBLED, and that is not fussiness. micro-org's web-ci.yml greps the
#     WHOLE repository for `import.meta.env.VITE_<NAME>`, excluding only *.md and the workflows
#     directory — so spelling it out here would fail the estate's CI on this repository over a
#     mutation whose entire purpose is to prove the expression is banned. The concatenation below
#     produces the identical string; no line of this file contains it. Found by running that job
#     by hand, since Actions is billing-blocked and could not have told anybody.
#     test/no-build-time-config.test.ts asserts this file stays that way.
env_read="import.meta.env.""VITE_ASSET_BASE"
mutate 'no source file reads a build-time environment variable' src/lib/hosts.ts \
  'return `${pageOrigin()}/world-assets`' \
  "return ${env_read} ?? \`\${pageOrigin()}/world-assets\`"

# ══════════════════════════════════════════════════════════════════════════════════════════════
# THE BROWSER-JOURNEY GUARDS (test/journeys.ts, test/journeys.test.ts).
#
# Everything above this line predates the journey catalogue. The mutations below are one per NEW
# guard family, and several of them exist because the scenario that produced them found a defect
# rather than confirmed a property — 39, 40 and 41 in particular put back the exact code the
# double-submit hazard was measured against.
# ══════════════════════════════════════════════════════════════════════════════════════════════

# 27. The world opens FITTED to the parcel. This is the half `render-budget.test.ts` cannot see:
#     it holds SPRITE_MIN_ZOOM to the measured Plot fit, and nothing held that measurement to the
#     fact that a parcel is opened at the zoom it fits at. Change the initial camera and the
#     constant still satisfies its measurement while every Plot renders as bare ground.
mutate 'the world opens fitted to the parcel' src/components/world-canvas.tsx \
  'zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomToFit(side, { width, height }))),' \
  'zoom: 0.05,'

# 28. A sprite that will not load is a hole with a NAME. Silencing the list turns a loud failure
#     into a world that quietly renders wrong.
mutate 'an unresolvable sprite is named' src/components/world-canvas.tsx \
  'setMissing(sprites.missing)' \
  'setMissing([])'

# 29. The object cap is DISPLAYED from the response and never derived. Five per eight tiles is the
#     rule today; a client that computed it keeps printing the old one after the schema moves.
mutate 'the object cap is the response, not five per eight tiles' src/pages/world.tsx \
  '{parcel.objectCap.toLocaleString()}' \
  '{((parcel.tiles / 8) * 5).toLocaleString()}'

# 30. Occupancy is the service's figure. 70% mints the next ward, so a client doing that division
#     itself disagrees with the service about when the world grows.
mutate 'occupancy is the service figure' src/pages/wards.tsx \
  'const percent = Math.round(ward.occupancy * 100)' \
  'const percent = Math.round((ward.claimedTiles / ward.claimableTiles) * 100)'

# 31. A fallow state this build has never heard of must render as ITSELF. Falling through to the
#     friendliest sentence in the table tells somebody their land is Live on the day it is not.
mutate 'an unknown fallow state is not mapped onto the default' src/pages/land.tsx \
  '{FALLOW_COPY[parcel.fallowState] ?? parcel.fallowState}' \
  "{FALLOW_COPY[parcel.fallowState] ?? FALLOW_COPY['live']}"

# 32. The gate control sends the negation of the state the SERVICE reported.
mutate 'the gate sends the negation of the served state' src/pages/land.tsx \
  '() => setParcelFlags(parcel.id, { gateOpen: !parcel.gateOpen }),' \
  '() => setParcelFlags(parcel.id, { gateOpen: true }),'

# 33. The client follows the job to a TERMINAL state. A 202 is an enqueue: studio answers it before
#     touching a model, so a client that stops following has told the user nothing.
mutate 'the Kiln polls until the job is terminal' src/pages/kiln.tsx \
  'timer = setTimeout(tick, 2000)' \
  'timer = setTimeout(tick, 200000)'

# 34. And it STOPS at one. A poll with no terminal condition is a tab making a request every two
#     seconds overnight against a job that is never going to answer differently.
mutate 'the Kiln stops polling a terminal object' src/pages/kiln.tsx \
  "if (res.object.status === 'firing') {" \
  "if (res.object.status !== 'nonexistent-state') {"

# 35. The feed renders in the SERVICE'S order. Re-sorting by a column the client can see makes the
#     score stop explaining the order, which is the whole thing this screen exists to make checkable.
mutate 'the feed is not re-ordered by this client' src/pages/discover.tsx \
  '{feed.data.parcels.map((row) => (' \
  '{[...feed.data.parcels].sort((a, b) => b.inputs.footfall - a.inputs.footfall).map((row) => ('

# 36. BOTH ranking inputs, on the row with the score. Dwell is the one that punishes a doorway
#     which tricks people in, so losing it is losing half the fairness argument.
mutate 'both ranking inputs are shown beside the score' src/pages/discover.tsx \
  '<td>{row.inputs.medianDwell}s</td>' \
  '<td>—</td>'

# 37. The split is the SERVICE'S arithmetic. A client that multiplied the price by the basis points
#     beside it would print a partition that agreed with itself while the real one differed.
mutate 'the split is printed, not recomputed' src/pages/workshop.tsx \
  "{formatSparks(parseAmount(listing.split.feeWei, 'feeWei'))}" \
  "{formatSparks((parseAmount(listing.priceWei, 'priceWei') * BigInt(listing.platformFeeBps)) / 10000n)}"

# 38. The royalty input offers the WIRE's range. Clamping to the cap is the client asserting the
#     rule — and a test of the clamp passes against a service that stopped enforcing it.
mutate 'the royalty input is the wire range, not the cap' src/pages/workshop.tsx \
  'max={10000}' \
  'max={maxRoyaltyBps ?? 10000}'

# 39. THE DEFECT THIS SUITE FOUND, put back. `busy` is read out of the render closure and
#     `setBusy(true)` only schedules a render, so two clicks in one tick both pass. Measured at two
#     firings — and a firing has a real marginal cost in USD at the provider.
mutate 'the Kiln latches in flight on a ref, not on state' src/pages/kiln.tsx \
  'if (inFlight.current) return' \
  'if (busy) return'

# 40. The same defect on the listing form. Measured at two listings, which is two live buyable
#     offers of a thing the seller meant to sell once.
mutate 'the listing form latches in flight on a ref' src/pages/workshop.tsx \
  'if (inFlight.current) return' \
  'if (busy) return'

# 41. And on the claim form. Two claims race for the same rectangle and the loser produces a
#     refusal the user did not ask for.
mutate 'the claim form latches in flight on a ref' src/pages/land.tsx \
  'if (inFlight.current) return' \
  'if (busy) return'

# 42. The not-found screen offers EVERY declared route. A screen that is one short is a route
#     nobody can reach from the only page that lists them all.
mutate 'the 404 screen offers every declared route' src/pages/not-found.tsx \
  '{ROUTES.map((route) => (' \
  '{ROUTES.slice(1).map((route) => ('

# 43. The skip link points at the main landmark, AND the landmark can take focus. The link and its
#     target are `SkipLink` and `MainRegion` from @cloudsforge/ui now, which compose the href and
#     the id from one constant — so the way to break the pair is no longer to mistype the fragment,
#     it is to go back to a hand-written `<main>`. That is the version this repository actually
#     shipped: the anchor was right and the target carried no tabindex, so following the link
#     scrolled the page, left focus on the link, and sent the next Tab back into the company bar.
#
#     So the mutation moves the TARGET rather than the fragment: `MainRegion` accepts an `id`, and
#     overriding it with the old `main` silently un-points the link while everything still compiles
#     and still renders a landmark. A mutation that produced a syntax error would turn the suite
#     red without any guard catching anything, which is the failure this whole script is about.
mutate 'the skip link points at the main landmark' src/components/shell.tsx \
  '<MainRegion className="tw-main">' \
  '<MainRegion id="main" className="tw-main">'

# 44. The gate state is in the ACCESSIBLE NAME, not only in a visual badge. Colour is never the
#     only channel, and on this world the gate decides whether you can walk in.
#     ANSI-C quoting, as mutation 8 uses and for the same reason: the target contains single
#     quotes, and a plain single-quoted pattern cannot express them. A mutation that cannot express
#     its target is indistinguishable from a guard that does not work.
mutate 'the gate state is in the accessible name' src/pages/world.tsx \
  $'? \'open\' : \'shut\'}`}' \
  $'? \'\' : \'\'}`}'

# 45. A balance the strip does not have must not become a zero on the way to the screen. The route
#     answers 503 with no figures precisely so this client never has to guess.
mutate 'an unanswered balance does not become a zero' src/components/wallet-strip.tsx \
  '      : undefined)' \
  '      : { availableWei: 0n, clearingWei: 0n, confirming: null })'

# 46. The strip asks for nobody in particular. A subject parameter here is somebody else's
#     earnings on your screen.
mutate 'the balance read carries no subject' src/lib/tessera.ts \
  "tessera('/v1/me/balances')" \
  "tessera('/v1/me/balances', { query: { subject: 'user:alice' } })"

# 47. The catalogue's own layer boundary: a scenario turning on a server rule must name the test
#     that owns it. Doc 22 §3.2 makes this a build failure rather than advice.
mutate 'a scenario naming a server rule must name its owner' test/journeys.ts \
  "    ownedBy: 'market/src/money.ts#assertPartition'," \
  ''

# 48. A blocker is a claim about the estate, and a claim nothing checks is a claim that rots. This
#     rewrites one anchor to something that IS present, which must be reported as a gap that has
#     closed rather than passing as a gap that is open.
mutate 'a blocker that has gone stale is caught' test/journeys.ts \
  "blockedWhile: { absent: 'tessera-web/src/lib/tessera.ts#EventSource' }," \
  "blockedWhile: { absent: 'tessera-web/src/lib/tessera.ts#export interface Ward' },"

# 49. A scenario cannot be declared, counted and never written. Without this the catalogue is a
#     list rather than coverage.
mutate 'a declared scenario must have a test' test/journeys.test.ts \
  'BJ-TES-19 [T1/presentation] every row carries both ranking inputs' \
  'BJ-TES-XX [T1/presentation] every row carries both ranking inputs'

# 50. Every screen carries at least one scenario that runs. This is the measured gap turned into a
#     floor: a screen with none is a screen whose whole behaviour can change with the suite green.
mutate 'every screen carries a scenario that runs' test/journeys.ts \
  "  'not-found'," \
  "  'not-found',
  'ledger',"

# ══════════════════════════════════════════════════════════════════════════════════════════════
# 51-55. THE ASSET PATH. Every one of these was GREEN before this repository could resolve a
# sprite, and the product was broken the whole time: the client asked for
# `tiles/ashfield-ground-a.png` while the set held `tiles/ashfield-ground-a-256x128.png`, so a
# complete, reconciled, byte-verified 392-asset mount rendered every tile as a hole.
#
# Nothing in either repository could see it — the mount validator proved 392/392 and every world
# scenario stubbed `/world-assets/` as 404, so no test in this suite had ever seen a sprite ARRIVE.
# 51 and 52 are the two directions the disagreement can reappear from, and both are declared as
# needing the sibling: without `../tessera-assets` the scenario skips, and a skipped test catches
# nothing.
# ══════════════════════════════════════════════════════════════════════════════════════════════

# 51. The client composes a filename out of an identity again — the original defect, exactly.
mutate 'the client never composes a sprite filename' src/lib/sprites.ts \
  'const res = await fetch(url)' \
  "const res = await fetch(\`\${url.slice(0, url.lastIndexOf('/'))}/\${path}.png\`)" \
  tessera-assets

# 52. The other direction: this client renders an identity the set does not ship. A rename on
#     either side is the same defect, and neither repository can see it alone.
mutate 'a ground identity this client renders must exist in the set' src/render/terrain.ts \
  "  'ground-worn'," \
  "  'ground-weathered'," \
  tessera-assets

# 53. The floor must be countable. Without this the sentence beside the canvas says the same thing
#     for a world drawn on solid ground and a world with nothing under it — which is precisely how
#     the defect stayed invisible on screen while every check passed.
mutate 'a world with no floor says so' src/components/world-canvas.tsx \
  ': stats.ground > 0' \
  ': stats.ground >= 0'

# 54. A receipt that names nothing is not a set of size zero. Treating it as one would make every
#     sprite a silent hole against a mount that answered 200 with a body nobody understood.
mutate 'a receipt naming no asset is refused, not treated as empty' src/lib/asset-set.ts \
  'return map.size === 0 ? undefined : map' \
  'return map'

# 55. An identity the mounted set does not name must cost no request. A 404 nobody sees is how
#     this whole class of defect hides; the receipt has already answered.
mutate 'an unnameable sprite is a hole, not a request' src/lib/sprites.ts \
  '    if (url === undefined) {
      this.failed.add(path)
      return
    }' \
  '    if (url === undefined) {
      url = `/world-assets/${path}.png`
    }'

# ══════════════════════════════════════════════════════════════════════════════════════════════
# 56-58. EMBER HAS NO MONETARY VALUE (test/content.test.ts).
#
# Until 2026-08-08 the Workshop page head read "real EMBER … It is money, not points: take it out
# to a wallet you control the same afternoon", and the price field read "Ordinary things go for
# around 400 of them". 18-build-status.md:38 records that EMBER has no market, no listing, no
# liquidity and no price on either network; nothing here measures a withdrawal's latency; and
# there is no distribution of sale prices for 400 to be near, because nobody outside the project
# has used any of this. 32-roadmap-ui-and-content.md §4.1 called it the estate's most urgent copy
# change and the only place in it that tells a reader EMBER is money and quotes a price.
#
# The three mutations put each sentence back. They are the whole reason the scan exists: this is
# not a defect anybody catches in review, because all three read as good writing.
# ══════════════════════════════════════════════════════════════════════════════════════════════

# 56. The monetary-value claim and the settlement promise, restored verbatim.
mutate 'no copy says EMBER is money' src/pages/workshop.tsx \
  'You can withdraw it to a wallet you control, spend it anywhere' \
  'It is money, not points: take it out to a wallet you control the same afternoon, spend it anywhere'

# 57. The denial deleted while everything else stays true. The scan must fail on the ABSENCE, not
#     only on a forbidden phrase — a page that simply stops saying it is the likelier regression.
mutate 'the page head still carries the denial' src/pages/workshop.tsx \
  ' EMBER has no market price.' \
  ''

# 58. The price anchor, restored to the field help it was deleted from.
mutate 'no copy anchors a price' src/pages/workshop.tsx \
  'A Spark is a millionth of an EMBER.' \
  'A Spark is a millionth of an EMBER. Ordinary things go for around 400 of them.'

echo
printf 'guards proven red: %d   guards that stayed green: %d   not proven here: %d\n' \
  "$pass" "$fail" "$skipped"
if [ "$skipped" -gt 0 ]; then
  echo
  echo "A guard reported as NOT PROVEN was not exercised: the sibling repository its assertion"
  echo "reads is not checked out, so the test skipped and the mutation had nothing to catch it."
  echo "That is not a passing guard. Re-run beside the estate to prove those."
fi
[ "$fail" -eq 0 ] || exit 1
