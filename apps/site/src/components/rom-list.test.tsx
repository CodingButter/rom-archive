import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ItemDetailFile, ItemPageResponse } from "@rom-archive/contract";

import { RomList } from "./rom-list";

const PAGE_SIZE = 60;

function makeFiles(prefix: string, n: number): ItemDetailFile[] {
  return Array.from({ length: n }, (_, i) => ({
    name: `${prefix} ${i + 1}.gba`,
    sizeBytes: 1024 * (i + 1),
    md5: `md5-${prefix}-${i}`,
    downloadUrl: `https://archive.org/download/x/${prefix}-${i}`,
  }));
}

/**
 * Stub fetch to page/filter a fixed 130-file corpus the same way the server
 * does, and record every request URL so tests can assert the params the UI sent.
 */
function stubItemPage(): { urls: string[] } {
  const urls: string[] = [];
  const corpus = makeFiles("Game (USA)", 65).concat(makeFiles("Juego (Europe)", 65));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      const u = new URL(url, "http://t");
      const page = Number(u.searchParams.get("page") ?? "1");
      const q = (u.searchParams.get("q") ?? "").toLowerCase();
      const filtered = q
        ? corpus.filter((f) => f.name.toLowerCase().includes(q))
        : corpus;
      const start = (page - 1) * PAGE_SIZE;
      const body: ItemPageResponse = {
        id: "x",
        console: "gba",
        files: filtered.slice(start, start + PAGE_SIZE),
        total: filtered.length,
        page,
        pageSize: PAGE_SIZE,
      };
      return { ok: true, status: 200, json: async () => body };
    }),
  );
  return { urls };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("RomList", () => {
  it("renders one bounded page of rows and the total count", async () => {
    stubItemPage();
    render(<RomList id="x" />);

    await waitFor(() => {
      expect(screen.getByTestId("rom-list")).toBeInTheDocument();
    });
    // 130 total files, but only one 60-row page renders.
    expect(screen.getAllByTestId("rom-row")).toHaveLength(PAGE_SIZE);
    expect(screen.getByText(/ROMs \(130\)/)).toBeInTheDocument();
  });

  it("sends a per-ROM QR carrying the exact scanPointerValue(id, name)", async () => {
    stubItemPage();
    render(<RomList id="x" />);

    await waitFor(() => screen.getByTestId("rom-list"));
    const firstRow = screen.getAllByTestId("rom-row")[0];
    fireEvent.click(within(firstRow).getByRole("button", { name: "Send to 3DS" }));
    expect(within(firstRow).getByTestId("qr")).toHaveAttribute(
      "data-qr-value",
      '{"v":1,"id":"x","file":"Game (USA) 1.gba"}',
    );
  });

  it("debounced search refetches with q and resets to page 1", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { urls } = stubItemPage();
    render(<RomList id="x" />);

    await vi.waitFor(() => expect(screen.getByTestId("rom-list")).toBeInTheDocument());

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Europe" },
    });
    // Debounce settles, then a q-bearing request goes out.
    await vi.advanceTimersByTimeAsync(350);
    await vi.waitFor(() =>
      expect(urls.some((u) => u.includes("q=Europe"))).toBe(true),
    );
    const qUrl = urls.find((u) => u.includes("q=Europe"))!;
    expect(qUrl).toContain("page=1");
    expect(qUrl).toContain(`pageSize=${PAGE_SIZE}`);
  });

  it("advances pages with the pager", async () => {
    const { urls } = stubItemPage();
    render(<RomList id="x" />);

    await waitFor(() => screen.getByTestId("pager"));
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => {
      expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    });
    expect(urls.some((u) => u.includes("page=2"))).toBe(true);
  });

  it("renders an empty state (not a crash) when a search matches nothing", async () => {
    stubItemPage();
    render(<RomList id="x" />);

    await waitFor(() => screen.getByTestId("rom-list"));
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "zzzzz-nomatch" },
    });
    await waitFor(() => {
      expect(screen.getByText(/No ROMs match/)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("rom-list")).not.toBeInTheDocument();
  });
});
