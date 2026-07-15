import { useEffect, useState } from "react";
import type { Console, ItemDetailFile } from "@rom-archive/contract";

import { fetchItem } from "./api";
import { coverUrlFor, scanPointerValue } from "./cover";
import { CoverImage } from "./CoverImage";
import { QrCode } from "./QrCode";

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
    <li className="rom-row" data-testid="rom-row">
      <CoverImage url={coverUrl} alt={file.name} />
      <div className="rom-meta">
        <p className="rom-name">{file.name}</p>
        <p className="rom-size">{formatBytes(file.sizeBytes)}</p>
        <button
          type="button"
          className="rom-send"
          aria-expanded={showQr}
          onClick={() => setShowQr((v) => !v)}
        >
          {showQr ? "Hide QR" : "Send to 3DS"}
        </button>
        {showQr ? (
          <div className="rom-qr">
            <QrCode value={scanPointerValue(id, file.name)} size={180} />
            <p className="rom-qr-hint">Scan with the ROM Archive 3DS app.</p>
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
    return <p className="metadata-status">Loading ROMs…</p>;
  }
  if (state.status === "error") {
    return <p className="metadata-empty">Could not load ROMs for this item.</p>;
  }
  if (state.files.length === 0) {
    return <p className="metadata-empty">No ROMs in this item.</p>;
  }

  return (
    <section className="rom-list-section">
      <h2>ROMs ({state.files.length})</h2>
      <ul className="rom-list" data-testid="rom-list">
        {state.files.map((file) => (
          <RomRow key={file.name} id={id} console={state.console} file={file} />
        ))}
      </ul>
    </section>
  );
}
