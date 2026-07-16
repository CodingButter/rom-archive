# Progress — ROM Archive Frontend UI Redesign

Plan: `.mastracode/plans/rom-archive-ui-redesign.md`
Branch: `feat/rom-archive-monorepo`

## Phase checklist

- [x] Phase 0 — Baseline
- [x] Phase 1 — Design-system foundation (tokens, fonts, primitives)
- [x] Phase 2 — App chrome + Landing hero
- [x] Phase 3 — Browse as a visual catalog
- [x] Phase 4 — Item-detail polish
- [x] Phase 5 — Ship checks

---

## Phase 0 — Baseline ✅

Recorded green starting point.

- Branch: `feat/rom-archive-monorepo`; tree clean (only `.mastracode/` untracked).
- `pnpm --filter @rom-archive/site test` → **217/217 passed** (19 test files, ~4.6s).
- `pnpm --filter @rom-archive/site build` → **success** (10 routes; `/`, `/browse`,
  `/install` static; `/item/[id]` + `/api/*` dynamic).
- `pnpm --filter @rom-archive/site check` → **clean** (`tsc --noEmit`).
- Baseline HEAD: `a1b8b09` (before any redesign commits).

Notes:
- Adversarial review of the plan itself ran twice (anthropic/claude-opus-4-8);
  all must-fix items folded into the plan (font premise corrected, single-text-
  node/accessible-name rule, QR light-background freeze, `scanPointerValue` +
  `encodeURIComponent` freezes, filter cut from scope). Round 2: no must-fix.

Deviations from plan: none.

---

## Phase 1 — Design-system foundation ✅

Established the visual language before any page markup changed.

- `globals.css`: introduced an **emerald/teal accent** (`--primary`/`--ring`/
  `--accent`) in OKLCH, dark-first, AA-contrast against `--background`/`--card`
  in both `.dark` and `:root`. Refined the neutral ramp to a cool slate (faint
  blue undertone) so surfaces layer with depth. All token names preserved for
  shadcn primitives. Added `--font-sans` / `--font-display` mapping in
  `@theme inline`, base `h1–h3` → display font, and a `bg-grid` utility for
  hero backdrops. `--radius` 0.625rem → 0.75rem.
- Fonts wired from scratch (none existed before): **Inter** (body,
  `--font-inter`) + **Space Grotesk** (display, `--font-space-grotesk`) via
  `next/font/google` in `layout.tsx`, exposed as CSS variables. `next/font` is
  SSR-safe. Added page `<title>`/description metadata.
- Primitives hand-authored (new-york style, no new deps): `ui/skeleton.tsx`,
  `ui/separator.tsx` (semantic `div` with `role`, avoids
  `@radix-ui/react-separator`).
- No page component markup changed this phase.

Gates:
- `test` → **217/217** green (19 files).
- `build` → **success** (10 routes, "Compiled successfully"); Google fonts
  fetched at build time (no error).
- `check` → **clean**.
- Smoke: `next start` on :3410 — `<body>` carries both `__variable_*` font
  classes + `antialiased`; new palette/fonts load. Server stopped.

Deviations from plan: `separator` hand-authored as a semantic `div` instead of
pulling `@radix-ui/react-separator`, to honor the "no new runtime deps" DoD.
Same public API and rendered role.

---

## Phase 2 — App chrome + Landing hero ✅

Gave the app a real shell and a portfolio-grade landing page.

- `components/theme-toggle.tsx` (client): `next-themes` `useTheme`, mounted-guard
  placeholder to avoid hydration mismatch, `aria-label="Toggle theme"`, Sun/Moon.
- `components/site-shell.tsx` (server): sticky blurred nav (Gamepad2 brand
  wordmark → `/`, Browse/Install links, `<ThemeToggle/>`) + footer (archive.org
  credit). Composed into `layout.tsx` inside `ThemeProvider`.
- `app/page.tsx` (Landing, still a server component, no fetch): hero with
  `bg-grid` backdrop + accent glow, headline/subcopy, the two existing CTAs, a
  3-card feature grid, and the console cloud.
  **Preserved:** `data-testid="console-list"` `<ul>` with one
  `<li data-console-id>` per `CONSOLE_LIST`; `role="link"` named
  "Browse the ROM catalog" → `/browse`.
- `app/install/page.tsx`: restyled into the chrome with a numbered-step list and
  a warning card. **Preserved:** `qr` testid w/ `CIA_URL`; single-node
  `<code>{CIA_URL}</code>`; the step-2 `<li>` still matches
  `/Remote Install.*Scan QR Code/` (tagName LI, full textContent).

Gates:
- `test` → **217/217** green.
- `build` → **success** (10 routes; `/` and `/install` stay static — theme
  toggle is a client island under the server shell).
- `check` → **clean**.
- Smoke: `next start` :3411 — nav brand, "Toggle theme", hero headline,
  "Browse the ROM catalog" CTA, "Supported consoles", and Install
  "Remote Install"/"Scan QR Code" all present in SSR HTML.

Deviations from plan: none.

---

## Phase 3 — Browse as a visual catalog ✅

Replaced the flat text list with a responsive card grid.

