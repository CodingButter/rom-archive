import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { CatalogEntry, Console } from "@rom-archive/contract";

import { fetchCatalog } from "./api";
import { CONSOLE_LIST } from "./consoles";

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
export function Browse(): React.JSX.Element {
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
    <main className="page">
      <header>
        <h1>Browse ROM Archive</h1>
        <p className="tagline">
          <Link to="/">← Home</Link>
        </p>
      </header>

      {state.status === "loading" ? (
        <p className="metadata-status">Loading catalog…</p>
      ) : state.status === "error" ? (
        <p className="metadata-empty">Could not load the catalog. Try again shortly.</p>
      ) : state.entries.length === 0 ? (
        <p className="metadata-empty">The catalog is empty.</p>
      ) : (
        groupByConsole(state.entries).map((group) => (
          <section key={group.console} data-testid={`console-${group.console}`}>
            <h2>{CONSOLE_LABEL[group.console]}</h2>
            <ul className="catalog-list">
              {group.entries.map((entry) => (
                <li key={entry.id}>
                  <Link to={`/item/${encodeURIComponent(entry.id)}`}>{entry.title}</Link>
                  <span className="catalog-kind"> · {entry.kind}</span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
