"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { CatalogEntry, Console } from "@rom-archive/contract";

import { fetchCatalog } from "@/lib/api";
import { CONSOLE_LIST } from "@/lib/consoles";
import { Badge } from "@/components/ui/badge";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; entries: CatalogEntry[] };

const CONSOLE_LABEL: Record<Console, string> = Object.fromEntries(
  CONSOLE_LIST.map((c) => [c.id, c.label]),
) as Record<Console, string>;

/** Group catalog entries by console, preserving the contract's console order. */
function groupByConsole(entries: CatalogEntry[]): { console: Console; entries: CatalogEntry[] }[] {
  return CONSOLE_LIST.map((c) => ({
    console: c.id,
    entries: entries.filter((e) => e.console === c.id),
  })).filter((group) => group.entries.length > 0);
}

/**
 * The catalog browse surface. Lists every curated item grouped by console, each
 * linking through to its full detail page. Kept resilient: a failed catalog
 * request renders a message, never a blank crash.
 */
export default function BrowsePage(): React.JSX.Element {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    fetchCatalog(controller.signal)
      .then((res) => setState({ status: "ready", entries: res.entries }))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState({ status: "error" });
      });
    return () => controller.abort();
  }, []);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold tracking-tight">Browse ROM Archive</h1>
        <p className="text-muted-foreground">
          <Link className="text-primary underline" href="/">
            ← Home
          </Link>
        </p>
      </header>

      {state.status === "loading" ? (
        <p className="text-muted-foreground">Loading catalog…</p>
      ) : state.status === "error" ? (
        <p className="text-muted-foreground">
          Could not load the catalog. Try again shortly.
        </p>
      ) : state.entries.length === 0 ? (
        <p className="text-muted-foreground">The catalog is empty.</p>
      ) : (
        groupByConsole(state.entries).map((group) => (
          <section
            key={group.console}
            className="flex flex-col gap-3"
            data-testid={`console-${group.console}`}
          >
            <h2 className="text-2xl font-semibold">{CONSOLE_LABEL[group.console]}</h2>
            <ul className="flex flex-col gap-2">
              {group.entries.map((entry) => (
                <li key={entry.id} className="flex items-center gap-2">
                  <Link
                    className="text-primary underline"
                    href={`/item/${encodeURIComponent(entry.id)}`}
                  >
                    {entry.title}
                  </Link>
                  <Badge variant="outline">{entry.kind}</Badge>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
