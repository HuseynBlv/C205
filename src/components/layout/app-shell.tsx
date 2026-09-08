"use client";

import Link from "next/link";
import { BrandMark } from "@/components/layout/brand-mark";
import { SidebarNavGroup } from "@/components/layout/sidebar-nav";
import { UserMenu } from "@/components/layout/user-menu";
import { Topbar } from "@/components/layout/topbar";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { primaryNavItems, adminNavItems, navItemsForRole } from "@/lib/nav-config";
import type { AppUser } from "@/lib/types";

export function AppShell({
  user,
  onSignOut,
  children,
}: {
  user: AppUser;
  onSignOut?: () => void;
  children: React.ReactNode;
}) {
  const navItems = navItemsForRole(user.role);

  return (
    <div className="flex min-h-dvh bg-background">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="border-b border-sidebar-border px-4 py-4">
          <Link href="/" aria-label="Go to the C205 home page" className="block w-fit">
            <BrandMark tone="dark" />
          </Link>
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
          <SidebarNavGroup title="Workspace" items={primaryNavItems} />
          {user.role === "ADMIN" ? (
            <SidebarNavGroup title="Administration" items={adminNavItems} />
          ) : null}
        </div>
        <div className="border-t border-sidebar-border p-3">
          <UserMenu user={user} onSignOut={onSignOut} tone="dark" />
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <Topbar navItems={navItems} user={user} onSignOut={onSignOut} />
        <main className="flex-1 px-4 pb-20 pt-5 md:px-8 md:pb-10 md:pt-8">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
        <MobileBottomNav items={primaryNavItems} />
      </div>
    </div>
  );
}
