import Link from "next/link";
import { UsersRound } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { requireAdmin } from "@/lib/auth/session";

export default async function AdminPage() {
  const session = await requireAdmin();

  return (
    <AppShell role={session.user.role}>
      <div className="space-y-8">
        <PageHeader
          title="Admin"
          description="Administrative views never expose platform secrets."
        />
        <Link
          href="/admin/users"
          className="group block rounded-lg border border-border bg-card/85 p-6 shadow-panel transition-transform duration-200 hover:-translate-y-0.5"
        >
          <div className="flex items-center gap-3">
            <UsersRound className="h-5 w-5 text-primary" />
            <h2 className="font-display text-2xl font-semibold tracking-tight">Users</h2>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            View users, phone numbers, roles, logins, and connected platforms.
          </p>
          <span className="mt-5 inline-flex text-sm font-semibold text-primary">Open user table →</span>
        </Link>
      </div>
    </AppShell>
  );
}
