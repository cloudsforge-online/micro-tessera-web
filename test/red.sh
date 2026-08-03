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

echo
printf 'guards proven red: %d   guards that stayed green: %d\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
