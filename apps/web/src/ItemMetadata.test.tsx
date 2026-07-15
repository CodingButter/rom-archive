import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ItemMetadata, type ItemMetadataRecord } from "./ItemMetadata";

function mockFetchOnce(body: ItemMetadataRecord): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => body })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ItemMetadata panel", () => {
  it("renders the metadata fields for a populated record", async () => {
    mockFetchOnce({
      title: "Metroid Fusion",
      platform: "gba",
      releaseDate: "2003-02-14",
      genres: ["Action", "Adventure"],
      overview: "Samus battles the X parasite.",
      developer: "Nintendo",
      publisher: "Nintendo",
      source: "tgdb",
    });

    render(<ItemMetadata id="gbahomebrew" name="Metroid Fusion.gba" />);

    await waitFor(() => {
      expect(screen.getByText("Metroid Fusion")).toBeInTheDocument();
    });
    expect(screen.getByText("2003-02-14")).toBeInTheDocument();
    expect(screen.getByText("Action, Adventure")).toBeInTheDocument();
    expect(screen.getByText("Samus battles the X parasite.")).toBeInTheDocument();
    expect(screen.queryByTestId("metadata-empty")).not.toBeInTheDocument();
  });

  it("renders the graceful empty state for an unknown record", async () => {
    mockFetchOnce({ title: "Nonesuch", platform: "gba", source: "unknown" });

    render(<ItemMetadata id="gbahomebrew" name="Nonesuch.gba" />);

    await waitFor(() => {
      expect(screen.getByTestId("metadata-empty")).toBeInTheDocument();
    });
    expect(screen.getByText(/No metadata available/i)).toBeInTheDocument();
  });

  it("renders the empty state (never throws) when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
    );

    render(<ItemMetadata id="gbahomebrew" name="Whatever.gba" />);

    await waitFor(() => {
      expect(screen.getByTestId("metadata-empty")).toBeInTheDocument();
    });
  });
});
