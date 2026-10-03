import * as React from "react";

import { cn } from "@/lib/utils/cn";

type BadgeVariant = "default" | "muted" | "success" | "warning" | "danger";

const variants: Record<BadgeVariant, string> = {
  default: "bg-primary/12 text-primary",
  muted: "bg-muted text-muted-foreground",
  success: "bg-[hsl(168_42%_92%)] text-[hsl(175_55%_22%)]",
  warning: "bg-[hsl(36_90%_90%)] text-[hsl(28_70%_28%)]",
  danger: "bg-[hsl(352_80%_94%)] text-[hsl(352_70%_34%)]"
};

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em]",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
