import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CatalogResponse, ItemPageResponse } from "@rom-archive/contract";
import type { ItemMetadataRecord } from "@/components/item-metadata";

const params: { id: string } = { id: "gbahomebrew" };
vi.mock("next/navigation", () => ({
  useParams: () => params,
}));

import ItemPage from "./page";

const CATALOG: CatalogResponse = {
  entries: [{ id: "gbahomebrew", title: "GBA Homebrew", console: "gba", kind: "bundle" }],
};

const ITEM: ItemPageResponse = {
  id: "gbahomebrew",
  console: "gba",
  files: [
    {
      name: "Metroid Fusion.gba",
      sizeBytes: 8_388_608,
      md5: "abc123",
      downloadUrl: "https://archive.org/download/gbahomebrew/Metroid%20Fusion.gba",
    },
  ],
  total: 1,
  page: 1,
  pageSize: 60,
};

const META: ItemMetadataRecord = {
  title: "Metroid Fusion",
  platform: "gba",
  source: "tgdb",
};

/** Route each endpoint to its fixture so the page's three fetches resolve. */
function mockRouted(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const body = url.includes("/api/item")
        ? ITEM
        : url.includes("/api/metadata")
          ? META
          : CATALOG;
      return { ok: true, status: 200, json: async () => body };
    }),
  );
}

function renderAt(id: string): void {
  params.id = id;
  render(<ItemPage />);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Item detail page", () => {
  it("renders the catalog title, a whole-item QR, and a per-ROM row with its own QR", async () => {
    mockRouted();
    renderAt("gbahomebrew");

    // Title comes from the catalog (URL alone is sufficient).
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "GBA Homebrew" })).toBeInTheDocument();
    });

    // Whole-item QR carries a bundle pointer (no `file`).
    const sendAll = screen.getByTestId("send-all");
    const bundleQr = within(sendAll).getByTestId("qr");
    expect(bundleQr).toHaveAttribute("data-qr-value", '{"v":1,"id":"gbahomebrew"}');

    // The ROM row renders its file name.
    await waitFor(() => {
      expect(screen.getByText("Metroid Fusion.gba")).toBeInTheDocument();
    });
    expect(screen.getByTestId("rom-list")).toBeInTheDocument();

    // Revealing a ROW's QR shows a single-file pointer (id + file).
    const row = screen.getByTestId("rom-row");
    fireEvent.click(within(row).getByRole("button", { name: "Send to 3DS" }));
    await waitFor(() => {
      expect(within(row).getByTestId("qr")).toHaveAttribute(
        "data-qr-value",
        '{"v":1,"id":"gbahomebrew","file":"Metroid Fusion.gba"}',
      );
    });
  });

  it("shows an unknown-item message for an id not in the catalog", async () => {
    mockRouted();
    renderAt("does-not-exist");

    await waitFor(() => {
      expect(screen.getByText(/Unknown item/i)).toBeInTheDocument();
    });
  });
});
