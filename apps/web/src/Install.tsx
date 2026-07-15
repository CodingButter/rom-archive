import { Link } from "react-router-dom";

import { QrCode } from "./QrCode";

/**
 * The `.cia` URL FBI downloads. Defaults to the GitHub Releases "latest"
 * link, which permanently redirects to the newest published `rom-archive.cia`
 * asset — the QR never changes as new releases ship. Override with
 * `VITE_CIA_URL` if hosting the CIA elsewhere.
 */
export const CIA_URL: string =
  import.meta.env.VITE_CIA_URL ??
  "https://github.com/CodingButter/rom-archive/releases/latest/download/rom-archive.cia";

export function Install(): React.JSX.Element {
  return (
    <main className="page">
      <header>
        <h1>Install ROM Archive</h1>
        <p className="tagline">
          Install the app with FBI's Remote Install — scan the QR code below.
        </p>
      </header>

      <section className="install-qr">
        <QrCode value={CIA_URL} />
        <p className="cia-url">
          <code>{CIA_URL}</code>
        </p>
      </section>

      <section>
        <h2>Steps</h2>
        <ol>
          <li>Open FBI on your 3DS (requires custom firmware — see the note below).</li>
          <li>
            Choose <strong>Remote Install</strong> → <strong>Scan QR Code</strong>.
          </li>
          <li>Point your 3DS camera at the QR code above.</li>
          <li>FBI downloads the CIA and installs it. Launch it from your Home Menu.</li>
        </ol>
      </section>

      <section className="note">
        <h2>Before you start</h2>
        <p>
          Installing unsigned CIAs requires a 3DS running custom firmware with
          signature patches. This is standard for homebrew and outside this app's
          control.
        </p>
      </section>

      <p>
        <Link to="/">← Back</Link>
      </p>
    </main>
  );
}
