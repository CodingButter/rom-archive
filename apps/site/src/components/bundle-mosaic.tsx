"use client";

import { useEffect, useState } from "react";
import type { Console, ItemDetailFile } from "@rom-archive/contract";

import { fetchItemPage } from "@/lib/api";
import { coverUrlFor } from "@/lib/cover";
import { CoverImage } from "@/components/cover-image";
import { Skeleton } from "@/components/ui/skeleton";

/** The spec caps the stitched mosaic at the first 10 member ROMs' covers. */
const MOSAIC_TILE_CAP = 10;

type MosaicState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "ready"; files: ItemDetailFile[] };

/**
 * The stitched bundle cover: up to the first 10 member ROMs' box-art tiled into
 * one pack image in the item header. PRESENTATION-ONLY and WEB-ONLY — it composes
 * from libretro links in the browser, never a wire field, never proxied through
 * our API (no `/download/` or image-byte fetch). Each tile derives its cover URL
 * from the member filename via {@link coverUrlFor} and reuses {@link CoverImage},
 * so a missing/absent cover collapses to a placeholder tile independently. A
 * bundle with fewer than 10 members tiles only what it has; zero files or an
 * upstream error renders nothing (the page never crashes).
 */
export function BundleMosaic({
  id,
  console,
  title,
}: {
  id: string;
  console: Console;
  title: string;
}): React.JSX.Element | null {
  const [state, setState] = useState<MosaicState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    fetchItemPage(id, { page: 1, pageSize: MOSAIC_TILE_CAP }, controller.signal)
      .then((res) => {
        const files = res.files.slice(0, MOSAIC_TILE_CAP);
        setState(files.length > 0 ? { status: "ready", files } : { status: "empty" });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState({ status: "empty" });
      });
    return () => controller.abort();
  }, [id]);

  if (state.status === "empty") return null;

  if (state.status === "loading") {
    return (
      <div
        className="grid grid-cols-5 gap-1.5 overflow-hidden rounded-xl border p-1.5"
        data-testid="bundle-mosaic"
      >
        {Array.from({ length: MOSAIC_TILE_CAP }).map((_, i) => (
          <Skeleton key={i} className="aspect-[3/4] w-full rounded-md" />
        ))}
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-5 gap-1.5 overflow-hidden rounded-xl border p-1.5"
      data-testid="bundle-mosaic"
    >
      {state.files.map((file) => (
        <div key={file.name} data-testid="mosaic-tile">
          <CoverImage url={coverUrlFor(console, file.name)} alt={`${title} — ${file.name}`} />
        </div>
      ))}
    </div>
  );
}
