import Link from "next/link";

import { CONSOLE_LIST } from "@/lib/consoles";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-16">
      <header className="flex flex-col gap-4">
        <h1 className="text-4xl font-bold tracking-tight">ROM Archive</h1>
        <p className="text-muted-foreground text-lg">
          A Nintendo 3DS homebrew app that downloads public-domain ROMs from
          archive.org straight into your TWiLight Menu++ folders.
        </p>
        <div className="flex gap-3">
          <Button asChild>
            <Link href="/browse">Browse the ROM catalog</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/install">Install the app</Link>
          </Button>
        </div>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-semibold">What it does</h2>
        <ul className="text-muted-foreground list-disc space-y-2 pl-5">
          <li>Browse a console-organized catalog of legally distributable ROMs.</li>
          <li>Checks your SD card&apos;s free space before it downloads anything.</li>
          <li>
            Downloads directly from archive.org and verifies every file&apos;s MD5
            checksum.
          </li>
          <li>
            Places each ROM in the correct <code>sd:/roms/&lt;console&gt;/</code> folder
            so TWiLight Menu++ finds it immediately.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-semibold">Supported consoles</h2>
        <ul
          className="flex flex-wrap gap-2"
          data-testid="console-list"
        >
          {CONSOLE_LIST.map((c) => (
            <li key={c.id} data-console-id={c.id}>
              <Badge variant="secondary">{c.label}</Badge>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
