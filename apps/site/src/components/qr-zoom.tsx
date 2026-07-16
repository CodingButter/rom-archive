"use client";

import { useEffect, useState } from "react";

import { QrCode } from "@/components/qr-code";
import { Button } from "@/components/ui/button";

export interface QrZoomProps {
  value: string;
  size?: number;
  /** Short line shown under the enlarged QR (e.g. the ROM name). */
  caption?: string;
}

/**
 * A clickable QR code that opens a full-screen modal with a much larger
 * rendering — the 3DS camera needs size and clarity to lock on. The thumbnail
 * and the enlarged code are both the plain `QrCode` component, so the encoded
 * value (and its `data-qr-value` contract) is byte-identical in both. The
 * modal closes on backdrop click, the Close button, or Escape.
 */
export function QrZoom({ value, size = 180, caption }: QrZoomProps): React.JSX.Element {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="cursor-zoom-in rounded-lg transition-opacity hover:opacity-90"
        aria-label="Enlarge QR code"
        onClick={() => setOpen(true)}
      >
        <QrCode value={value} size={size} />
      </button>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Enlarged QR code"
          data-testid="qr-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-full flex-col items-center gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Rendered large, then CSS-capped to the viewport so it stays
                fully on screen at any window size. */}
            <div className="w-[min(90vw,70vh)] [&_img]:h-auto [&_img]:w-full">
              <QrCode value={value} size={640} />
            </div>
            {caption ? (
              <p className="max-w-md text-center text-sm break-all text-white/90">
                {caption}
              </p>
            ) : null}
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
