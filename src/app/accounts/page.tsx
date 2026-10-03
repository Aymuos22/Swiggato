import { eq } from "drizzle-orm";
import { CheckCircle2, Plug, Unplug } from "lucide-react";

import { AccountsOAuthBridge } from "@/components/accounts-oauth-bridge";
import { AppShell } from "@/components/app-shell";
import { OAuthStartButton } from "@/components/oauth-start-button";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  completeZomatoOAuthPasteAction,
  connectZomatoMcpAction,
  disconnectPlatformAction
} from "@/lib/actions/platforms";
import { requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { platformAccounts, type Platform } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const platformCopy: Record<Platform, { title: string; description: string }> = {
  SWIGGY: {
    title: "Swiggy",
    description: "Connect with OAuth so dual natural-language search can quote live Swiggy prices."
  },
  ZOMATO: {
    title: "Zomato",
    description:
      "After OAuth, save at least one delivery address in the Zomato app for this city. Compare needs that saved address for live final prices."
  }
};

const swiggyMessages: Record<string, string> = {
  connected: "Swiggy is connected in Swiggato.",
  token_failed: "Swiggy token exchange failed. Try OAuth again.",
  invalid_callback: "Swiggy OAuth callback was invalid or expired. Start OAuth again.",
  registration_failed: "Swiggy dynamic client registration failed.",
  missing_client: "Swiggy did not return a client id."
};

const zomatoMessages: Record<string, string> = {
  connected: "Zomato is connected in Swiggato.",
  token_failed:
    "Zomato rejected that auth code (used/expired). Click Start OAuth once, finish email OTP, then paste the new Postman URL immediately.",
  invalid_callback:
    "Could not match that callback to your Swiggato OAuth session. Click Start OAuth again, finish OTP, then paste the new URL.",
  registration_failed: "Zomato registration failed. Ask them to allowlist your redirect URI.",
  missing_client: "Zomato did not return a client id.",
  mcp_disabled: "Set ZOMATO_MCP_ENABLED=true to use a real static MCP access token.",
  missing_token: "Set ZOMATO_MCP_ACCESS_TOKEN in the server environment.",
  invalid_paste: "Could not read code/state from that paste. Copy the full Postman callback URL and try again.",
  otp_cookies:
    "Zomato OTP needs browser cookies. Retry Start OAuth in Chrome/Safari, not Cursor Simple Browser."
};

function connectionMode(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata) {
    return null;
  }
  if (metadata.authType === "oauth_pkce") {
    return "OAuth";
  }
  if (metadata.authType === "mcp_token") {
    return "Token";
  }
  if (metadata.pendingOAuth) {
    return "Awaiting paste";
  }
  return null;
}

