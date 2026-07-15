import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CatalogResponse } from "@rom-archive/contract";
import BrowsePage from "./page";

const CATALOG: CatalogResponse = {
  entries: [
    { id: "gbahomebrew", title: "GBA Homebrew", console: "gba", kind: "bundle" },
    { id: "nes-homebrew", title: "NES Homebrew", console: "nes", kind: "bundle" },
  ],
};

function mockCatalog(body: CatalogResponse): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => body })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Browse page", () => {
  it("lists catalog entries grouped by console with links to their item pages", async () => {
    mockCatalog(CATALOG);

    render(<BrowsePage />);

    await waitFor(() => {
      expect(screen.getByTestId("console-gba")).toBeInTheDocument();
    });

    const gba = screen.getByTestId("console-gba");
    const link = within(gba).getByRole("link", { name: "GBA Homebrew" });
    expect(link).toHaveAttribute("href", "/item/gbahomebrew");

    expect(screen.getByTestId("console-nes")).toBeInTheDocument();
    // Consoles with no entries are not rendered.
    expect(screen.queryByTestId("console-snes")).not.toBeInTheDocument();
  });

  it("renders a graceful message when the catalog request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
    );

    render(<BrowsePage />);

    await waitFor(() => {
      expect(screen.getByText(/Could not load the catalog/i)).toBeInTheDocument();
    });
  });
});
