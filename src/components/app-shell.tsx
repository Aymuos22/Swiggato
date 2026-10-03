import Link from "next/link";

import { logoutAction } from "@/lib/actions/auth";
import type { UserRole } from "@/lib/db/schema";
import { AppNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";

export function AppShell({
  children,
  role
}: {
  children: React.ReactNode;
  role: UserRole;
}) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-[hsl(40_28%_96%/0.78)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <Link href="/dashboard" prefetch={false} className="group inline-flex items-baseline gap-2">
            <span className="font-display text-3xl font-semibold tracking-tight text-foreground transition-colors group-hover:text-primary">
              Swiggato
            </span>
            <span className="hidden text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:inline">
              live dual MCP
            </span>
          </Link>
          <AppNav role={role} />
          <form action={logoutAction}>
            <Button variant="outline" type="submit" className="h-10 px-3">
              Log out
            </Button>
          </form>
        </div>
      </header>
      <main className="page-enter mx-auto max-w-6xl px-4 py-10">{children}</main>
    </div>
  );
}
