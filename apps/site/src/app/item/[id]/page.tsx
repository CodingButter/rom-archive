"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { CatalogEntry } from "@rom-archive/contract";

import { fetchCatalog } from "@/lib/api";
import { scanPointerValue } from "@/lib/cover";
import { ItemMetadata } from "@/components/item-metadata";
import { QrCode } from "@/components/qr-code";
import { RomList } from "@/components/rom-list";
import { Card, CardContent } from "@/components/ui/card";

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
export default function ItemPage(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : undefined;
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
      <main className="mx-auto max-w-4xl px-6 py-16">
        <p className="text-muted-foreground">No item selected.</p>
      </main>
    );
  }

  const title = state.status === "ready" ? state.entry.title : id;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground">
          <Link className="text-primary underline" href="/browse">
            ← Browse
          </Link>
        </p>
      </header>

      {state.status === "missing" ? (
        <p className="text-muted-foreground">Unknown item.</p>
      ) : (
        <>
          <ItemMetadata id={id} name={title} />

          <Card data-testid="send-all">
            <CardContent className="flex flex-col items-center gap-3">
              <h2 className="text-xl font-semibold">Send whole item to 3DS</h2>
              <QrCode value={scanPointerValue(id)} size={200} />
              <p className="text-muted-foreground text-sm">
                Scan to queue every ROM in this item on your 3DS.
              </p>
            </CardContent>
          </Card>

          <RomList id={id} />
        </>
      )}
    </main>
  );
}
