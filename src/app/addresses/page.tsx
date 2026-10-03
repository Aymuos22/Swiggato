import { desc, eq } from "drizzle-orm";
import { Check, Trash2 } from "lucide-react";

import { AddressForm } from "@/components/address-form";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deleteAddressAction, setDefaultAddressAction } from "@/lib/actions/addresses";
import { requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { addresses } from "@/lib/db/schema";

export default async function AddressesPage() {
  const session = await requireAuth();
  const saved = await db
    .select()
    .from(addresses)
    .where(eq(addresses.userId, session.user.id))
    .orderBy(desc(addresses.isDefault), desc(addresses.createdAt));

  return (
    <AppShell role={session.user.role}>
      <div className="space-y-8">
        <PageHeader
          title="Addresses"
          description="Delivery context for live Swiggy and Zomato quotes."
        />

        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <section className="rounded-lg border border-border bg-card/85 p-6 shadow-panel">
            <h2 className="font-display text-2xl font-semibold tracking-tight">Add address</h2>
            <p className="mt-2 mb-5 text-sm leading-relaxed text-muted-foreground">
              Quotes use the connected platform address that best matches this text.
            </p>
            <AddressForm />
          </section>

          <div className="space-y-4">
            {saved.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-card/50 px-6 py-10 text-sm text-muted-foreground">
                No addresses saved yet.
              </div>
            ) : (
              saved.map((address) => (
                <section key={address.id} className="rounded-lg border border-border bg-card/85 p-6 shadow-panel">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-display text-xl font-semibold tracking-tight">{address.label}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{address.address}</p>
                    </div>
                    {address.isDefault ? <Badge variant="success">Default</Badge> : null}
                  </div>
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                    <span>
                      {address.latitude}, {address.longitude}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {!address.isDefault ? (
                        <form action={setDefaultAddressAction}>
                          <input type="hidden" name="addressId" value={address.id} />
                          <Button type="submit" variant="outline" className="h-9">
                            <Check className="h-4 w-4" />
                            Set default
                          </Button>
                        </form>
                      ) : null}
                      <form action={deleteAddressAction}>
                        <input type="hidden" name="addressId" value={address.id} />
                        <Button type="submit" variant="outline" className="h-9">
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      </form>
                    </div>
                  </div>
                </section>
              ))
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
