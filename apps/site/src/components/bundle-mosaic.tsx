"use client";

import { useEffect, useRef, useState } from "react";
import type { Console } from "@rom-archive/contract";

import { fetchItemPage } from "@/lib/api";
import {
  MAX_FETCHES,
  TILE_CAP,
  type MosaicTile,
  buildTiles,
  shuffledPages,
} from "@/lib/mosaic-sample";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The stitched bundle cover, rendered as a single `<canvas>` composite.
 *
 * Strategy: sample a RANDOM, deduplicated spread of member ROMs from across the
 * whole bundle (NOT the first {@link TILE_CAP}, which on the DS set is ten
 * regional variants of one game), derive each cover URL client-side via
 * {@link buildTiles}, and draw the covers onto one canvas arranged as a skewed,
 * receding plane — a slightly rotated flat table of box-art.
 *
 * PRESENTATION-ONLY and WEB-ONLY. The canvas composes from libretro links loaded
 * directly in the browser; no image bytes are ever proxied through our API (no
 * `/download/` or byte fetch). Because libretro sends no CORS headers, the
 * images are loaded WITHOUT `crossOrigin` — a `crossOrigin="anonymous"` request
 * would fail to load. Drawing them taints the canvas, so this is RENDER-ONLY: we
 * never call `toDataURL`/`toBlob`/`getImageData` (they would throw a
 * SecurityError). A cover that fails to load is drawn as a muted placeholder cell
 * in its fixed slot, never a broken-image icon; zero files or an upstream error
 * renders nothing (the page never crashes).
 */

const CANVAS_W = 640;
const CANVAS_H = 320;

/** Draw one tile's cover (or a muted placeholder) into its fixed slot on the plane. */
function drawSlot(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  slot: number,
  count: number,
): void {
  const cols = Math.min(5, Math.max(1, Math.ceil(count / 2)));
  const rows = Math.ceil(count / cols);
  const col = slot % cols;
  const row = Math.floor(slot / cols);

  // Receding plane: each row deeper is smaller and pushed up/back, with a slight
  // global rotation and a small deterministic per-tile jitter.
  const depth = rows > 1 ? row / (rows - 1) : 0; // 0 (front) .. 1 (back)
  const scale = 1 - depth * 0.28;
  const tileW = (CANVAS_W / (cols + 1)) * scale;
  const tileH = tileW * (4 / 3);

  const spread = (col - (cols - 1) / 2) * (tileW * 0.92);
  const cx = CANVAS_W / 2 + spread * scale;
  const cy = CANVAS_H * 0.62 - depth * (CANVAS_H * 0.34);
  const jitter = ((slot * 37) % 11) / 11 - 0.5; // [-0.5, 0.5), stable per slot

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.06 + jitter * 0.06);
  ctx.globalAlpha = 1 - depth * 0.25;

  if (img) {
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 12 * scale;
    ctx.shadowOffsetY = 6 * scale;
    ctx.drawImage(img, -tileW / 2, -tileH / 2, tileW, tileH);
  } else {
    ctx.fillStyle = "rgba(120,130,140,0.22)";
    ctx.fillRect(-tileW / 2, -tileH / 2, tileW, tileH);
  }
  ctx.restore();
}

type MosaicState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "ready"; tiles: MosaicTile[] };

export function BundleMosaic({
  id,
  console,
  title,
  random = Math.random,
}: {
  id: string;
  console: Console;
  title: string;
  /** Injectable RNG so sampling spread is deterministic under test. */
  random?: () => number;
}): React.JSX.Element | null {
  const [state, setState] = useState<MosaicState>({ status: "loading" });
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // --- Sample a random, deduplicated spread of member covers. ---
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setState({ status: "loading" });

    void (async () => {
      try {
        // Probe once (this fetch counts against MAX_FETCHES). For a small bundle
        // the probe IS the whole fetch — its files already cover everything.
        const probe = await fetchItemPage(
          id,
          { page: 1, pageSize: TILE_CAP },
          controller.signal,
        );
        const total = probe.total;

        let tiles: MosaicTile[];
        if (total <= TILE_CAP) {
          tiles = buildTiles(probe.files, console);
        } else {
          // Spread path: walk a single up-front permutation, one page at a time.
          // Every fetch hits a DISTINCT page; top-up never re-fetches a known
          // page. The probe result feeds only `total` here, so pages 1..10 stay
          // eligible in the permutation like any others.
          const pages = shuffledPages(total, random);
          const collected: MosaicTile[] = [];
          const seen = new Set<string>();
          let fetches = 1; // the probe
          for (const p of pages) {
            if (collected.length >= TILE_CAP || fetches >= MAX_FETCHES) break;
            const res = await fetchItemPage(
              id,
              { page: p, pageSize: 1 },
              controller.signal,
            );
            fetches += 1;
            for (const t of buildTiles(res.files, console)) {
              if (collected.length >= TILE_CAP || seen.has(t.url)) continue;
              seen.add(t.url);
              collected.push(t);
            }
          }
          tiles = collected;
        }

        if (cancelled) return;
        setState(tiles.length > 0 ? { status: "ready", tiles } : { status: "empty" });
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!cancelled) setState({ status: "empty" });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [id, console, random]);

  // --- Draw the sampled covers onto the canvas as a receding plane. ---
  useEffect(() => {
    if (state.status !== "ready") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return; // jsdom / no 2D backend — never throw

    let disposed = false;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = CANVAS_W * dpr;
    canvas.height = CANVAS_H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const tiles = state.tiles;
    const count = tiles.length;

    const paint = (): void => {
      if (disposed) return;
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      // Back-to-front so nearer tiles overlap farther ones.
      for (let slot = count - 1; slot >= 0; slot--) {
        drawSlot(ctx, loaded[slot] ?? null, slot, count);
      }
    };

    const loaded: (HTMLImageElement | null)[] = new Array(count).fill(null);
    tiles.forEach((tile, slot) => {
      // No crossOrigin: libretro has no CORS, so an anonymous request would fail
      // to load. The canvas taints (render-only), which is fine.
      const img = new Image();
      img.onload = () => {
        if (disposed) return;
        loaded[slot] = img;
        paint();
      };
      img.onerror = () => {
        if (disposed) return;
        loaded[slot] = null; // draw a placeholder cell for this slot
        paint();
      };
      img.src = tile.url;
    });

    paint(); // initial placeholders before any image loads

    return () => {
      disposed = true;
    };
  }, [state]);

  if (state.status === "empty") return null;

  if (state.status === "loading") {
    return (
      <Skeleton
        className="aspect-[2/1] w-full rounded-xl"
        data-testid="bundle-mosaic"
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      data-testid="bundle-mosaic"
      role="img"
      aria-label={`${title} pack cover`}
      className="aspect-[2/1] w-full rounded-xl border bg-gradient-to-br from-muted/40 to-card"
    />
  );
}
