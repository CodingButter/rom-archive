import Link from "next/link";
import { ArrowRight, HardDriveDownload, ShieldCheck, FolderTree } from "lucide-react";

import { CONSOLE_LIST } from "@/lib/consoles";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const FEATURES = [
  {
    icon: HardDriveDownload,
    title: "Space-aware downloads",
    body: "Checks your SD card's free space before pulling anything, then downloads straight from archive.org.",
  },
  {
    icon: ShieldCheck,
    title: "Verified every time",
    body: "Every file's MD5 checksum is verified on download, so a corrupt ROM never lands on your card.",
  },
  {
    icon: FolderTree,
    title: "Sorted for TWiLight",
    body: "Each ROM is placed in the correct sd:/roms/<console>/ folder so TWiLight Menu++ finds it immediately.",
  },
];

export default function Home() {
  return (
    <main className="flex flex-col">
      {/* Hero */}
      <section className="border-border/60 relative overflow-hidden border-b">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
        <div className="from-primary/10 pointer-events-none absolute -top-40 left-1/2 h-80 w-[42rem] -translate-x-1/2 rounded-full bg-gradient-to-b to-transparent blur-3xl" />
        <div className="relative mx-auto flex max-w-4xl flex-col items-center gap-6 px-6 py-24 text-center sm:py-32">
          <Badge variant="secondary" className="gap-1.5 px-3 py-1 text-sm">
            <span className="bg-primary h-1.5 w-1.5 rounded-full" />
            Nintendo 3DS homebrew
          </Badge>
          <h1 className="text-5xl font-bold tracking-tight text-balance sm:text-6xl">
            Public-domain ROMs,{" "}
            <span className="text-primary">straight to your 3DS.</span>
          </h1>
          <p className="text-muted-foreground max-w-2xl text-lg text-pretty">
            ROM Archive downloads legally distributable ROMs from archive.org
            directly into your TWiLight Menu++ folders — space-checked, checksum-
            verified, and sorted by console.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="gap-2">
              <Link href="/browse">
                Browse the ROM catalog
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/install">Install the app</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto w-full max-w-5xl px-6 py-20">
        <div className="grid gap-6 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <Card key={title} className="bg-card/50">
              <CardContent className="flex flex-col gap-3 p-6">
                <span className="bg-primary/10 text-primary flex h-11 w-11 items-center justify-center rounded-lg">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {body}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Supported consoles */}
      <section className="border-border/60 border-t">
        <div className="mx-auto w-full max-w-5xl px-6 py-20">
          <div className="mb-8 flex flex-col gap-2 text-center">
            <h2 className="text-3xl font-semibold tracking-tight">
              Supported consoles
            </h2>
            <p className="text-muted-foreground">
              Full No-Intro sets across every system TWiLight Menu++ emulates.
            </p>
          </div>
          <ul
            className="flex flex-wrap justify-center gap-2.5"
            data-testid="console-list"
          >
            {CONSOLE_LIST.map((c) => (
              <li key={c.id} data-console-id={c.id}>
                <Badge
                  variant="outline"
                  className="border-border bg-card/50 hover:border-primary/50 hover:text-primary px-4 py-1.5 text-sm transition-colors"
                >
                  {c.label}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
