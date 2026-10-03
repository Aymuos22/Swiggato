"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils/cn";

export function NavLink({
  href,
  label,
  icon: Icon,
  className
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  className?: string;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      prefetch={false}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors",
        active
          ? "bg-[hsl(18_95%_48%/0.1)] text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
        className
      )}
    >
      <Icon className={cn("h-4 w-4", active ? "text-primary" : "opacity-70")} />
      {label}
    </Link>
  );
}
