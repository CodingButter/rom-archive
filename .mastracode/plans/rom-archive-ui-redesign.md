# Plan: ROM Archive — Professional Frontend UI Redesign

## Objective

Transform the ROM Archive web app (`apps/site`) from its current default
shadcn/ui neutral shell into a deliberate, professional, visually impressive
product surface: an accent-driven dark-first design system, real app chrome
(persistent nav + footer), card-based visual catalog with cover art, and
polished loading/empty states — **with zero behavior changes.** Every existing
test contract (test ids, ARIA roles, asserted text, and the byte-exact QR
pointer JSON) and every server/API contract stays intact. This is a
**presentation-only** change: no route handler, domain-core, contract-schema, or
3DS-wire modifications.

## Definition of done

- Landing, Browse, Item-detail, and Install pages are visually redesigned on a
  cohesive accent-driven design system with a persistent nav bar and footer.
- All **217** existing site tests pass unchanged (same selectors, roles, texts).
- `tsc --noEmit` clean; `next build` succeeds; the full monorepo turbo gate is
  green.
- No new server-side logic, no API/contract/schema changes, no new runtime deps
  beyond shadcn/ui primitives and up to two Google fonts (body + display) via
  `next/font`.
- Live visual proof: a running `next start` walkthrough of every page captured
  in the proof directory.
- Adversarial review returns no unresolved must-fix items.

## Branch & how to review

- Branch: `feat/rom-archive-monorepo` (current working branch).
- Diff scope must be confined to `apps/site/` (plus this plan/progress file and
  the proof directory). Get the diff with:
  `git diff main -- apps/site/` (or `git diff <phase-start-sha> -- apps/site/`).

## Do NOT (hard constraints)

- **Do not** touch any file under `apps/site/src/server/`,
  `apps/site/src/app/api/`, `packages/contract/`, or `apps/3ds/`. This plan is
  UI-only.
- **Do not** change the additive `/api/item` response contract or any endpoint.
- **Do not** change the QR pointer wire format. `data-qr-value` must remain
  byte-identical: bundle → `{"v":1,"id":"<id>"}`, per-file →
  `{"v":1,"id":"<id>","file":"<name>"}`. The `scanPointerValue(id, name)` helper
  and `qr-code.tsx` value derivation are frozen.
- **Do not** remove, rename, or restructure any element that a test selects.
  Pinned hooks that MUST survive verbatim (see Appendix A for the exhaustive
  list): `data-testid` values `console-list`, `console-{id}`, `rom-list`,
  `rom-row`, `qr`, `pager`, `send-all`; `data-console-id` on landing list items;
  ARIA roles `listitem`, `link`, `button`, `searchbox`; and the asserted strings
  `"Browse the ROM catalog"`, `"Could not load the catalog"`, `"Send to 3DS"`,
  `"Next"`, `"ROMs (<n>)"`, `"Page <n> of <m>"`, `"No ROMs match"`,
  `"Unknown item"`, `CIA_URL` text, and the Install `<li>` matching
  `/Remote Install.*Scan QR Code/`.
- **Do not** add client-side data fetching to Landing (`app/page.tsx`) — it is a
  server component that renders the console list synchronously from the contract
  (via `lib/consoles.ts` → `CONSOLE_LIST`, derived from the contract `CONSOLES`);
  keep it renderable without a `fetch` mock.
- **Do not** introduce heavy animation libraries or a CSS-in-JS runtime. Use
  Tailwind v4 + `tw-animate-css` (already present) and shadcn primitives only.
- **Do not** change any behavior of the paginated ROM list (debounce timing,
  page reset on search, pager math, empty state) — restyle only.
- **Do not** edit `lib/cover.ts`'s `scanPointerValue` — the QR wire bytes depend
  on its exact object-literal key order (`{ v, id }` / `{ v, id, file }`). Cover
  derivation helpers may be *composed* but this function is frozen.
- **Do not** drop `encodeURIComponent(entry.id)` on the Browse item `href` —
  preserve `href={/item/${encodeURIComponent(entry.id)}}`. (Tested ids are clean,
  but the encode is existing behavior and must not be silently removed.)
