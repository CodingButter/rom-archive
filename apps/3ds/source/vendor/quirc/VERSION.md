# Vendored quirc

QR-code recognition library — https://github.com/dlbeer/quirc

- **Upstream:** dlbeer/quirc
- **Commit:** `927d680904dc95fdff4cd9d022eb374b438ff8f2` (master, vendored 2026-07-16)
- **License:** ISC (see `LICENSE`) — permissive, redistribution-friendly.

Only the `lib/` core is vendored (`decode.c`, `identify.c`, `quirc.c`,
`version_db.c`, `quirc.h`, `quirc_internal.h`). The upstream demo/test programs
(libjpeg/SDL/OpenCV/V4L) are intentionally NOT vendored — they are host-only and
pull dependencies the 3DS toolchain cannot link.

This lives under `source/` (the device-only build tree) so the host doctest
build never tries to compile it. The device Makefile compiles it as plain C.

Build tuning (set in the device Makefile, not by editing sources):
- `QUIRC_FLOAT_TYPE=float` — the 3DS FPU is single-precision.
- `QUIRC_MAX_REGIONS=254` — the upstream default; kept small for the embedded
  memory budget. The camera module additionally guards its input so non-QR
  frames cannot drive quirc into the documented deep-recursion failure.
