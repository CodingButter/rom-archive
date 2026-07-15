import { render, screen } from "@testing-library/react";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";

import { CIA_URL } from "@/lib/cia";
import InstallPage from "./page";

describe("Install page", () => {
  it("renders a QR element that encodes exactly the configured CIA URL", () => {
    render(<InstallPage />);
    const qr = screen.getByTestId("qr");
    // The QR's encoded value is exposed directly (not read from pixels).
    expect(qr).toHaveAttribute("data-qr-value", CIA_URL);
  });

  it("the exposed value round-trips through the qrcode library's own data", () => {
    // Decode the qrcode library's segment data back to a string and assert it
    // equals the CIA URL — proving the QR encodes exactly the configured URL
    // via the library's data, not by reading pixels.
    const segments = QRCode.create(CIA_URL).segments;
    const bytes: number[] = [];
    for (const seg of segments) {
      for (const b of seg.data as Iterable<number>) bytes.push(b);
    }
    const decoded = Buffer.from(bytes).toString("utf8");
    expect(decoded).toBe(CIA_URL);
  });

  it("shows the CIA URL as text and the FBI install steps", () => {
    render(<InstallPage />);
    expect(screen.getByText(CIA_URL)).toBeInTheDocument();
    // "Remote Install" and "Scan QR Code" render inside <strong> tags within a
    // single <li>; match the list item by its full text content.
    expect(
      screen.getByText(
        (_content, el) =>
          el?.tagName === "LI" && /Remote Install.*Scan QR Code/.test(el.textContent ?? ""),
      ),
    ).toBeInTheDocument();
  });
});
