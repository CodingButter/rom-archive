import Link from "next/link";
import { Gamepad2 } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";

function NavBar() {
  return (
    <header className="border-border/60 bg-background/80 sticky top-0 z-40 border-b backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
        <Link
          href="/"
          className="group flex items-center gap-2.5 font-display text-lg font-bold tracking-tight"
        >
          <span className="bg-primary/15 text-primary ring-primary/20 flex h-8 w-8 items-center justify-center rounded-lg ring-1 transition-colors group-hover:bg-primary/25">
            <Gamepad2 className="h-5 w-5" />
          </span>
          ROM Archive
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/browse"
            className="text-muted-foreground hover:text-foreground rounded-md px-3 py-2 text-sm font-medium transition-colors"
          >
            Browse
          </Link>
          <Link
            href="/install"
            className="text-muted-foreground hover:text-foreground rounded-md px-3 py-2 text-sm font-medium transition-colors"
          >
            Install
          </Link>
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-border/60 mt-auto border-t">
      <div className="text-muted-foreground mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-8 text-sm sm:flex-row">
        <p className="flex items-center gap-2">
          <Gamepad2 className="text-primary h-4 w-4" />
          ROM Archive — public-domain ROMs for your 3DS.
        </p>
        <p>
          Sourced from{" "}
          <a
            href="https://archive.org"
            target="_blank"
            rel="noreferrer noopener"
            className="hover:text-foreground underline underline-offset-4"
          >
            archive.org
          </a>
        </p>
      </div>
    </footer>
  );
}

export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <NavBar />
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  );
}
