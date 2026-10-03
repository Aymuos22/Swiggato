"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** When OAuth finishes inside a popup, refresh Accounts in the opener and close the popup. */
export function AccountsOAuthBridge({
  swiggyStatus,
  zomatoStatus
}: {
  swiggyStatus?: string;
  zomatoStatus?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const connected = swiggyStatus === "connected" || zomatoStatus === "connected";
    if (!connected) {
      return;
    }

    if (window.opener && !window.opener.closed) {
      try {
        window.opener.focus();
        window.opener.location.assign("/accounts?refresh=1");
      } catch {
        // cross-origin opener — ignore
      }
      window.close();
      return;
    }

    router.refresh();
  }, [router, swiggyStatus, zomatoStatus]);

  return null;
}
