# Metadata feature — live proof

Drives the **real built artifacts** (`apps/api/dist/src/metadataService.js`,
`handlers.js`, `tgdbGenres.js`) — the same modules the Vercel `/api/metadata`
function imports — through a call-counting stub fetch and the real
`InMemoryCache`. This is the library/API surface: no unit harness, the actual
compiled code entered through its real functions.

## Rerun (one paste)

```sh
bash .mastracode/plans/rom-archive-metadata.proof/run.sh
```

Setup (build + fixture copy) goes to `setup.log`; the demo transcript is printed
and saved to `with.txt`. Expect a final `PROOF: GREEN` line.

## What it proves — and the markers to look for

| Marker | Claim |
| --- | --- |
| `TGDB:CALLS=1` | **Budget shield** — 5 resolutions of the same game issue exactly one TGDB request. |
| `CACHE:NEGATIVE tgdb_calls=1` | **Negative caching** — a TGDB no-match is cached; 4 resolutions still cost one request. |
| `FALLBACK:LIBRETRO … tgdb_calls=0` | **Fallback** — missing key AND floored allowance both serve libretro with zero TGDB spend. |
| `UNKNOWN:OK status=200` | **Graceful endpoint** — an upstream throw degrades to a 200 record, never a 5xx. |
| `ENDPOINT:404` | Unknown catalog id → 404 (the only non-200 routing path). |

## Note on the fixture copy

`tsc` does not copy JSON fixtures / `catalog.json` into `dist`. In production
Vercel's bundler traces and includes them (the same mechanism the existing
`catalog.json`-reading handlers already rely on), so this is not a production
gap — it is only needed because the demo hand-runs the `tsc` output. `run.sh`
copies them as a setup step, logged to `setup.log`, outside the captured proof.

New feature → no `without.txt` (base has no metadata endpoint at all).
