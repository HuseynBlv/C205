"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { getActiveHref, type NavItem } from "@/lib/nav-config";

export function NavList({
  items,
  onNavigate,
  className,
  tone = "sidebar",
}: {
  items: NavItem[];
  onNavigate?: () => void;
  className?: string;
  /** "sidebar" (default) for the dark navy desktop sidebar, whose
   * `--sidebar-foreground` tokens are near-white text tuned for that dark
   * background. "surface" for any other container (e.g. the mobile nav
   * sheet, a plain popover-toned surface) — using the sidebar tokens
   * there rendered near-invisible light-gray text on white. */
  tone?: "sidebar" | "surface";
}) {
  const pathname = usePathname() ?? "";
  const activeHref = getActiveHref(pathname, items);
  const isSurface = tone === "surface";

  return (
    <nav className={cn("flex flex-col gap-1", className)}>
      {items.map((item) => {
        const isActive = item.href === activeHref;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? isSurface
                  ? "bg-accent text-accent-foreground"
                  : "bg-sidebar-accent text-sidebar-accent-foreground"
                : isSurface
                  ? "text-foreground/80 hover:bg-accent/60 hover:text-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon
              className={cn(
                "size-4.5 shrink-0",
                isActive
                  ? isSurface
                    ? "text-accent-foreground"
                    : "text-sidebar-accent-foreground"
                  : isSurface
                    ? "text-muted-foreground group-hover:text-accent-foreground"
                    : "text-sidebar-foreground/60 group-hover:text-sidebar-accent-foreground",
              )}
              aria-hidden="true"
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SidebarNavGroup({ title, items }: { title: string; items: NavItem[] }) {
  return (
    <div className="space-y-2">
      <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
        {title}
      </p>
      <NavList items={items} />
    </div>
  );
}
