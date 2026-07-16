# Cover-art proof

Proves the client cover-art fix works against the **real** `coverUrlFor`
(`apps/site/src/lib/cover.ts`), **live** archive.org filenames, and **live**
libretro.

## Run

```sh
bash run.sh
```

Produces `with.txt` (branch, green) and `without.txt` (base commit `fa3f50d^`,
red on the deterministic markers).

## Markers

**Deterministic (offline — the gate):**

- `DERIVE:ZIP` / `DERIVE:7Z` — a `.zip` / `.7z` name yields a non-null libretro URL.
- `FALLBACK:NULL-FREE` — no full-set archive name on a libretro-**mapped** console
  returns null. (Unmapped consoles legitimately return null by design; this is
  scoped to mapped ones.)
- `NO-DOUBLE-STRIP` — `Super Mario Bros. (World).zip` keeps the dot after `Bros`
  (the exact libretro stem); `Game.v1.2.zip` keeps `Game.v1.2`.

On the base commit these all **FAIL** because the archive guard returns `null`
for every `.zip`/`.7z` — the red is carried by code, not the network.

**Best-effort (live network — corroboration, never a hard red):**

- `HITRATE:NES` / `HITRATE:GBA` — live HEADs to libretro for a real No-Intro
  sample. Recorded as `INFO`. If archive.org/libretro is unreachable or returns
  availability errors, the marker is recorded **inconclusive with a reason** and
  never reddens the gate. Observed ~75–83% when reachable; the 60% note is a
  soft floor (libretro coverage is genuinely partial).

The mosaic tile-cap is proved by the Phase 2 jsdom unit test (12 files → 10
tiles), not here — a Node HEAD script can't exercise the React component.