- **Single-text-node / accessible-name rule (closes the whole class of restyle
  regressions):** For every asserted string or role name, keep it as the text
  content of ONE element and keep that element's tag/role. Never wrap numbers,
  filenames, or URL text in child elements (e.g. do NOT turn `Page 1 of 3` into
  `Page <span>1</span> of <span>3</span>`, and keep `ROMs (<n>)` inline). Never
  fold extra text into a tested link's or heading's accessible name — a card's
  cover, badge, or icon text must NOT live inside the `<Link>`/`<a>` whose name a
  test matches exactly. Headings stay heading elements (`h1`–`h6`); the Install
  "Steps" stay an `<ol><li>`; the search input stays `<input type="search">`
  with its `aria-label` (that is what yields `role="searchbox"` and its name).
- **Do not** re-theme the QR container off a light background. `qr-code.tsx`
  renders the code on `bg-white` for scannability — this is a product invariant
  no test guards (tests read `data-qr-value`, not pixels). Keep the QR tile light
  even in the dark accent theme.

## Progress file

Maintain `.mastracode/plans/rom-archive-ui-redesign.progress.md` throughout.
Create it in Phase 0 with a phase checklist; after each phase append: the commit
SHA, gate results (test count, typecheck, build), and any deviation from this
plan with its justification. This is the running record a reviewer reads.

---

## Phase 0 — Baseline

**Goal:** Prove a green starting point and record it, so every later "still
green" claim is anchored.

**Steps**
1. Confirm branch is `feat/rom-archive-monorepo` and the tree is clean (only
   `.mastracode/` untracked is acceptable).
2. Run the gate: `pnpm --filter @rom-archive/site test` (expect 217 passed),
   `pnpm --filter @rom-archive/site build` (expect success),
   `pnpm --filter @rom-archive/site check` (typecheck clean).
3. Create `.mastracode/plans/rom-archive-ui-redesign.progress.md` with the phase
   checklist and the recorded baseline numbers.

**Verification gate (must pass to proceed)**
- 217/217 tests green, build success, typecheck clean, tree clean.

---

## Phase 1 — Design-system foundation (tokens, fonts, primitives)

**Goal:** Establish the visual language in one place — before any page markup
changes — so later phases only compose it.

**Steps**
1. Rework `apps/site/src/app/globals.css`:
   - Introduce a distinctive brand **accent** hue (OKLCH) for `--primary` and
     `--ring` (and a complementary `--accent`), dark-first, keeping WCAG-AA
     contrast against `--background`/`--card` in both `.dark` and `:root`.
   - Refine the neutral ramp (backgrounds/cards/muted/borders) so surfaces have
     subtle depth rather than flat gray.
   - Keep the existing `@theme inline` token→utility wiring and all token names
     (do not rename tokens shadcn primitives depend on).
2. **Starting point:** `app/layout.tsx` currently wires NO font at all (only
   `min-h-screen antialiased`); there is no Inter and no `--font-sans`/
   `--font-display` mapping in `globals.css`. The body renders in the Tailwind/
   browser default stack today. This phase adds fonts from scratch: a body font
   (e.g. Inter) AND a display/heading font via `next/font/google`, wired in
   `app/layout.tsx` as CSS variables and mapped to `--font-sans` / `--font-display`
   in `globals.css`'s `@theme inline`. `next/font` is SSR-safe (no hydration
   mismatch).
3. Add the shadcn primitives the redesign will use — `skeleton`, `separator`
   (only what later phases actually consume). **Hand-author** them by copying the
   new-york style of the existing `components/ui/*.tsx` (`button`, `badge`,
   `card`); use the shadcn CLI only if it can run without rewriting
   `components.json` or `globals.css`, to avoid colliding with the existing
   Tailwind v4 `@theme inline` token wiring.
4. No page component markup changes in this phase — tokens/fonts/primitives only.

**Verification gate**
- `pnpm --filter @rom-archive/site test` → 217/217 (visual-only change must not
  break any test).
