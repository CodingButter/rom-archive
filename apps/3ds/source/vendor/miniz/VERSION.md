# miniz (vendored)

- Version: 3.0.2 (release amalgamation `miniz.c` + `miniz.h`)
- Source: https://github.com/richgel999/miniz/releases/tag/3.0.2
- License: MIT (see `LICENSE`)

Used only to read single-entry ZIPs that archive.org serves for the No-Intro
sets and extract the raw ROM on device, because TWiLight Menu++ cannot read
archives — it needs the extracted `.sfc`/`.smc`/etc.

Build tuning (see `../../Makefile`): `MINIZ_NO_STDIO`, `MINIZ_NO_TIME`,
`MINIZ_NO_ARCHIVE_WRITING_APIS` — we read from an in-memory buffer and extract
to a heap buffer, so file I/O, time, and all ZIP-writing code are compiled out.
