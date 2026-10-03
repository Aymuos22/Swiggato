"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { CircularLoader } from "@/components/ui/circular-loader";

function AppLoadingInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [label, setLabel] = useState("Loading…");

  useEffect(() => {
    setVisible(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | undefined;

    const show = (nextLabel = "Loading…") => {
      setLabel(nextLabel);
      setVisible(true);
      window.clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setVisible(false), 15000);
    };

    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const anchor = (event.target as Element | null)?.closest("a");
      if (!anchor?.href || anchor.target === "_blank" || anchor.hasAttribute("download")) {
        return;
      }

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) {
        return;
      }

      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }

      // OAuth start opens a popup from a button, not an anchor — skip API oauth noise.
      if (url.pathname.startsWith("/api/")) {
        return;
      }

      show("Loading…");
    };

    const onSubmit = (event: Event) => {
      const form = event.target as HTMLFormElement | null;
      if (!form || form.tagName !== "FORM" || form.dataset.noLoader === "true") {
        return;
      }
      show(form.dataset.loaderLabel || "Working…");
    };

    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit, true);

    return () => {
      window.clearTimeout(hideTimer);
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[hsl(40_28%_96%/0.92)] backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4">
        <CircularLoader size={64} strokeWidth={5} className="gap-0" />
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export function AppLoading() {
  return (
    <Suspense fallback={null}>
      <AppLoadingInner />
    </Suspense>
  );
}
