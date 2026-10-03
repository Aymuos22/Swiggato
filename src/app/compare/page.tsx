import Link from "next/link";
import { desc, eq } from "drizzle-orm";

import { AppShell } from "@/components/app-shell";
import { CompareForm } from "@/components/compare-form";
import { PageHeader } from "@/components/page-header";
import { PriceTable } from "@/components/price-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { unsaveRestaurantAction } from "@/lib/actions/restaurants";
import { requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { addresses, comparisons, platformAccounts, priceResults, savedRestaurants } from "@/lib/db/schema";

function modeLabel(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata) {
    return "Disconnected";
  }
  if (metadata.authType === "oauth_pkce") {
    return "OAuth";
  }
  if (metadata.authType === "mcp_token") {
    return "Token";
  }
  return "Connected";
}

export default async function ComparePage() {
  const session = await requireAuth();
  const groqConfigured = Boolean(process.env.GROQ_API_KEY);
  const [savedAddresses, accounts, saved] = await Promise.all([
    db
      .select()
      .from(addresses)
      .where(eq(addresses.userId, session.user.id))
      .orderBy(desc(addresses.isDefault), desc(addresses.createdAt)),
    db.select().from(platformAccounts).where(eq(platformAccounts.userId, session.user.id)),
    db
      .select()
      .from(savedRestaurants)
      .where(eq(savedRestaurants.userId, session.user.id))
      .orderBy(desc(savedRestaurants.createdAt))
      .limit(8)
  ]);

  const swiggy = accounts.find((account) => account.platform === "SWIGGY" && account.status === "CONNECTED");
  const zomato = accounts.find((account) => account.platform === "ZOMATO" && account.status === "CONNECTED");
  const bothReady = Boolean(swiggy && zomato);

  const [latest] = await db
    .select()
    .from(comparisons)
    .where(eq(comparisons.userId, session.user.id))
    .orderBy(desc(comparisons.createdAt))
    .limit(1);

  const latestRows = latest
    ? await db.select().from(priceResults).where(eq(priceResults.comparisonId, latest.id))
    : [];

  const latestWarning = (() => {
    const meta = latestRows[0]?.rawMetadata as { partialErrors?: unknown } | null | undefined;
    const errors = meta?.partialErrors;
    if (!Array.isArray(errors) || errors.length === 0) {
      return null;
    }
    return errors.map(String).join(" ");
  })();

  return (
    <AppShell role={session.user.role}>
      <div className="space-y-8">
        <PageHeader
          title="Compare"
          description="Describe what you want. We parse it, then pull live final prices from Swiggy and Zomato together."
        />

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={groqConfigured ? "success" : "danger"}>
            Groq {groqConfigured ? "ready" : "missing"}
          </Badge>
          <Badge variant={swiggy ? "success" : "muted"}>
            Swiggy {swiggy ? modeLabel(swiggy.metadata) : "offline"}
          </Badge>
          <Badge variant={zomato ? "success" : "muted"}>
            Zomato {zomato ? modeLabel(zomato.metadata) : "offline"}
          </Badge>
          {!bothReady ? (
            <Link href="/accounts" className="text-sm font-semibold text-primary">
              Connect both platforms →
            </Link>
          ) : null}
        </div>

        <section className="rounded-lg border border-border bg-card/85 p-6 shadow-panel sm:p-8">
          <div className="mb-6 max-w-2xl space-y-2">
            <h2 className="font-display text-2xl font-semibold tracking-tight">Ask for food</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Try “veg paneer butter masala from a good place under 400”.
            </p>
          </div>

          {!groqConfigured ? (
            <p className="mb-4 text-sm text-destructive">
              Add <code>GROQ_API_KEY</code> to your environment, then restart the app.
            </p>
          ) : null}

          {savedAddresses.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No addresses yet.{" "}
              <Link href="/addresses" className="font-semibold text-primary">
                Add one first
              </Link>
              .
            </p>
          ) : (
            <CompareForm
              ready={bothReady}
              groqConfigured={groqConfigured}
              addresses={savedAddresses.map((address) => ({
                id: address.id,
                label: address.isDefault ? `${address.label} (default)` : address.label
              }))}
            />
          )}
        </section>

        <PriceTable
          rows={latestRows}
          warning={latestWarning}
          emptyLabel="Run a search to see Swiggy vs Zomato final payable prices here."
        />

        {saved.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Saved restaurants</CardTitle>
              <CardDescription>Pinned from earlier comparisons.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {saved.map((restaurant) => (
                <div
                  key={restaurant.id}
                  className="flex items-center justify-between gap-3 border-b border-border/70 pb-3 text-sm last:border-0 last:pb-0"
                >
                  <div>
                    <p className="font-semibold">{restaurant.name}</p>
                    <p className="text-muted-foreground">
                      {restaurant.platform} · {restaurant.platformRestaurantId}
                    </p>
                  </div>
                  <form action={unsaveRestaurantAction}>
                    <input type="hidden" name="restaurantId" value={restaurant.id} />
                    <Button type="submit" variant="outline" className="h-9">
                      Remove
                    </Button>
                  </form>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}
