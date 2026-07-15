import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { CatalogEntry } from "@rom-archive/contract";

import { fetchCatalog } from "./api";
import { scanPointerValue } from "./cover";
import { ItemMetadata } from "./ItemMetadata";
import { QrCode } from "./QrCode";
import { RomList } from "./RomList";

type EntryState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; entry: CatalogEntry };

/**
 * The full item-detail page. Given a catalog `:id`, it looks the entry up in the
 * catalog (so the URL alone is enough — no `?name=` needed), then renders:
 *   - the game-metadata panel (keyed on the catalog title),
 *   - a whole-item "Send to 3DS" QR (a bundle pointer with no `file`),
 *   - the per-ROM list with individual covers and QR codes.
 * Every child owns its own loading and graceful empty state, so this page never
 * has to handle an upstream failure.
 */
export function Item(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<EntryState>({ status: "loading" });

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setState({ status: "loading" });
    fetchCatalog(controller.signal)
      .then((res) => {
        const entry = res.entries.find((e) => e.id === id);
        setState(entry ? { status: "ready", entry } : { status: "missing" });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState({ status: "missing" });
      });
    return () => controller.abort();
  }, [id]);

  if (!id) {
    return (
      <main className="page">
        <p className="metadata-empty">No item selected.</p>
      </main>
    );
  }

  const title = state.status === "ready" ? state.entry.title : id;

  return (
    <main className="page">
      <header>
        <h1>{title}</h1>
        <p className="tagline">
          <Link to="/browse">← Browse</Link>
        </p>
      </header>

      {state.status === "missing" ? (
        <p className="metadata-empty">Unknown item.</p>
      ) : (
        <>
          <ItemMetadata id={id} name={title} />

          <section className="send-all" data-testid="send-all">
            <h2>Send whole item to 3DS</h2>
            <QrCode value={scanPointerValue(id)} size={200} />
            <p className="rom-qr-hint">
              Scan to queue every ROM in this item on your 3DS.
            </p>
          </section>

          <RomList id={id} />
        </>
      )}
    </main>
  );
}
