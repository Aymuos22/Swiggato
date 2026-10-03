"use client";

import { BarChart3, History, Home, MapPin, Shield, WalletCards } from "lucide-react";

import { NavLink } from "@/components/nav-link";
import type { UserRole } from "@/lib/db/schema";

const navItems = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/compare", label: "Compare", icon: BarChart3 },
  { href: "/history", label: "History", icon: History },
  { href: "/addresses", label: "Addresses", icon: MapPin },
  { href: "/accounts", label: "Accounts", icon: WalletCards }
];

export function AppNav({ role }: { role: UserRole }) {
  return (
    <nav className="flex flex-wrap items-center gap-1">
      {navItems.map((item) => (
        <NavLink key={item.href} href={item.href} label={item.label} icon={item.icon} />
      ))}
      {role === "ADMIN" ? <NavLink href="/admin" label="Admin" icon={Shield} /> : null}
    </nav>
  );
}
