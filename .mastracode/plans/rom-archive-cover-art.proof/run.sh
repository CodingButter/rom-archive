#!/usr/bin/env bash
# Runs the cover-art proof twice:
#   with.txt     — the current branch source (green: deterministic markers pass)
#   without.txt  — the BASE commit's coverUrlFor (red: it returns null for every
#                  full-set .zip/.7z, so DERIVE:* and FALLBACK:NULL-FREE fail)
#
# The deterministic markers carry the red/green — no network required. HITRATE:*
# is recorded as corroboration when archive.org + libretro are reachable.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
BASE_REF="fa3f50d^"   # the commit before the cover-art fix
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "### BRANCH (with fix) → with.txt"
node "$HERE/demo.mjs" | tee "$HERE/with.txt"
BRANCH_STATUS=${PIPESTATUS[0]}

echo
echo "### BASE ($BASE_REF, without fix) → without.txt"
# Materialize the base-commit cover.ts and run the SAME demo against it (Node
# strips the types natively — no build step).
git -C "$REPO" show "$BASE_REF:apps/site/src/lib/cover.ts" > "$TMP/cover.ts"
COVER_MODULE="$TMP/cover.ts" node "$HERE/demo.mjs" | tee "$HERE/without.txt"
BASE_STATUS=${PIPESTATUS[0]}

echo
echo "=== Proof summary ==="
echo "branch deterministic markers: $([ "$BRANCH_STATUS" -eq 0 ] && echo GREEN || echo RED)"
echo "base   deterministic markers: $([ "$BASE_STATUS" -ne 0 ] && echo 'RED (expected)' || echo 'GREEN (unexpected!)')"

# The proof passes when the branch is green AND the base is red.
if [ "$BRANCH_STATUS" -eq 0 ] && [ "$BASE_STATUS" -ne 0 ]; then
  echo "PROOF: PASS (green on branch, red on base)"
  exit 0
fi
echo "PROOF: FAIL"
exit 1
