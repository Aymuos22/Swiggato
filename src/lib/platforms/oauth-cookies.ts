import "server-only";

import { NextResponse } from "next/server";

import { decrypt, encrypt } from "@/lib/security/encryption";

export type OAuthPending = {
  state: string;
  verifier: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  createdAt: string;
};

function cookieOptions(requestUrl: string) {
  const secure = new URL(requestUrl).protocol === "https:";
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: 15 * 60
  };
}

export function attachOAuthPendingCookie(
  response: NextResponse,
  cookieName: string,
  pending: OAuthPending,
  requestUrl: string
) {
  response.cookies.set(cookieName, encrypt(JSON.stringify(pending)), cookieOptions(requestUrl));
  return response;
}

export function readOAuthPendingCookie(
  cookieValue: string | undefined,
  expectedState: string | null
): OAuthPending | null {
  if (!cookieValue || !expectedState) {
    return null;
  }

  try {
    const pending = JSON.parse(decrypt(cookieValue)) as OAuthPending;
    if (
      !pending?.state ||
      !pending.verifier ||
      !pending.clientId ||
      !pending.redirectUri ||
      pending.state !== expectedState
    ) {
      return null;
    }
    return pending;
  } catch {
    return null;
  }
}

export function oauthLaunchHtml(platform: "Swiggy" | "Zomato", authorizeUrl: string) {
  const tips =
    platform === "Zomato"
      ? [
          "Phone OTP often fails on Zomato MCP (“Failed to send OTP”) — switch to email OTP on their login screen.",
          "Use Chrome or Safari only. Clear site data for mcp-server.zomato.com, then Start OAuth once.",
          "After OTP succeeds, Postman “complete” is not enough — copy the full oauth.pstmn.io URL.",
          "Paste that URL into Accounts → Finish Zomato connect."
        ]
      : [
          "Complete phone + OTP in the same browser tab.",
          "If OTP fails, retry in Chrome/Safari instead of an embedded browser."
        ];

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Connect ${platform}</title>
    <style>
      :root { color-scheme: light; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f6f3ee; color: #1f1a14; }
      .card { width: min(440px, calc(100vw - 2rem)); background: white; border: 1px solid #e7e0d6; border-radius: 16px; padding: 1.5rem; box-shadow: 0 10px 30px rgba(31,26,20,.06); }
      h1 { margin: 0 0 .5rem; font-size: 1.35rem; }
      p, li { color: #5b5248; font-size: .95rem; line-height: 1.45; }
      ul { padding-left: 1.1rem; margin: .75rem 0 1.25rem; }
      a.button, button {
        display: inline-flex; align-items: center; justify-content: center; width: 100%;
        border: 0; border-radius: 10px; padding: .85rem 1rem; background: #111; color: #fff;
        font-weight: 600; text-decoration: none; cursor: pointer;
      }
      .secondary { margin-top: .6rem; background: transparent; color: #111; border: 1px solid #d8d0c6; }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>Continue ${platform} login</h1>
      <p>This popup is ready. Continue to ${platform} for verification. Keep the Swiggato Accounts tab open.</p>
      <ul>
        ${tips.map((tip) => `<li>${tip}</li>`).join("")}
      </ul>
      <a class="button" id="continue" href="${authorizeUrl}">Continue to ${platform}</a>
      <button class="secondary" type="button" id="newtab">Open in new tab instead</button>
    </main>
    <script>
      const url = ${JSON.stringify(authorizeUrl)};
      const go = () => { window.location.href = url; };
      document.getElementById('continue')?.addEventListener('click', (event) => {
        event.preventDefault();
        go();
      });
      document.getElementById('newtab')?.addEventListener('click', () => {
        window.open(url, '_blank', 'noopener,noreferrer');
      });
      // Small delay so Set-Cookie from this response is committed before navigation.
      setTimeout(go, 500);
    </script>
  </body>
</html>`;
}
