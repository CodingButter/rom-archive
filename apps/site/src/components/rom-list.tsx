"use client";

import { useEffect, useState } from "react";
import type { Console, ItemDetailFile } from "@rom-archive/contract";

import { fetchItemPage } from "@/lib/api";
import { coverUrlFor, scanPointerValue } from "@/lib/cover";
import { Button } from "@/components/ui/button";
import { CoverImage } from "@/components/cover-image";
import { QrCode } from "@/components/qr-code";

const PAGE_SIZE = 60;

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; console: Console; files: ItemDetailFile[]; total: number };

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
 * The ROM list for an item: a searchable, paginated per-file grid. Bundles can
 * carry thousands of ROMs, so the list fetches one bounded page at a time from
 * `/api/item?page=&pageSize=&q=` — only the current page ever renders. A debounced
 * search box drives the `q` filter (resetting to page 1), and a prev/next pager
 * walks pages using the server-reported `total`. Each row still carries its own
 * single-file "Send to 3DS" QR. Resilient — a failed request renders a message
 * rather than crashing the page.
 */
export function RomList({ id }: { id: string }): React.JSX.Element {
  const [rawQuery, setRawQuery] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [state, setState] = useState<LoadState>({ status: "loading" });

  // Debounce the search box: typing settles for 300ms before we refetch, and
  // any query change resets paging to the first page.
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(rawQuery.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [rawQuery]);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    fetchItemPage(
      id,
      { page, pageSize: PAGE_SIZE, q: query || undefined },
      controller.signal,
    )
      .then((res) =>
        setState({
          status: "ready",
          console: res.console,
          files: res.files,
          total: res.total,
        }),
      )
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState({ status: "error" });
      });
    return () => controller.abort();
  }, [id, page, query]);

  const totalPages =
    state.status === "ready" ? Math.max(1, Math.ceil(state.total / PAGE_SIZE)) : 1;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">
          ROMs{state.status === "ready" ? ` (${state.total})` : ""}
        </h2>
        <input
          type="search"
          value={rawQuery}
          onChange={(e) => setRawQuery(e.target.value)}
          placeholder="Search ROMs by name…"
          aria-label="Search ROMs by name"
          className="border-input bg-background w-full max-w-xs rounded-md border px-3 py-2 text-sm"
        />
      </div>

      {state.status === "loading" ? (
        <p className="text-muted-foreground">Loading ROMs…</p>
      ) : state.status === "error" ? (
        <p className="text-muted-foreground">Could not load ROMs for this item.</p>
      ) : state.files.length === 0 ? (
        <p className="text-muted-foreground">
          {query ? `No ROMs match "${query}".` : "No ROMs in this item."}
        </p>
      ) : (
        <>
          <ul
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            data-testid="rom-list"
          >
            {state.files.map((file) => (
              <RomRow key={file.name} id={id} console={state.console} file={file} />
            ))}
          </ul>

          {totalPages > 1 ? (
            <div className="flex items-center justify-center gap-4" data-testid="pager">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-muted-foreground text-sm">
                Page {page} of {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