- `build` succeeds; `check` clean.
- Manual: run `next start` and eyeball Landing to confirm the new palette/fonts
  load (no functional assertion, just a smoke look). Record a note in progress.

**Commit:** `feat(site): establish accent-driven design system foundation`

---

## Phase 2 — App chrome + Landing hero

**Goal:** Give the app a real shell and a landing page worthy of a portfolio.

**Steps**
1. Add a persistent **nav bar** (brand mark/wordmark, links to Browse and
   Install, and a theme toggle button) and a **footer**, composed into
   `app/layout.tsx` (or a `SiteShell` wrapper it renders). The theme toggle uses
   the existing `next-themes` provider; button is a client component.
2. Rebuild `app/page.tsx` (Landing) into a hero section (headline, subcopy, the
   two existing CTAs) + a feature/how-it-works section + the console cloud.
   - **Preserve exactly:** the `data-testid="console-list"` element containing
     one `role="listitem"` per contract console, each carrying
     `data-console-id="<console>"`; and a `role="link"` whose accessible name
     matches `/Browse the ROM catalog/i` pointing to `/browse`. Landing stays a
     server component (no client fetch).
3. Style the Install page to sit inside the new chrome; **preserve** the `qr`
   testid with `data-qr-value === CIA_URL`, the visible `CIA_URL` text, and the
   `<li>` matching `/Remote Install.*Scan QR Code/`.

**Verification gate**
- `test` → 217/217; the Landing and Install tests in particular must pass
  unchanged.
- `build` + `check` green.

**Commit:** `feat(site): add persistent nav/footer chrome and landing hero`

---

## Phase 3 — Browse as a visual catalog

**Goal:** Replace the flat text list with a professional, card-based catalog.

