"use client";

import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";

const startHref = {
  SWIGGY: "/api/platforms/swiggy/oauth/start",
  ZOMATO: "/api/platforms/zomato/oauth/start"
} as const;

export function OAuthStartButton({ platform }: { platform: "SWIGGY" | "ZOMATO" }) {
  const openOAuth = () => {
    const href = startHref[platform];
    const width = 520;
    const height = 760;
    const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
    const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
    const features = [
      "popup=yes",
      `width=${width}`,
      `height=${height}`,
      `left=${left}`,
      `top=${top}`,
      "resizable=yes",
      "scrollbars=yes"
    ].join(",");

    const popup = window.open(href, `${platform}_oauth`, features);
    if (!popup) {
      window.open(href, "_blank", "noopener,noreferrer");
    } else {
      popup.focus();
    }
  };

  return (
    <Button type="button" onClick={openOAuth} className="h-11">
      <ExternalLink className="h-4 w-4" />
      Start OAuth
    </Button>
  );
}
