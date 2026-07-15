import { render, screen, waitFor } from "@testing-library/react";
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

/** A response whose `total` may exceed the returned slice (models a big bundle). */
function pageResponse(
  names: string[],
  total: number,
  page: number,
  pageSize: number,
  console: Console = "nds",
): ItemPageResponse {
  return { id: "bundle", console, files: names.map(file), total, page, pageSize };
}

/** A fixed RNG so the spread walk is deterministic: identity order [1,2,3,...]. */
function fixedRandom(): () => number {
  return () => 0; // Fisher–Yates with random()=0 leaves the array in ascending order
}

afterEach(() => {
  fetchItemPage.mockReset();
  vi.unstubAllGlobals();
});

describe("BundleMosaic", () => {
  it("small bundle (total <= 10): a SINGLE fetchItemPage call, pageSize 10, no spread fetches", async () => {
    fetchItemPage.mockResolvedValue(
      pageResponse(["A (USA).zip", "B (USA).zip", "C (USA).zip"], 3, 1, 10, "nes"),
    );

    render(<BundleMosaic id="small" console="nes" title="Small" />);

    await waitFor(() => {
      expect(screen.getByTestId("bundle-mosaic")).toBeInTheDocument();
    });
    expect(fetchItemPage).toHaveBeenCalledTimes(1);
    expect(fetchItemPage).toHaveBeenCalledWith(
      "small",
      { page: 1, pageSize: 10 },
      expect.anything(),
    );
  });

  it("large bundle: spreads over MULTIPLE DISTINCT pages (not the forced first-10 slice)", async () => {
    // Probe reports a big total; each pageSize:1 fetch returns a distinct title.
    fetchItemPage.mockImplementation(
      async (_id: string, opts: { page: number; pageSize: number }) => {
        if (opts.pageSize === 10) {
          // Probe: only `total` is used from this in the spread path.
          return pageResponse(["probe.7z"], 266, 1, 10);
        }
        return pageResponse([`Title ${opts.page} (USA).7z`], 266, opts.page, 1);
      },
    );

    render(<BundleMosaic id="ds" console="nds" title="DS" random={fixedRandom()} />);

    await waitFor(() => {
      expect(screen.getByTestId("bundle-mosaic")).toBeInTheDocument();
    });

    // Collect the page numbers of the pageSize:1 spread fetches.
    const spreadPages = fetchItemPage.mock.calls
      .filter((c) => (c[1] as { pageSize: number }).pageSize === 1)
      .map((c) => (c[1] as { page: number }).page);

    expect(spreadPages.length).toBeGreaterThan(1); // more than one page sampled
    expect(new Set(spreadPages).size).toBe(spreadPages.length); // all DISTINCT
    // The probe (pageSize:10) is page 1; the spread must not simply re-walk 1..10
    // as its own forced slice — with total=266 the walk stops at 10 distinct tiles.
    expect(spreadPages.length).toBeLessThanOrEqual(13); // MAX_FETCHES(14) − probe
  });

  it("makes no image-byte or /download/ fetch — composes from libretro links only", async () => {
    const globalFetch = vi.fn();
    vi.stubGlobal("fetch", globalFetch);
    fetchItemPage.mockResolvedValue(
      pageResponse(["Metroid (USA).zip"], 1, 1, 10, "nes"),
    );

    render(<BundleMosaic id="x" console="nes" title="NES" />);

    await waitFor(() => {
      expect(screen.getByTestId("bundle-mosaic")).toBeInTheDocument();
    });

    // The only data call is the mocked fetchItemPage; the component never calls
    // the global fetch (no image-byte proxying, no /download/ hit).
    expect(globalFetch).not.toHaveBeenCalled();
  });

  /**
   * Install a mock 2D context so the draw effect runs (jsdom's getContext returns
   * null, which the component guards by returning early — that also skips Image
   * creation). Returns the spied Image instances and the mock ctx call records.
   */
  function withMockCanvas(): {
    created: HTMLImageElement[];
    ctx: Record<string, ReturnType<typeof vi.fn>>;
  } {
    const created: HTMLImageElement[] = [];
    const RealImage = globalThis.Image;
    class SpyImage extends RealImage {
      constructor() {
        super();
        created.push(this);
      }
    }
    vi.stubGlobal("Image", SpyImage);

    const ctx = {
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      setTransform: vi.fn(),
    } as unknown as Record<string, ReturnType<typeof vi.fn>>;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    );

    return { created, ctx };
  }

  it("never sets crossOrigin on the Image objects it creates (libretro has no CORS)", async () => {
    const { created } = withMockCanvas();
    fetchItemPage.mockResolvedValue(
      pageResponse(["A (USA).zip", "B (USA).zip"], 2, 1, 10, "nes"),
    );

    render(<BundleMosaic id="x" console="nes" title="NES" />);

    await waitFor(() => {
      expect(created.length).toBeGreaterThan(0);
    });
    for (const img of created) {
      expect(img.crossOrigin).toBeFalsy();
    }
  });

  it("draws a loaded cover and a placeholder for a failed one, each in a fixed slot", async () => {
    const { created, ctx } = withMockCanvas();
    fetchItemPage.mockResolvedValue(
      pageResponse(["Loaded (USA).zip", "Broken (USA).zip"], 2, 1, 10, "nes"),
    );

    render(<BundleMosaic id="x" console="nes" title="NES" />);

    await waitFor(() => {
      expect(created.length).toBe(2);
    });

    // Manually dispatch the outcomes jsdom never fires on its own.
    (created[0] as unknown as { onload: () => void }).onload();
    (created[1] as unknown as { onerror: () => void }).onerror();

    await waitFor(() => {
      expect(ctx.drawImage).toHaveBeenCalled(); // the loaded cover
    });
    expect(ctx.fillRect).toHaveBeenCalled(); // the placeholder cell for the failed one
  });

  it("does not throw when the 2D context is null (jsdom default) and still renders the canvas", async () => {
    fetchItemPage.mockResolvedValue(
      pageResponse(["A (USA).zip"], 1, 1, 10, "nes"),
    );

    render(<BundleMosaic id="x" console="nes" title="NES" />);

    // jsdom getContext("2d") returns null; the guard must prevent any throw.
    await waitFor(() => {
      expect(screen.getByTestId("bundle-mosaic").tagName).toBe("CANVAS");
    });
  });

  it("renders nothing when the bundle has zero files", async () => {
    fetchItemPage.mockResolvedValue(pageResponse([], 0, 1, 10, "nes"));

    const { container } = render(<BundleMosaic id="x" console="nes" title="Empty" />);

    await waitFor(() => {
      expect(screen.queryByTestId("bundle-mosaic")).not.toBeInTheDocument();
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the item fetch rejects (never crashes the page)", async () => {
    fetchItemPage.mockRejectedValue(new Error("upstream 502"));

    const { container } = render(<BundleMosaic id="x" console="nes" title="Broken" />);

    await waitFor(() => {
      expect(screen.queryByTestId("bundle-mosaic")).not.toBeInTheDocument();
    });
    expect(container).toBeEmptyDOMElement();
  });
});
