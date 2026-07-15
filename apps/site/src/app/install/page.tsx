import Link from "next/link";

import { CIA_URL } from "@/lib/cia";
import { QrCode } from "@/components/qr-code";
import { Card, CardContent } from "@/components/ui/card";

export default function InstallPage(): React.JSX.Element {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-16">
      <header className="flex flex-col gap-3">
        <h1 className="text-4xl font-bold tracking-tight">Install ROM Archive</h1>
        <p className="text-muted-foreground text-lg">
          Install the app with FBI&apos;s Remote Install — scan the QR code below.
        </p>
      </header>

      <Card>
        <CardContent className="flex flex-col items-center gap-4">
          <QrCode value={CIA_URL} />
          <p className="text-muted-foreground text-center text-sm break-all">
            <code>{CIA_URL}</code>
          </p>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-semibold">Steps</h2>
        <ol className="text-muted-foreground list-decimal space-y-2 pl-5">
          <li>Open FBI on your 3DS (requires custom firmware — see the note below).</li>
          <li>
            Choose <strong>Remote Install</strong> → <strong>Scan QR Code</strong>.
          </li>
          <li>Point your 3DS camera at the QR code above.</li>
          <li>FBI downloads the CIA and installs it. Launch it from your Home Menu.</li>
        </ol>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-semibold">Before you start</h2>
        <p className="text-muted-foreground">
          Installing unsigned CIAs requires a 3DS running custom firmware with
          signature patches. This is standard for homebrew and outside this
          app&apos;s control.
        </p>
      </section>

      <p>
        <Link className="text-primary underline" href="/">
          ← Back
        </Link>
      </p>
    </main>
  );
}
