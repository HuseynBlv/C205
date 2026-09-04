"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { getActiveHref, type NavItem } from "@/lib/nav-config";

export function MobileBottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname() ?? "";
  const activeHref = getActiveHref(pathname, items);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-backdrop-filter:bg-card/80 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-3">
        {items.map((item) => {
          const isActive = item.href === activeHref;
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium",
                  isActive ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
