"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HardDrive, Database, Palette, Info } from "lucide-react";

import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/settings/equipment", label: "Equipment", icon: HardDrive },
  { href: "/settings/storage", label: "Storage & Data", icon: Database },
  { href: "/settings/appearance", label: "Appearance", icon: Palette },
  { href: "/settings/about", label: "About", icon: Info },
];

/** Fixed settings nav; the active section is derived from the path (FR-SET-1, SCR-016). */
export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-0.5 px-2 py-2">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-elevated font-medium text-foreground"
                : "text-muted-foreground hover:bg-elevated/60 hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
