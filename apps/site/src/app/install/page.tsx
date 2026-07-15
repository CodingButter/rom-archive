import Link from "next/link";
import { ArrowLeft, ScanLine, TriangleAlert } from "lucide-react";

import { CIA_URL } from "@/lib/cia";
import { QrCode } from "@/components/qr-code";
import { Card, CardContent } from "@/components/ui/card";

export default function InstallPage(): React.JSX.Element {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-16">
      <header className="flex flex-col gap-3">
        <span className="bg-primary/10 text-primary flex h-11 w-11 items-center justify-center rounded-lg">
          <ScanLine className="h-5 w-5" />
        </span>
        <h1 className="text-4xl font-bold tracking-tight">Install ROM Archive</h1>
        <p className="text-muted-foreground text-lg">
          Install the app with FBI&apos;s Remote Install — scan the QR code below.
        </p>
      </header>

      <Card className="overflow-hidden">
        <CardContent className="flex flex-col items-center gap-5 p-8">
          <QrCode value={CIA_URL} />
          <p className="text-muted-foreground text-center text-sm break-all">
            <code className="bg-muted rounded px-2 py-1 font-mono text-xs">
              {CIA_URL}
            </code>
          </p>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-semibold">Steps</h2>
        <ol className="flex flex-col gap-3">
          <li className="text-muted-foreground flex gap-3">
            <span className="bg-primary/10 text-primary flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
              1
            </span>
            Open FBI on your 3DS (requires custom firmware — see the note below).
          </li>
          <li className="text-muted-foreground flex gap-3">
            <span className="bg-primary/10 text-primary flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
              2
            </span>
            <span>
              Choose <strong className="text-foreground">Remote Install</strong> →{" "}
              <strong className="text-foreground">Scan QR Code</strong>.
            </span>
          </li>
          <li className="text-muted-foreground flex gap-3">
            <span className="bg-primary/10 text-primary flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
              3
            </span>
            Point your 3DS camera at the QR code above.
          </li>
          <li className="text-muted-foreground flex gap-3">
            <span className="bg-primary/10 text-primary flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
              4
            </span>
            FBI downloads the CIA and installs it. Launch it from your Home Menu.
          </li>
        </ol>
      </section>

      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="flex gap-3 p-5">
          <TriangleAlert className="text-destructive mt-0.5 h-5 w-5 shrink-0" />
          <div className="flex flex-col gap-1">
            <h2 className="font-semibold">Before you start</h2>
            <p className="text-muted-foreground text-sm">
              Installing unsigned CIAs requires a 3DS running custom firmware with
              signature patches. This is standard for homebrew and outside this
              app&apos;s control.
            </p>
          </div>
        </CardContent>
      </Card>

      <p>
        <Link
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
          href="/"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
      </p>
    </main>
  );
}
