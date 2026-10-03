import Link from "next/link";
import { eq, sql } from "drizzle-orm";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { addresses, comparisons, platformAccounts } from "@/lib/db/schema";

export default async function DashboardPage() {
  const session = await requireAuth();
  const [addressCount, comparisonCount, accounts] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(addresses)
      .where(eq(addresses.userId, session.user.id)),
    db
      .select({ count: sql<number>`count(*)` })
      .from(comparisons)
      .where(eq(comparisons.userId, session.user.id)),
    db.select().from(platformAccounts).where(eq(platformAccounts.userId, session.user.id))
  ]);

  const connected = accounts.filter((account) => account.status === "CONNECTED");

  return (
    <AppShell role={session.user.role}>
      <div className="space-y-10">
        <PageHeader
          title={`Hey ${session.user.name?.split(" ")[0] || "there"}`}
          description="Compare final payable food prices across Swiggy and Zomato from one search."
          action={
            <Link href="/compare">
              <Button className="h-12 px-6 text-base">Start comparing</Button>
            </Link>
          }
        />

        <section className="grid gap-px overflow-hidden rounded-lg border border-border bg-border shadow-panel sm:grid-cols-3">
          <div className="bg-card/90 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Addresses</p>
            <p className="mt-3 font-display text-5xl font-semibold tracking-tight">{addressCount[0]?.count ?? 0}</p>
          </div>
          <div className="bg-card/90 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Platforms</p>
            <p className="mt-3 font-display text-5xl font-semibold tracking-tight">{connected.length}/2</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(["SWIGGY", "ZOMATO"] as const).map((platform) => {
                const account = accounts.find((item) => item.platform === platform && item.status === "CONNECTED");
                return (
                  <Badge key={platform} variant={account ? "success" : "muted"}>
                    {platform} {account ? "on" : "off"}
                  </Badge>
                );
              })}
            </div>
          </div>
          <div className="bg-card/90 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Comparisons</p>
            <p className="mt-3 font-display text-5xl font-semibold tracking-tight">
              {comparisonCount[0]?.count ?? 0}
            </p>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <Link
            href="/accounts"
            className="group rounded-lg border border-border bg-card/80 p-6 shadow-panel transition-transform duration-200 hover:-translate-y-0.5"
          >
            <p className="font-display text-2xl font-semibold tracking-tight">Connect platforms</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Link Swiggy and Zomato MCP so live dual search can run.
            </p>
            <span className="mt-5 inline-flex text-sm font-semibold text-primary">Open accounts →</span>
          </Link>
          <Link
            href="/addresses"
            className="group rounded-lg border border-border bg-card/80 p-6 shadow-panel transition-transform duration-200 hover:-translate-y-0.5"
          >
            <p className="font-display text-2xl font-semibold tracking-tight">Set delivery context</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Save the address you want price quotes against.
            </p>
            <span className="mt-5 inline-flex text-sm font-semibold text-primary">Manage addresses →</span>
          </Link>
        </section>
      </div>
    </AppShell>
  );
}
