#!/usr/bin/env bash
# Rerun the metadata proof from scratch. Setup (build + fixture copy) is sent to
# setup.log; only the demo transcript lands in with.txt.
#
#   bash .mastracode/plans/rom-archive-metadata.proof/run.sh
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
cd "$root"

echo "== building @rom-archive/api ==" > "$here/setup.log"
pnpm --filter @rom-archive/api build >> "$here/setup.log" 2>&1

# tsc does not copy JSON fixtures into dist; Vercel's bundler traces & includes
# them in production (same as catalog.json). For this hand-run of dist we copy
# them ourselves — a setup step, not part of the proof.
echo "== copying fixtures into dist ==" >> "$here/setup.log"
mkdir -p apps/api/dist/src/fixtures
cp apps/api/src/fixtures/*.json apps/api/dist/src/fixtures/ >> "$here/setup.log" 2>&1
cp apps/api/catalog.json apps/api/dist/catalog.json >> "$here/setup.log" 2>&1

echo "== running demo ==" >> "$here/setup.log"
NO_COLOR=1 node "$here/demo.mjs" | tee "$here/with.txt"
