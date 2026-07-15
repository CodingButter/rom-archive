import type { FetchLike } from "../src/archiveClient.js";

/**
 * The real fetch, narrowed to the `FetchLike` seam the pure handlers depend on.
 * Isolating it here keeps the handler wrappers free of any global reference so
 * tests never need to stub `globalThis`.
 */
export const realFetch: FetchLike = (url, init) => fetch(url, init);