**Steps**
1. Rebuild `app/browse/page.tsx` into a responsive **card grid**: one card per
   catalog entry with cover art (derive a representative cover client-side via
   the existing `lib/cover.ts`, using `cover-image.tsx`'s graceful 404
   fallback), console label, and the kind badge. Group or filter by console.
   - **Preserve exactly:** a container per populated console carrying
     `data-testid="console-{id}"`; within it a `role="link"` whose accessible
     name is **exactly** the entry title, `href={/item/${encodeURIComponent(entry.id)}}`;
     consoles with no entries are NOT rendered; on fetch failure the single-node
     text `Could not load the catalog` appears.
   - **Accessible-name trap (must avoid):** do NOT make the whole card one big
     `<Link>`. The cover (`CoverImage`'s fallback carries `role="img"` +
     `aria-label`), the kind `<Badge>`, and any icon text would fold into the
     link's accessible name and break the exact-match `getByRole("link",
     { name: <title> })`. Keep cover/badge/icon OUTSIDE the tested anchor (or
     `aria-hidden` them); the anchor's name stays the title alone.
2. Add **loading skeletons** (from Phase 1's `skeleton` primitive) for the
   fetch-in-flight state — replacing any bare "Loading…" text. This must not
   introduce a selector a test depends on; keep the ready-state markup that tests
   assert against unchanged in shape.
3. **Out of scope for autonomous execution:** a console filter control. It adds
   untested interactive state to a zero-behavior-change plan for no contract
   benefit and is the most likely over-engineering vector — do not build it.

**Verification gate**
- `test` → 217/217; Browse tests (grouped entries, correct link href, absent
  empty consoles, error text) pass unchanged.
- `build` + `check` green.

**Commit:** `feat(site): rebuild browse as a card-based visual catalog`

---

## Phase 4 — Item-detail polish

**Goal:** Make the ROM-detail page cover-forward and cohesive while freezing all
its wire/behavior contracts.

**Steps**
1. Restyle `app/item/[id]/page.tsx`: a cover-forward header (title from
   catalog), the `item-metadata` panel, and a prominent whole-bundle
   **"Send to 3DS"** card.
   - **Preserve exactly:** the heading text equals the catalog title; the
     `data-testid="send-all"` region contains a `qr` with
     `data-qr-value === '{"v":1,"id":"<id>"}'`; an unknown id renders text
     matching `/Unknown item/i`.
2. Restyle `components/rom-list.tsx` rows and controls (search box, pager) —
   **appearance only.** Freeze: debounce behavior, `page=1` reset on search,
   pager math, and all selectors/texts (`rom-list`, `rom-row`, `qr` +
   `data-qr-value`, `pager`, `role="searchbox"`, button names `Send to 3DS` and
   `Next`, and the strings `ROMs (<n>)`, `Page <n> of <m>`, `No ROMs match`).
3. Restyle `components/item-metadata.tsx` and `components/cover-image.tsx`
   presentationally; keep the metadata fetch and graceful empty state intact.

**Verification gate**
- `test` → 217/217; Item-detail and RomList tests (QR pointer JSON, pager,
  debounced search, empty state) pass unchanged.
- `build` + `check` green.

**Commit:** `feat(site): polish item-detail and ROM list presentation`

---

## Phase 5 — Ship checks

**Goal:** Prove the whole redesign is correct, cohesive, and contract-safe.

**Steps**
1. **Full gate:** `pnpm --filter @rom-archive/site test` (217/217),
   `check` clean, `build` success; then the monorepo gate
   `pnpm turbo run build check test` green from a clean `.next`.
2. **No-drift check:**
   - `git diff --stat main -- apps/site/src/server apps/site/src/app/api packages/contract apps/3ds` → empty (no server/contract/3DS changes). This is
     the enforcement of the UI-only boundary.
3. **Live proof:** start the built app (`next start`), walk `/`, `/browse`,
   `/install`, and an `/item/<id>` page; capture screenshots or a recorded
   walkthrough into `.mastracode/plans/rom-archive-ui-redesign.proof/`, plus a
   short README describing what each shot demonstrates. Because the new
   interactive states are largely untested, run this concrete manual checklist
   and record the result: (a) toggle the theme (dark↔light, no hydration flash or
   mismatch); (b) trigger a cover 404 on Browse and confirm the fallback tile
   renders without breaking card layout; (c) run an empty-match search in the ROM
   list and confirm the `No ROMs match` state; (d) confirm a per-ROM QR reveals
   the exact single-file pointer value AND the QR tile is on a light background.
4. **Docs:** add a short "Design system" note to `apps/site/README.md`
   (accent theme, fonts, chrome) — presentation docs only.
5. **Adversarial review:** run `adversarial_review` against the full
   `apps/site/` diff with this plan as `plan_path`. Triage findings; fix any
   must-fix; re-review after fixes.
6. **Human approval gate:** stop and present the result (gate summary + proof
   links) for the user to approve before considering the goal done.

**Verification gate (ship)**
- 217/217 tests, typecheck clean, build success, monorepo gate green.
- Server/contract/3DS diff empty; no key leak.
- Proof artifacts present; adversarial review clean.

---

## Risks & mitigations

- **Risk:** a restyle accidentally drops a `data-testid`/role/text a test pins →
  test fails. **Mitigation:** run `test` at the end of every phase; Appendix A is
  the checklist; only 217/217 advances a phase.
- **Risk:** cover images 404 (archive.org / libretro CDN gaps) on Browse cards →
  broken images. **Mitigation:** reuse `cover-image.tsx`'s existing `onError`
  fallback; never let a missing cover break layout.
- **Risk:** theme-toggle client component or new font causes hydration
  mismatch. **Mitigation:** keep `next-themes` config as-is
  (`disableTransitionOnChange`), fonts via `next/font` (SSR-safe), verify with
  `next build` + a `next start` smoke each phase.
- **Risk:** turbo `check` needs `.next/types` from `build` first (known ordering
  dep already configured). **Mitigation:** run `build` before `check`; rely on
  the existing `@rom-archive/site#check` → `#build` turbo dependency.

## Out of scope

- Any server, API, contract-schema, or 3DS change.
- Catalog content changes, ownership-verification gate (explicitly deferred to a
  separate future plan — no mention or scaffolding here).
- New pages/routes beyond restyling the existing four.

---