export default async function AccountsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAuth();
  const params = (await searchParams) ?? {};
  const swiggyStatus = typeof params.swiggy === "string" ? params.swiggy : undefined;
  const zomatoStatus = typeof params.zomato === "string" ? params.zomato : undefined;
  const zomatoMcpEnabled = process.env.ZOMATO_MCP_ENABLED === "true";
  const accounts = await db
    .select()
    .from(platformAccounts)
    .where(eq(platformAccounts.userId, session.user.id));

  return (
    <AppShell role={session.user.role}>
      <AccountsOAuthBridge swiggyStatus={swiggyStatus} zomatoStatus={zomatoStatus} />
      <div className="space-y-8">
        <PageHeader
          title="Accounts"
          description="Connect both platforms. OAuth opens in a popup so you can stay on this page."
        />

        {swiggyStatus && swiggyMessages[swiggyStatus] ? (
          <p
            className={`rounded-md border px-4 py-3 text-sm ${
              swiggyStatus === "connected"
                ? "border-[hsl(168_42%_80%)] bg-[hsl(168_42%_92%)] text-[hsl(175_55%_22%)]"
                : "border-destructive/30 bg-[hsl(352_80%_96%)] text-destructive"
            }`}
          >
            {swiggyMessages[swiggyStatus]}
          </p>
        ) : null}
        {zomatoStatus && zomatoMessages[zomatoStatus] ? (
          <p
            className={`rounded-md border px-4 py-3 text-sm ${
              zomatoStatus === "connected"
                ? "border-[hsl(168_42%_80%)] bg-[hsl(168_42%_92%)] text-[hsl(175_55%_22%)]"
                : "border-destructive/30 bg-[hsl(352_80%_96%)] text-destructive"
            }`}
          >
            {zomatoMessages[zomatoStatus]}
          </p>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          {(["SWIGGY", "ZOMATO"] as const).map((platform) => {
            const account = accounts.find((item) => item.platform === platform);
            const connected = account?.status === "CONNECTED";
            const mode = connectionMode(account?.metadata);
            const awaitingPaste = Boolean(account?.metadata?.pendingOAuth) && !connected;

            return (
              <section key={platform} className="rounded-lg border border-border bg-card/85 p-6 shadow-panel">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-3xl font-semibold tracking-tight">
                      {platformCopy[platform].title}
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {platformCopy[platform].description}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {mode ? <Badge variant="muted">{mode}</Badge> : null}
                    <Badge variant={connected ? "success" : awaitingPaste ? "warning" : "muted"}>
                      {connected ? "CONNECTED" : awaitingPaste ? "PASTE URL" : account?.status ?? "DISCONNECTED"}
                    </Badge>
                  </div>
                </div>

                {connected ? (
                  <div className="mb-4 flex items-center gap-2 rounded-md border border-[hsl(168_42%_80%)] bg-[hsl(168_42%_92%)] px-3 py-2 text-sm font-medium text-[hsl(175_55%_22%)]">
                    <CheckCircle2 className="h-4 w-4" />
                    Connected in Swiggato
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <OAuthStartButton platform={platform} />
                  {platform === "ZOMATO" && zomatoMcpEnabled ? (
                    <form action={connectZomatoMcpAction} data-loader-label="Connecting token…">
                      <Button type="submit" variant="secondary">
                        <Plug className="h-4 w-4" />
                        Connect Token
                      </Button>
                    </form>
                  ) : null}
                  <form action={disconnectPlatformAction} data-loader-label="Disconnecting…">
                    <input type="hidden" name="platform" value={platform} />
                    <Button type="submit" variant="outline" disabled={!account || account.status === "DISCONNECTED"}>
                      <Unplug className="h-4 w-4" />
                      Disconnect
                    </Button>
                  </form>
                </div>

                {platform === "ZOMATO" && !connected ? (
                  <form
                    action={completeZomatoOAuthPasteAction}
                    data-loader-label="Finishing Zomato connect…"
                    className="mt-5 space-y-2 rounded-md border border-primary/30 bg-primary/5 p-4"
                  >
                    <p className="text-sm font-semibold text-foreground">If phone OTP fails</p>
                    <ol className="list-decimal space-y-1 pl-4 text-xs leading-relaxed text-muted-foreground">
                      <li>Close all Zomato MCP tabs.</li>
                      <li>
                        In Chrome/Safari → site settings for <code>mcp-server.zomato.com</code> → clear cookies/data.
                      </li>
                      <li>Click Start OAuth once, then choose <strong>email OTP</strong> (not phone).</li>
                      <li>After login, copy the full Postman URL and paste below.</li>
                    </ol>
                    <p className="text-sm font-semibold text-foreground">Step 2 — paste callback URL</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      After OTP, Postman may say authentication complete. Copy the full URL
                      (`https://oauth.pstmn.io/v1/callback?code=...&state=...`) and paste it here.
                    </p>
                    <label htmlFor="zomato-callback" className="text-sm font-semibold">
                      Paste Postman callback URL
                    </label>
                    <Textarea
                      id="zomato-callback"
                      name="callback"
                      rows={3}
                      required
                      placeholder="https://oauth.pstmn.io/v1/callback?code=...&state=..."
                    />
                    <Button type="submit">Finish Zomato connect</Button>
                  </form>
                ) : null}
              </section>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
