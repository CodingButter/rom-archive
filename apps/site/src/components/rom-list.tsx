"use client";

import { useEffect, useState } from "react";
import type { Console, ItemDetailFile } from "@rom-archive/contract";

import { fetchItem } from "@/lib/api";
import { coverUrlFor, scanPointerValue } from "@/lib/cover";
import { Button } from "@/components/ui/button";
import { CoverImage } from "@/components/cover-image";
import { QrCode } from "@/components/qr-code";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; console: Console; files: ItemDetailFile[] };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

/** One ROM row: cover, name/size, and a toggle revealing its "Send to 3DS" QR. */
function RomRow({
  id,
  console,
  file,
}: {
  id: string;
  console: Console;
  file: ItemDetailFile;
}): React.JSX.Element {
  const [showQr, setShowQr] = useState(false);
  const coverUrl = coverUrlFor(console, file.name);

  return (
    <li
      className="bg-card flex flex-col gap-3 rounded-lg border p-3"
      data-testid="rom-row"
    >
      <div className="w-full max-w-28">
        <CoverImage url={coverUrl} alt={file.name} />
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium break-all">{file.name}</p>
        <p className="text-muted-foreground text-xs">{formatBytes(file.sizeBytes)}</p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="w-fit"
          aria-expanded={showQr}
          onClick={() => setShowQr((v) => !v)}
        >
          {showQr ? "Hide QR" : "Send to 3DS"}
        </Button>
        {showQr ? (
          <div className="flex flex-col items-start gap-1">
            <QrCode value={scanPointerValue(id, file.name)} size={180} />
            <p className="text-muted-foreground text-xs">
              Scan with the ROM Archive 3DS app.
            </p>
          </div>
        ) : null}
      </div>
    </li>
  );
}

/**
 * The ROM list for an item: a per-file grid, each with its libretro cover and an
 * individual "Send to 3DS" QR carrying a single-file scan pointer. Resilient —
 * a failed item request renders a message rather than crashing the page.
 */
export function RomList({ id }: { id: string }): React.JSX.Element {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    fetchItem(id, controller.signal)
      .then((res) => setState({ status: "ready", console: res.console, files: res.files }))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState({ status: "error" });
      });
    return () => controller.abort();
  }, [id]);

  if (state.status === "loading") {
    return <p className="text-muted-foreground">Loading ROMs…</p>;
  }
  if (state.status === "error") {
    return <p className="text-muted-foreground">Could not load ROMs for this item.</p>;
  }
  if (state.files.length === 0) {
    return <p className="text-muted-foreground">No ROMs in this item.</p>;
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">ROMs ({state.files.length})</h2>
      <ul
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        data-testid="rom-list"
      >
        {state.files.map((file) => (
          <RomRow key={file.name} id={id} console={state.console} file={file} />
        ))}
      </ul>
    </section>
  );
}