## Appendix A — Frozen test contract (verbatim)

These are asserted by the existing suite and MUST survive the redesign
unchanged. Each pin lists the assertion **and the mechanism that produces it**
today — the mechanism is where an autonomous restyle slips. This inventory is
exhaustive; if you touch a file, cross-check its pins here.

**Landing (`app/page.test.tsx`)**
- `getByTestId("console-list")` → `getAllByRole("listitem")` of length
  `CONSOLES.length`; each listitem carries `data-console-id`; the id set equals
  `CONSOLES`. *Mechanism:* an `<ul>`/list with one `<li data-console-id>` per
  `CONSOLE_LIST` item. Keep list-item elements.
- `getByRole("link", { name: /Browse the ROM catalog/i })` → `href="/browse"`.
  *Mechanism:* an anchor whose accessible name contains "Browse the ROM catalog".

**Browse (`app/browse/page.test.tsx`)**
- `getByTestId("console-gba")`, `getByTestId("console-nes")` present;
  `queryByTestId("console-snes")` absent (empty consoles not rendered).
- Within `console-gba`: `getByRole("link", { name: "GBA Homebrew" })` (EXACT
  name) → `href="/item/gbahomebrew"`. *Mechanism:* an anchor whose accessible
  name is exactly the title — nothing else (cover/badge/icon) inside it.
- On failure: single-node text `/Could not load the catalog/i`.

**Item detail (`app/item/[id]/page.test.tsx`)**
- `getByRole("heading", { name: "GBA Homebrew" })`. *Mechanism:* the title is an
  actual heading element (`h1`–`h6`) in the ready state — do not restyle it into
  a `<div>`.
- `getByTestId("send-all")` → within it `getByTestId("qr")` has
  `data-qr-value = '{"v":1,"id":"gbahomebrew"}'`.
- `getByTestId("rom-list")` and `getByTestId("rom-row")` present; the row's file
  name `getByText("Metroid Fusion.gba")` present (single node); clicking the
  row's `getByRole("button", { name: "Send to 3DS" })` reveals a `qr` with
  `data-qr-value = '{"v":1,"id":"gbahomebrew","file":"Metroid Fusion.gba"}'`.
- Unknown id → text `/Unknown item/i`.

**RomList (`components/rom-list.test.tsx`)**
- `getByTestId("rom-list")`; `getAllByTestId("rom-row")` length == page size (60);
  single-node text `/ROMs \(130\)/` (keep "ROMs" and the count in one node).
- Per-ROM `qr` `data-qr-value = '{"v":1,"id":"x","file":"Game (USA) 1.gba"}'`.
- `getByRole("searchbox")`. *Mechanism:* `<input type="search">` with its
  `aria-label` — keep both (a shadcn `<Input>` defaults to `type="text"` →
  `role="textbox"` and breaks this). Debounced change sends a request with `q=`,
  `page=1`, `pageSize=60`.
- `getByTestId("pager")`; EXACT text `Page 1 of 3` (single node — do not wrap the
  numbers); `getByRole("button",{name:"Next"})` advances to `Page 2 of 3` and
  requests `page=2`.
- No-match search → text `/No ROMs match/`; `rom-list` no longer present.

**Install (`app/install/page.test.tsx`)**
- `getByTestId("qr")` has `data-qr-value === CIA_URL`.
- `getByText(CIA_URL)` present as a single node (currently inside `<code>`).
- An `<li>` matching `/Remote Install.*Scan QR Code/`. *Mechanism:* the matcher
  requires `el.tagName === "LI"` — keep the "Steps" as an `<ol><li>`; do NOT
  convert them to `<div>` timeline/cards.

## Ship checks (summary)

- [ ] 217/217 site tests green
- [ ] `tsc --noEmit` clean
- [ ] `next build` success
- [ ] monorepo turbo gate green
- [ ] server/API/contract/3DS diff empty
- [ ] live proof captured in proof dir (incl. theme-toggle, cover-404, empty-search, light QR checks)
- [ ] adversarial review clean (must-fixes resolved)
- [ ] human approval
