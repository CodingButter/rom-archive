import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ItemPageResponse, ItemDetailFile, Console } from "@rom-archive/contract";

const fetchItemPage = vi.fn();
vi.mock("@/lib/api", () => ({
  fetchItemPage: (...args: unknown[]) => fetchItemPage(...args),
}));

import { BundleMosaic } from "./bundle-mosaic";

function file(name: string): ItemDetailFile {
  return {
    name,
    sizeBytes: 1024,
    md5: "abc",
    downloadUrl: `https://archive.org/download/x/${encodeURIComponent(name)}`,
  };
}

function page(names: string[], console: Console = "nes"): ItemPageResponse {
  return {
    id: "No-Intro_NES",
    console,
    files: names.map(file),
    total: names.length,
    page: 1,
    pageSize: 10,
  };
}

afterEach(() => {
  fetchItemPage.mockReset();
  vi.unstubAllGlobals();
});

describe("BundleMosaic", () => {
  it("fetches page 1 with pageSize 10 and tiles up to 10 covers (12 files → 10 tiles)", async () => {
    const names = Array.from({ length: 12 }, (_, i) => `Game ${i} (USA).zip`);
    fetchItemPage.mockResolvedValue(page(names));

    render(<BundleMosaic id="No-Intro_NES" console="nes" title="No-Intro NES" />);

    await waitFor(() => {
      expect(screen.getByTestId("bundle-mosaic")).toBeInTheDocument();
    });
    expect(screen.getAllByTestId("mosaic-tile")).toHaveLength(10);

    // The fetch is page 1, pageSize 10 — no full-list load.
    expect(fetchItemPage).toHaveBeenCalledWith(
      "No-Intro_NES",
      { page: 1, pageSize: 10 },
      expect.anything(),
    );
  });

  it("tiles exactly the members of a small bundle (3 files → 3 tiles, no padding)", async () => {
    fetchItemPage.mockResolvedValue(
      page(["A (USA).zip", "B (USA).zip", "C (USA).zip"]),
    );

    render(<BundleMosaic id="x" console="nes" title="Small" />);

    await waitFor(() => {
      expect(screen.getAllByTestId("mosaic-tile")).toHaveLength(3);
    });
  });

  it("makes no image-byte or /download/ fetch — composes from libretro links only", async () => {
    const globalFetch = vi.fn();
    vi.stubGlobal("fetch", globalFetch);
    fetchItemPage.mockResolvedValue(page(["Metroid (USA).zip"]));

    render(<BundleMosaic id="x" console="nes" title="No-Intro NES" />);

    await waitFor(() => {
      expect(screen.getByTestId("bundle-mosaic")).toBeInTheDocument();
    });

    // The only data call is the mocked fetchItemPage; the component never calls
    // the global fetch (no image-byte proxying, no /download/ hit).
    expect(globalFetch).not.toHaveBeenCalled();
    const derivedSrc = screen
      .getAllByRole("img")
      .map((el) => el.getAttribute("src"))
      .filter((s): s is string => Boolean(s));
    for (const src of derivedSrc) {
      expect(src).not.toContain("/download/");
    }
  });

  it("derives tile URLs through coverUrlFor (a .zip member yields a non-null libretro src)", async () => {
    fetchItemPage.mockResolvedValue(page(["Super Mario Bros. (World).zip"]));

    render(<BundleMosaic id="x" console="nes" title="No-Intro NES" />);

    const img = await screen.findByRole("img");
    expect(img).toHaveAttribute(
      "src",
      "https://thumbnails.libretro.com/Nintendo%20-%20Nintendo%20Entertainment%20System/Named_Boxarts/Super%20Mario%20Bros.%20(World).png",
    );
  });

  it("renders a placeholder tile (not a gap or crash) for an absent/null-deriving cover", async () => {
    // `pce` archive derives a real URL, but simulate the libretro 404 collapse by
    // forcing the <img> onError — the CoverImage placeholder must appear.
    fetchItemPage.mockResolvedValue(page(["Obscure (Japan).zip"], "nes"));

    render(<BundleMosaic id="x" console="nes" title="No-Intro NES" />);

    const img = await screen.findByRole("img");
    // Trigger the onError path (libretro lacks this dump).
    fireEvent.error(img);

    await waitFor(() => {
      expect(
        screen.getByRole("img", { name: /No-Intro NES — Obscure \(Japan\)\.zip \(no cover art\)/ }),
      ).toBeInTheDocument();
    });
  });

  it("renders nothing when the bundle has zero files", async () => {
    fetchItemPage.mockResolvedValue(page([]));

    const { container } = render(<BundleMosaic id="x" console="nes" title="Empty" />);

    await waitFor(() => {
      expect(screen.queryByTestId("bundle-mosaic")).not.toBeInTheDocument();
    });
    expect(container).toBeEmptyDOMElement();
  });
});
