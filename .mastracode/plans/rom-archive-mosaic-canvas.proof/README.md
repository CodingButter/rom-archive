# Mosaic canvas — live proof

Proves the random-spread bundle mosaic on real data, offline, by driving the pure
sampling helper (`apps/site/src/lib/mosaic-sample.ts`) directly. Node strips the
TypeScript natively; the helper's only runtime import (`coverUrlFor`) is stripped
and replaced with an injected `derive` function, so the proof is deterministic and
network-free for its gate.

## Run

```
bash .mastracode/plans/rom-archive-mosaic-canvas.proof/run.sh
```

## Markers

Deterministic (the gate — red/green):

- `SPREAD` — over `total=266`, the seeded shuffle's first 10 pages are NOT the
  slice `[1..10]`, and the whole result is a distinct, in-range permutation.
- `DEDUPE` — `buildTiles` drops URL collisions and null-deriving members, caps at
  10, preserves first-seen order.
- `BOUND` — a fully-colliding input, walked one page at a time, terminates within
  `MAX_FETCHES` with `< 10` tiles, touching only distinct pages.
- `DISTINCT:FIRST10 <n>` / `DISTINCT:FIRST10<=2` — over the REAL captured
  DS-bundle first-10 names (the `007 - Blood Stone` / `Quantum of Solace`
  variants), `buildTiles` collapses to ~1-2 covers.
- `DISTINCT:RANDOM <n>` / `DISTINCT:RANDOM>=8` — over a captured WIDER real DS name
  list, `buildTiles` yields ~10 distinct covers.

  Scope: `DISTINCT:*` proves the build/dedupe step collapses the first-10 and does
  NOT collapse a diverse real input. It is not, by itself, proof that live random
  sampling is diverse — `SPREAD` (first-10-slice avoidance) and the live
  corroboration carry that.

Informational (never a hard red):

- `LIVE:DS` — re-pulls `ni-n-ds-dec_202401` from archive.org to corroborate the
  captured fixture; inconclusive-with-reason when offline.

## Red/green contrast

`run.sh` runs the demo on the branch (GREEN) and against the base commit
`8779e40^`, where `mosaic-sample.ts` does not yet exist, so the helper cannot load
and the run is RED. The proof passes only when the branch is green and the base is
red.
