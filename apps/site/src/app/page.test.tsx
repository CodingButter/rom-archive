import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("Home page (toolchain smoke)", () => {
  it("renders the shadcn Button, proving Tailwind + shadcn + Next render", () => {
    render(<Home />);
    expect(
      screen.getByRole("button", { name: "Get started" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "ROM Archive" })).toBeInTheDocument();
  });
});
