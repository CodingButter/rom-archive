import { Link, useParams, useSearchParams } from "react-router-dom";

import { ItemMetadata } from "./ItemMetadata";

/**
 * The item-detail surface. Given a catalog `:id` and a `?name=` ROM/item name,
 * it renders the game-metadata panel. The metadata panel owns its own loading
 * and graceful empty state, so this page never has to handle upstream failures.
 */
export function Item(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const name = params.get("name") ?? "";

  return (
    <main className="page">
      <header>
        <h1>{name || id}</h1>
        <p className="tagline">
          <Link to="/">← Back to ROM Archive</Link>
        </p>
      </header>
      {id ? (
        <ItemMetadata id={id} name={name} />
      ) : (
        <p className="metadata-empty">No item selected.</p>
      )}
    </main>
  );
}
