"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Gamepad2 } from "lucide-react";
import type { CatalogEntry, Console } from "@rom-archive/contract";

import { fetchCatalog } from "@/lib/api";
import { CONSOLE_LIST } from "@/lib/consoles";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

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
 * A catalog card. The cover tile and kind badge live OUTSIDE the anchor so the
 * link's accessible name stays exactly the entry title; the whole card is
 * click-through via an absolutely-positioned link overlay whose own name is the
 * title alone.
 */
function CatalogCard({ entry, label }: { entry: CatalogEntry; label: string }) {
  return (
    <Card className="group hover:border-primary/50 relative flex flex-col overflow-hidden p-0 transition-colors">
      <div
        aria-hidden="true"
        className="from-primary/15 to-card relative flex aspect-[4/3] items-center justify-center bg-gradient-to-br"
      >
        <Gamepad2 className="text-primary/40 group-hover:text-primary/60 h-12 w-12 transition-colors" />
        <span className="text-muted-foreground absolute top-3 left-3 font-mono text-xs tracking-widest uppercase">
          {entry.console}
        </span>
        <Badge
          variant="secondary"
          className="absolute top-3 right-3 capitalize"
        >
          {entry.kind}
        </Badge>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <Link
          href={`/item/${encodeURIComponent(entry.id)}`}
          className="after:absolute after:inset-0 font-semibold tracking-tight group-hover:text-primary transition-colors"
        >
          {entry.title}
        </Link>
        <span className="text-muted-foreground text-sm">{label}</span>
      </div>
    </Card>
  );
}

function CardGridSkeleton() {
  return (
    <div className="flex flex-col gap-10">
      {[0, 1].map((s) => (
        <section key={s} className="flex flex-col gap-4">
          <Skeleton className="h-7 w-40" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Card key={i} className="overflow-hidden p-0">
                <Skeleton className="aspect-[4/3] w-full rounded-none" />
                <div className="flex flex-col gap-2 p-4">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/3" />
                </div>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * The catalog browse surface. A responsive card grid grouped by console, each
 * card linking through to its full detail page. Kept resilient: a failed
 * catalog request renders a message, never a blank crash.
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
    <main className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-16">
      <header className="flex flex-col gap-3">
        <Link
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm"
          href="/"
        >
          <ArrowLeft className="h-4 w-4" />
          Home
        </Link>
        <h1 className="text-4xl font-bold tracking-tight">Browse the catalog</h1>
        <p className="text-muted-foreground max-w-2xl">
          Full No-Intro ROM sets, organized by console. Pick a set to see every
          title, grab covers, and send ROMs to your 3DS.
        </p>
      </header>

      {state.status === "loading" ? (
        <CardGridSkeleton />
      ) : state.status === "error" ? (
        <Card className="border-destructive/30 bg-destructive/5 p-8 text-center">
          <p className="text-muted-foreground">
            Could not load the catalog. Try again shortly.
          </p>
        </Card>
      ) : state.entries.length === 0 ? (
        <p className="text-muted-foreground">The catalog is empty.</p>
      ) : (
        <div className="flex flex-col gap-10">
          {groupByConsole(state.entries).map((group) => (
            <section
              key={group.console}
              className="flex flex-col gap-4"
              data-testid={`console-${group.console}`}
            >
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-semibold tracking-tight">
                  {CONSOLE_LABEL[group.console]}
                </h2>
                <span className="bg-border h-px flex-1" />
                <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
                  <ArrowRight className="h-3.5 w-3.5" />
                  {group.entries.length}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {group.entries.map((entry) => (
                  <CatalogCard
                    key={entry.id}
                    entry={entry}
                    label={CONSOLE_LABEL[group.console]}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
