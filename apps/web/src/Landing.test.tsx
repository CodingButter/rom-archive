import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { CONSOLES } from "@rom-archive/contract";
import { Landing } from "./Landing";

describe("Landing page", () => {
  it("renders one list item per contract console, sourced from the contract", () => {
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );
    const list = screen.getByTestId("console-list");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(CONSOLES.length);
    // Every contract console id is represented (drift-proof against the contract).
    const renderedIds = items.map((li) => li.getAttribute("data-console-id"));
    expect(new Set(renderedIds)).toEqual(new Set(CONSOLES));
  });
});
