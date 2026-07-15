#!/usr/bin/env bash
# Phase-0 CIA-toolchain spike.
#
# Proves the full 3DS packaging path end to end BEFORE any real app code exists:
#   source/main.c --(devkitARM make)--> .elf + .3dsx + .smdh
#                 --(bannertool)-------> .bnr banner
#                 --(makerom)----------> .cia
#
# Everything runs inside the shared build image defined by apps/3ds/docker/
# (devkitARM base + makerom + bannertool). This script is the basis Phase 6a's
# apps/3ds/build.sh is promoted from — the provisioning mechanism is defined
# once, in apps/3ds/docker/, and referenced here, never re-derived.
#
# Artifacts (.elf/.3dsx/.smdh/.bnr/.cia) are gitignored and cleaned unless
# KEEP_ARTIFACTS=1 is set.
set -euo pipefail

DOCKER_HOST_SOCK="unix:///var/run/docker.sock"
IMAGE="rom-archive-3ds-build:latest"
DOCKER_DIR="../docker"        # relative to this script's dir (apps/3ds/spike)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Build the shared image if it is not present yet.
if ! docker -H "$DOCKER_HOST_SOCK" image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "[spike] build image '$IMAGE' missing; building from $DOCKER_DIR ..."
  docker -H "$DOCKER_HOST_SOCK" build -t "$IMAGE" "$DOCKER_DIR"
fi

# The whole toolchain runs inside the container against this mounted directory.
# Run as the host uid/gid so every produced file is host-owned (Docker's default
# root ownership would otherwise leave un-removable artifacts and poison git).
# HOME is redirected to a writable temp dir since the mapped user has no entry
# in the image's /etc/passwd.
docker -H "$DOCKER_HOST_SOCK" run --rm \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -e KEEP_ARTIFACTS="${KEEP_ARTIFACTS:-0}" \
  -v "$SCRIPT_DIR":/work -w /work \
  "$IMAGE" bash -lc '
set -euo pipefail

export APP_TITLE="rom-archive spike"
export APP_DESCRIPTION="CIA toolchain spike"
export APP_AUTHOR="rom-archive"

# Pin the output name explicitly: the container mounts this dir at /work, so the
# Makefile default (TARGET := notdir CURDIR) would otherwise resolve to "work".
TARGET=spike

echo "[spike] make (.elf/.3dsx/.smdh) ..."
make clean TARGET="$TARGET" >/dev/null 2>&1 || true
make TARGET="$TARGET"

echo "[spike] generate placeholder banner image + silent audio ..."
# 256x128 solid banner PNG and a short silent WAV, created with tools already
# present in the image (ImageMagick may be absent, so synthesize raw files).
python3 - <<PY
import struct, zlib

def png_solid(path, w, h, rgb):
    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xffffffff)
    raw = bytearray()
    row = bytes(rgb) * w
    for _ in range(h):
        raw += b"\x00" + row
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)  # 8-bit RGB
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    open(path, "wb").write(png)

def wav_silence(path, seconds=1, rate=22050):
    n = int(seconds * rate)
    data = b"\x00\x00" * n
    hdr = b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVE"
    hdr += b"fmt " + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate*2, 2, 16)
    hdr += b"data" + struct.pack("<I", len(data))
    open(path, "wb").write(hdr + data)

png_solid("banner.png", 256, 128, (32, 96, 160))
wav_silence("banner.wav", 1)
print("banner.png + banner.wav written")
PY

echo "[spike] bannertool makebanner (.bnr) ..."
bannertool makebanner -i banner.png -a banner.wav -o "$TARGET.bnr"

echo "[spike] makerom (.cia) ..."
# The Makefile-produced SMDH is the icon; the RSF carries title metadata.
makerom -f cia -target t -exefslogo -desc app:4 \
  -elf "$TARGET.elf" \
  -icon "$TARGET.smdh" \
  -banner "$TARGET.bnr" \
  -rsf spike.rsf \
  -o "$TARGET.cia"

# --- Assertions (inside the container, before cleanup) ---------------------
echo "[spike] artifacts:"
ls -la "$TARGET.3dsx" "$TARGET.cia"

fail=0
for f in "$TARGET.3dsx" "$TARGET.cia"; do
  if [[ ! -s "$f" ]]; then
    echo "[spike] FAIL: $f missing or empty"
    fail=1
  else
    echo "[spike] OK: $f = $(stat -c%s "$f") bytes"
  fi
done

# Clean inside the container (same uid as the files) unless asked to keep them.
if [[ "${KEEP_ARTIFACTS:-0}" != "1" ]]; then
  echo "[spike] cleaning build artifacts (set KEEP_ARTIFACTS=1 to keep) ..."
  rm -f "$TARGET".3dsx "$TARGET".cia "$TARGET".smdh "$TARGET".elf "$TARGET".bnr \
        banner.png banner.wav
  rm -rf build
fi

exit $fail
'
