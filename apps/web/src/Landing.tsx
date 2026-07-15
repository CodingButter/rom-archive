import { Link } from "react-router-dom";

import { CONSOLE_LIST } from "./consoles";

export function Landing(): React.JSX.Element {
  return (
    <main className="page">
      <header>
        <h1>ROM Archive</h1>
        <p className="tagline">
          A Nintendo 3DS homebrew app that downloads public-domain ROMs from
          archive.org straight into your TWiLight Menu++ folders.
        </p>
        <p>
          <Link to="/browse">Browse the ROM catalog →</Link>
        </p>
      </header>

      <section>
        <h2>What it does</h2>
        <ul>
          <li>Browse a console-organized catalog of legally distributable ROMs.</li>
          <li>Checks your SD card's free space before it downloads anything.</li>
          <li>
            Downloads directly from archive.org and verifies every file's MD5
            checksum.
          </li>
          <li>
            Places each ROM in the correct <code>sd:/roms/&lt;console&gt;/</code>{" "}
            folder so TWiLight Menu++ finds it immediately.
          </li>
        </ul>
      </section>

      <section>
        <h2>How you install it</h2>
        <p>
          The app ships as a <code>.cia</code>. You install it with FBI, the
          standard 3DS title manager, by scanning a QR code — no cables, no PC.
        </p>
        <p>
          <Link to="/install">Go to the install page →</Link>
        </p>
      </section>

      <section>
        <h2>Supported consoles</h2>
        <ul className="console-list" data-testid="console-list">
          {CONSOLE_LIST.map((c) => (
            <li key={c.id} data-console-id={c.id}>
              {c.label}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
