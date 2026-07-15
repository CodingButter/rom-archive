import { useEffect, useState } from "react";
import QRCode from "qrcode";

export interface QrCodeProps {
  value: string;
  size?: number;
}

/**
 * Renders `value` as a QR code image. The encoded string is also exposed as a
 * `data-qr-value` attribute so it can be asserted directly (via the qrcode
 * library's data) rather than by reading pixels.
 */
export function QrCode({ value, size = 256 }: QrCodeProps): React.JSX.Element {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: size, margin: 2 })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  return (
    <div className="qr" data-testid="qr" data-qr-value={value}>
      {dataUrl ? (
        <img src={dataUrl} width={size} height={size} alt={`QR code for ${value}`} />
      ) : (
        <span>Generating QR code…</span>
      )}
    </div>
  );
}
