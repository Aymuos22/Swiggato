import { desc, eq, inArray } from "drizzle-orm";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PriceTable } from "@/components/price-table";
import { requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { comparisons, priceResults } from "@/lib/db/schema";

export default async function HistoryPage() {
  const session = await requireAuth();
  const saved = await db
    .select()
    .from(comparisons)
    .where(eq(comparisons.userId, session.user.id))
    .orderBy(desc(comparisons.createdAt))
    .limit(20);

  const resultRows =
    saved.length > 0
      ? await db
          .select()
          .from(priceResults)
          .where(inArray(priceResults.comparisonId, saved.map((item) => item.id)))
      : [];

  return (
    <AppShell role={session.user.role}>
      <div className="space-y-8">
        <PageHeader
          title="History"
          description="Your saved comparisons, newest first."
        />
        {saved.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card/50 px-6 py-10 text-sm text-muted-foreground">
            No comparisons yet. Run one from Compare.
          </div>
        ) : (
          saved.map((comparison) => (
            <section key={comparison.id} className="rounded-lg border border-border bg-card/85 shadow-panel">
              <div className="border-b border-border px-6 py-5">
                <h2 className="font-display text-2xl font-semibold tracking-tight">{comparison.searchQuery}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{comparison.createdAt.toLocaleString()}</p>
              </div>
              <div className="p-6">
                <PriceTable rows={resultRows.filter((row) => row.comparisonId === comparison.id)} framed={false} />
              </div>
            </section>
          ))
        )}
      </div>
    </AppShell>
  );
}
