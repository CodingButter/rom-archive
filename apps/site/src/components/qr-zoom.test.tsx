import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { QrZoom } from "./qr-zoom";

const VALUE = '{"v":1,"id":"x","file":"Game (USA) 1.gba"}';

describe("QrZoom", () => {
  it("renders the thumbnail QR with the exact value and no modal", () => {
    render(<QrZoom value={VALUE} size={180} />);

    expect(screen.getByTestId("qr")).toHaveAttribute("data-qr-value", VALUE);
    expect(screen.queryByTestId("qr-modal")).not.toBeInTheDocument();
  });

  it("opens an enlarged QR carrying the identical value on click", () => {
    render(<QrZoom value={VALUE} size={180} caption="Game (USA) 1.gba" />);

    fireEvent.click(screen.getByRole("button", { name: "Enlarge QR code" }));

    const modal = screen.getByTestId("qr-modal");
    expect(within(modal).getByTestId("qr")).toHaveAttribute("data-qr-value", VALUE);
    expect(within(modal).getByText("Game (USA) 1.gba")).toBeInTheDocument();
  });

  it("closes on the Close button, backdrop click, and Escape", () => {
    render(<QrZoom value={VALUE} />);
    const openModal = (): HTMLElement => {
      fireEvent.click(screen.getByRole("button", { name: "Enlarge QR code" }));
      return screen.getByTestId("qr-modal");
    };

    const modal = openModal();
    fireEvent.click(within(modal).getByRole("button", { name: "Close" }));
    expect(screen.queryByTestId("qr-modal")).not.toBeInTheDocument();

    const modal2 = openModal();
    fireEvent.click(modal2); // backdrop
    expect(screen.queryByTestId("qr-modal")).not.toBeInTheDocument();

    openModal();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("qr-modal")).not.toBeInTheDocument();
  });
});
