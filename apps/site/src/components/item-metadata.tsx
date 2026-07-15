"use client";

import { useEffect, useState } from "react";

import { Info } from "lucide-react";

import { API_BASE } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The metadata record returned by the `/api/metadata` endpoint. This is the wire
 * shape of the server's `GameMetadata` — kept as a local structural type so the
 * page does not import from the server package.
 */
export interface ItemMetadataRecord {
  title: string;
  platform: string;
  releaseDate?: string;
  genres?: string[];
  overview?: string;
  developer?: string;
  publisher?: string;
  boxartUrl?: string;
  source: "tgdb" | "libretro" | "unknown";
}

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; meta: ItemMetadataRecord };

async function fetchMetadata(
  id: string,
  name: string,
  signal: AbortSignal,
): Promise<ItemMetadataRecord> {
  const url = `${API_BASE}/api/metadata?id=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`metadata request failed: ${res.status}`);
  }
  return (await res.json()) as ItemMetadataRecord;
}

/**
 * A game-metadata panel for the item-detail surface. Fetches from the metadata
 * endpoint at runtime and renders the canonical fields. When the record is
 * `unknown` (or absent), it renders a graceful "No metadata available" state —
 * never an error that breaks the page.
 */
export function ItemMetadata({
  id,
  name,
}: {
  id: string;
  name: string;
}): React.JSX.Element {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [boxartFailed, setBoxartFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    setBoxartFailed(false);
    fetchMetadata(id, name, controller.signal)
      .then((meta) => setState({ status: "ready", meta }))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState({ status: "error" });
      });
    return () => controller.abort();
  }, [id, name]);

  if (state.status === "loading") {
    return (
      <Card data-testid="metadata-panel">
        <CardContent className="flex flex-col gap-5 sm:flex-row">
          <Skeleton className="h-52 w-40 shrink-0 rounded-lg" />
          <div className="flex flex-1 flex-col gap-3">
            <Skeleton className="h-7 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // A failed request or an "unknown" record both collapse to the same graceful
  // empty state — the page always renders.
  if (state.status === "error" || state.meta.source === "unknown") {
    return (
      <Card data-testid="metadata-panel" className="border-dashed">
        <CardContent className="flex items-center gap-3">
          <Info className="text-muted-foreground h-5 w-5 shrink-0" />
          <p className="text-muted-foreground" data-testid="metadata-empty">
            No metadata available for this title.
          </p>
        </CardContent>
      </Card>
    );
  }

  const meta = state.meta;
  return (
    <Card data-testid="metadata-panel" className="overflow-hidden">
      <CardContent className="flex flex-col gap-5 sm:flex-row">
        {meta.boxartUrl && !boxartFailed ? (
          <img
            className="ring-border w-40 shrink-0 self-start rounded-lg object-cover shadow-sm ring-1"
            src={meta.boxartUrl}
            alt={`${meta.title} box art`}
            onError={() => setBoxartFailed(true)}
          />
        ) : null}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">{meta.title}</h2>
            <Badge variant="outline" className="uppercase">
              {meta.source}
            </Badge>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Platform</dt>
            <dd>{meta.platform}</dd>
            {meta.releaseDate ? (
              <>
                <dt className="text-muted-foreground">Released</dt>
                <dd>{meta.releaseDate}</dd>
              </>
            ) : null}
            {meta.genres && meta.genres.length > 0 ? (
              <>
                <dt className="text-muted-foreground">Genre</dt>
                <dd>{meta.genres.join(", ")}</dd>
              </>
            ) : null}
            {meta.developer ? (
              <>
                <dt className="text-muted-foreground">Developer</dt>
                <dd>{meta.developer}</dd>
              </>
            ) : null}
            {meta.publisher ? (
              <>
                <dt className="text-muted-foreground">Publisher</dt>
                <dd>{meta.publisher}</dd>
              </>
            ) : null}
          </dl>
          {meta.overview ? (
            <p className="text-muted-foreground text-sm">{meta.overview}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
