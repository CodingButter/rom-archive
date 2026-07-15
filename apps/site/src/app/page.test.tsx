import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CONSOLES } from "@rom-archive/contract";
import Home from "./page";

describe("Landing page", () => {
  it("renders one list item per contract console, sourced from the contract", () => {
    render(<Home />);
    const list = screen.getByTestId("console-list");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(CONSOLES.length);
    // Every contract console id is represented (drift-proof against the contract).
    const renderedIds = items.map((li) => li.getAttribute("data-console-id"));
    expect(new Set(renderedIds)).toEqual(new Set(CONSOLES));
  });

  it("links to the browse catalog", () => {
    render(<Home />);
    expect(screen.getByRole("link", { name: /Browse the ROM catalog/i })).toHaveAttribute(
      "href",
      "/browse",
    );
  });
});
