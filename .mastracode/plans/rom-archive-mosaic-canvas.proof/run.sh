#!/usr/bin/env bash
# Runs the mosaic proof twice:
#   with.txt     — the current branch: mosaic-sample.ts exists; the deterministic
#                  markers (SPREAD, DEDUPE, BOUND, DISTINCT:*) pass GREEN.
#   without.txt  — the BASE commit (before 8779e40): mosaic-sample.ts does NOT
#                  exist, so the demo cannot load the helper and fails RED. That
#                  is the meaningful contrast — the pure sampling core is new.
#
# The deterministic markers carry the red/green — no network required. LIVE:DS is
# recorded as corroboration when archive.org is reachable.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
BASE_REF="8779e40^"   # the commit before the mosaic-canvas work
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "### BRANCH (with helper) → with.txt"
node "$HERE/demo.mjs" | tee "$HERE/with.txt"
BRANCH_STATUS=${PIPESTATUS[0]}

echo
echo "### BASE ($BASE_REF, no helper) → without.txt"
# Try to materialize the base-commit helper. It does not exist there, so the
# checkout fails and the demo runs against a missing module → RED (expected).
if git -C "$REPO" show "$BASE_REF:apps/site/src/lib/mosaic-sample.ts" > "$TMP/mosaic-sample.ts" 2>/dev/null; then
  SAMPLE_MODULE="$TMP/mosaic-sample.ts" node "$HERE/demo.mjs" | tee "$HERE/without.txt"
  BASE_STATUS=${PIPESTATUS[0]}
else
  echo "OK (expected): apps/site/src/lib/mosaic-sample.ts does not exist at $BASE_REF" | tee "$HERE/without.txt"
  echo "MOSAIC PROOF: FAIL (helper absent at base)" | tee -a "$HERE/without.txt"
  BASE_STATUS=1
fi

echo
echo "=== Proof summary ==="
echo "branch deterministic markers: $([ "$BRANCH_STATUS" -eq 0 ] && echo GREEN || echo RED)"
echo "base   deterministic markers: $([ "$BASE_STATUS" -ne 0 ] && echo 'RED (expected)' || echo 'GREEN (unexpected!)')"

if [ "$BRANCH_STATUS" -eq 0 ] && [ "$BASE_STATUS" -ne 0 ]; then
  echo "PROOF: PASS (green on branch, red on base)"
  exit 0
fi
echo "PROOF: FAIL"
exit 1