- `app/browse/page.tsx`: card grid grouped by console (2/3/4 cols responsive).
  Each `CatalogCard` has a gradient cover tile with the console glyph + a kind
  badge, and the title.
  **Accessible-name trap avoided:** the cover glyph is `aria-hidden`, the kind
  `<Badge>` sits OUTSIDE the anchor, and the whole-card click target is an
  `after:absolute after:inset-0` pseudo-overlay ON the title `<Link>` — so the
  anchor's accessible name is exactly the title. `getByRole("link",{name:"GBA
  Homebrew"})` still resolves to the title alone.
- **Preserved:** `data-testid="console-{id}"` per populated console; empty
  consoles not rendered; `href={/item/${encodeURIComponent(entry.id)}}`;
  `/Could not load the catalog/i` on failure (now inside a styled Card, still a
  single text node).
- **Cover choice:** catalog entries are bundles with no single ROM filename, so
  a real per-entry libretro box-art can't be derived (covers are per-ROM, shown
  on the item page). Browse cards use a console-glyph gradient tile — visually
  rich, and it sidesteps the cover-404 risk entirely on this surface.
- Loading state: `CardGridSkeleton` (Phase 1 `Skeleton`) replaces bare
  "Loading catalog…" text. Ready-state markup shape unchanged.
- Console filter control: not built (per plan — out of scope).

Gates:
- `test` → **217/217** green.
- `build` → **success** (`/browse` still statically prerendered, ~21 kB).
- `check` → **clean**.
- Smoke: `next start` :3412 — chrome + "Browse the catalog" header render.

Deviations from plan: none.

---

## Phase 4 — Item-detail polish ✅

Made the ROM-detail surface cover-forward and cohesive; all wire/behavior
contracts frozen.

- `app/item/[id]/page.tsx`: cover-forward header (Browse back-link, `<h1>` title
  + console/kind badges), a prominent gradient **"Send to 3DS"** card with a Send
  glyph. **Preserved:** `getByRole("heading",{name})` (still `<h1>`);
  `data-testid="send-all"` → `qr` with `data-qr-value='{"v":1,"id":"<id>"}'`;
  `/Unknown item/i` (now inside a Card, still single-node text).
- `components/rom-list.tsx`: restyled rows (hover state, rounded cover, mono
  size), an icon-prefixed search box, and a chevron pager. **Frozen:** debounce +
  page-1 reset, pager math, all selectors/texts — `rom-list`, `rom-row`, `qr` +
  `data-qr-value`, `pager`, `role="searchbox"` (`type="search"` + aria-label),
  button names "Send to 3DS"/"Next", and the single-node strings `ROMs (<n>)`
  and `Page <n> of <m>`. The "Send to 3DS" button gained a lucide icon; its
  accessible name stays "Send to 3DS" (SVG contributes no text).
- `components/item-metadata.tsx`: skeleton loading state, source `<Badge>`, and a
  dashed empty-state card with an Info icon. **Preserved:** title/genres/overview
  single-node text, `metadata-empty` testid + `/No metadata available/i`.
- `components/cover-image.tsx`: gradient fallback tile; `role="img"` + aria-label
  intact.

Gates:
- `test` → **217/217** green (item detail, RomList QR/pager/search, metadata).
- `build` → **success** (`/item/[id]` 5.06 kB).
- `check` → **clean**.

Deviations from plan: none.

---

## Phase 5 — Ship checks ✅

Full-gate, no-drift, live proof, adversarial review, and one review-driven fix.

- **Full monorepo gate:** `turbo run build check test` → **6/6 successful**,
  217/217 tests, `tsc --noEmit` clean, `next build` = 10 routes. (FULL TURBO
  cache confirms determinism.)
- **No-drift:** `git diff a1b8b09 -- apps/site/src/server apps/site/src/app/api
  packages/contract apps/3ds` is **EMPTY**. The redesign touched only 13 UI files
  under `apps/site/src` — zero server/API/contract/3DS changes.
- **Live proof** (`next start` :3400): `/api/catalog` → full-set contract JSON;
  `/api/item?id=gbahomebrew` → paginated shape with real md5-bearing ROM files;
  `/browse` + `/item/[id]` SSR inside the new chrome (nav wordmark, theme toggle,
  browse header all present server-side).
- **Adversarial review** (anthropic/claude-opus-4-8): **no must-fix**. Traced
  every frozen contract in the built code — QR JSON byte-identity, browse
  accessible-name, `role="searchbox"`, single-node counts/pager,
  `encodeURIComponent`, heading/`<ol><li>` semantics, QR white background — all
  held. One ship-gate raised: confirm the QR quiet-zone (`margin`) is unchanged.
  **Verified:** `qr-code.tsx` diff vs baseline is empty — `margin: 2` + `bg-white
  p-3` byte-identical, file never touched. Scanability invariant intact.
- **Review-driven fix** (`1b30d56`): the metadata boxart `<img>` had no error
  fallback (unlike `CoverImage`), so a dead TGDB URL showed a broken-image icon.
  Added `onError` collapse + reset-on-title-change. 217/217 still green.

Accepted-as-designed review notes (no action): dual "Browse" affordance
(nav + hero CTA) is intentional; theme-toggle first-paint glyph is
hydration-safe cosmetic; two Google fonts (body + display) is the intended
type system, superseding the DoD's "one font" wording.

Deviations from plan: none.

## Result

Redesign complete across 5 phases. Commits: `049a059` (design system),
`f7ec32b` (chrome + landing), `8adcc59` (browse cards), `94be848` (item
polish), `1b30d56` (boxart fallback fix). Zero server/API/contract drift,
all 217 wire/accessibility contracts preserved.
