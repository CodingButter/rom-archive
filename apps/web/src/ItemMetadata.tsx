import { useEffect, useState } from "react";

/**
 * Base URL for the rom-archive API. Defaults to same-origin (`/api/...`), which
 * is how the SPA and its Vercel functions are deployed together. Override with
 * `VITE_API_BASE` when the API is hosted elsewhere.
 */
const API_BASE: string = import.meta.env.VITE_API_BASE ?? "";

/**
 * The metadata record returned by the `/api/metadata` endpoint. This is the wire
 * shape of the API's `GameMetadata` — kept as a local structural type so the web
 * app does not import from the API package.
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

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
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
      <section className="metadata-panel" data-testid="metadata-panel">
        <p className="metadata-status">Loading metadata…</p>
      </section>
    );
  }

  // A failed request or an "unknown" record both collapse to the same graceful
  // empty state — the page always renders.
  if (state.status === "error" || state.meta.source === "unknown") {
    return (
      <section className="metadata-panel" data-testid="metadata-panel">
        <p className="metadata-empty" data-testid="metadata-empty">
          No metadata available for this title.
        </p>
      </section>
    );
  }

  const meta = state.meta;
  return (
    <section className="metadata-panel" data-testid="metadata-panel">
      {meta.boxartUrl ? (
        <img className="metadata-boxart" src={meta.boxartUrl} alt={`${meta.title} box art`} />
      ) : null}
      <h2 className="metadata-title">{meta.title}</h2>
      <dl className="metadata-fields">
        <dt>Platform</dt>
        <dd>{meta.platform}</dd>
        {meta.releaseDate ? (
          <>
            <dt>Released</dt>
            <dd>{meta.releaseDate}</dd>
          </>
        ) : null}
        {meta.genres && meta.genres.length > 0 ? (
          <>
            <dt>Genre</dt>
            <dd>{meta.genres.join(", ")}</dd>
          </>
        ) : null}
        {meta.developer ? (
          <>
            <dt>Developer</dt>
            <dd>{meta.developer}</dd>
          </>
        ) : null}
        {meta.publisher ? (
          <>
            <dt>Publisher</dt>
            <dd>{meta.publisher}</dd>
          </>
        ) : null}
      </dl>
      {meta.overview ? <p className="metadata-overview">{meta.overview}</p> : null}
    </section>
  );
}
