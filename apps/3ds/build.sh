#!/usr/bin/env bash
# Phase-6 CIA build harness.
#
# Builds the whole 3DS app inside the shared devkitARM Docker image
# (apps/3ds/docker/: base + makerom + bannertool), cross-compiling the libctru
# platform layer in source/ together with the console-agnostic core in core/src,
# then packaging a .cia with bannertool + makerom:
#
#   source/ + core/src --(devkitARM make)--> .elf + .3dsx + .smdh
#                      --(bannertool)-------> .bnr banner
#                      --(makerom)----------> .cia
#
# The provisioning mechanism (makerom/bannertool) is defined ONCE in
# apps/3ds/docker/ and only referenced here — never re-derived.
#
# Usage:
#   ./build.sh            build .3dsx + .cia
#   ./build.sh --check    build, then assert both artifacts exist and are non-empty
#
# Artifacts (.elf/.3dsx/.smdh/.bnr/.cia) are gitignored. Set KEEP_ARTIFACTS=1 to
# keep them (default keeps them so the CIA can be installed/served); pass
# CLEAN=1 to remove them after the build.
set -euo pipefail

DOCKER_HOST_SOCK="unix:///var/run/docker.sock"
IMAGE="rom-archive-3ds-build:latest"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$SCRIPT_DIR/docker"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

CHECK=0
[[ "${1:-}" == "--check" ]] && CHECK=1

# Build the shared image if it is not present yet.
if ! docker -H "$DOCKER_HOST_SOCK" image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "[build] build image '$IMAGE' missing; building from $DOCKER_DIR ..."
  docker -H "$DOCKER_HOST_SOCK" build -t "$IMAGE" "$DOCKER_DIR"
fi

# Mount the repo root so the Makefile can reach ../core relative to apps/3ds.
docker -H "$DOCKER_HOST_SOCK" run --rm \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -e KEEP_ARTIFACTS="${KEEP_ARTIFACTS:-1}" \
  -e CLEAN="${CLEAN:-0}" \
  -e CHECK="$CHECK" \
  -e API_BASE_URL="${API_BASE_URL:-http://rom-archive-api.jamie337nichols.workers.dev}" \
  -v "$REPO_ROOT":/work -w /work/apps/3ds \
  "$IMAGE" bash -lc '
set -euo pipefail

TARGET=rom-archive

echo "[build] make (.elf/.3dsx/.smdh), API_BASE_URL=$API_BASE_URL ..."
make clean >/dev/null 2>&1 || true
make API_BASE_URL="$API_BASE_URL"

# banner.png is a committed asset (regenerate with tools/make_banner.py);
# only the silent audio track is synthesized here.
echo "[build] generate silent banner audio ..."
python3 - <<PY
import struct

def wav_silence(path, seconds=1, rate=22050):
    n = int(seconds * rate)
    data = b"\x00\x00" * n
    hdr = b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVE"
    hdr += b"fmt " + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate*2, 2, 16)
    hdr += b"data" + struct.pack("<I", len(data))
    open(path, "wb").write(hdr + data)

wav_silence("banner.wav", 1)
print("banner.wav written")
PY

echo "[build] bannertool makebanner (.bnr) ..."
bannertool makebanner -i banner.png -a banner.wav -o "$TARGET.bnr"

# The CIA gets its own SMDH from bannertool — NOT the smdhtool one the Makefile
# builds for the .3dsx. smdhtool writes application settings the HOME menu
# rejects (flags 0x0141 with RegionRatingRequired but only "rating pending"
# 0xA0 rating bytes, region lockout 0xFFFFFFFF instead of 0x7FFFFFFF), which
# made installed titles invisible on HOME while FBI still listed them.
# bannertool emits the same settings as known-working homebrew (FBI/3hs):
# zeroed ratings, region-free 0x7FFFFFFF, flags visible|allow3d|recordusage.
echo "[build] bannertool makesmdh (CIA icon) ..."
bannertool makesmdh \
  -s "ROM Archive" \
  -l "Download homebrew ROMs to TWiLight Menu++" \
  -p "rom-archive" \
  -i icon.png -o "$TARGET-cia.smdh"

echo "[build] makerom (.cia) ..."
makerom -f cia -target t -exefslogo -desc app:4 \
  -elf "$TARGET.elf" \
  -icon "$TARGET-cia.smdh" \
  -banner "$TARGET.bnr" \
  -rsf app.rsf \
  -o "$TARGET.cia"

# Remove the transient inputs (banner.png is a committed asset — keep it).
rm -f banner.wav "$TARGET.bnr" "$TARGET-cia.smdh"

echo "[build] artifacts:"
ls -la "$TARGET.3dsx" "$TARGET.cia"

if [[ "$CHECK" == "1" ]]; then
  fail=0
  for f in "$TARGET.3dsx" "$TARGET.cia"; do
    if [[ ! -s "$f" ]]; then
      echo "[build] FAIL: $f missing or empty"; fail=1
    else
      echo "[build] OK: $f = $(stat -c%s "$f") bytes"
    fi
  done
  [[ "$fail" == "0" ]] && echo "[build] --check passed"
  if [[ "$fail" != "0" ]]; then exit 1; fi
fi

if [[ "${CLEAN:-0}" == "1" ]]; then
  echo "[build] CLEAN=1: removing build artifacts ..."
  rm -f "$TARGET".3dsx "$TARGET".cia "$TARGET".smdh "$TARGET".elf
  rm -rf build
fi
'
