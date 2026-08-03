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
# every mutation "proves red" without any of them being caught by anything — twenty-six guards
# reported as working, on the strength of one failure that none of them caused.
#
# That is not hypothetical here. `citations.test.ts` asserts three routes are still ABSENT from
# micro-tessera and goes red the day one lands — which is the mechanism working, and is exactly the
# state this repository is in: `GET /v1/me/balances` now exists (tessera/src/server.ts:872), so the
# suite is red whenever `../tessera` is checked out beside this repository. Running this script
# there would have printed "26 guards proven red" and meant nothing.
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

# mutate <label> <file> <python-expression-replacing-source>
mutate() {
  local label="$1" file="$2" find="$3" replace="$4"
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
mutate 'a route this client calls must exist in the service' src/lib/tessera.ts \
  $'"define(\'GET\', \'/v1/discover\'"' \
  $'"define(\'GET\', \'/v1/discover/promoted\'"'

# 9. No file in the bundle may name an asset provider.
mutate 'no source file names an asset provider' src/lib/sprites.ts \
  'const res = await fetch(`${assetBase()}/${path}.png`)' \
  'const res = await fetch(`${assetBase()}/candidates/qwen-image-2512/${path}.png`)'

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

echo
printf 'guards proven red: %d   guards that stayed green: %d\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
