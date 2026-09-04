"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { BrandMark } from "@/components/layout/brand-mark";
import { NavList } from "@/components/layout/sidebar-nav";
import { UserMenu } from "@/components/layout/user-menu";
import type { NavItem } from "@/lib/nav-config";
import type { AppUser } from "@/lib/types";

export function MobileNavSheet({
  items,
  user,
  onSignOut,
}: {
  items: NavItem[];
  user: AppUser;
  onSignOut?: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="border-b border-border px-4 py-4">
          <SheetTitle asChild>
            <BrandMark />
          </SheetTitle>
        </SheetHeader>
        <div className="flex flex-1 flex-col justify-between overflow-y-auto p-3">
          <NavList items={items} onNavigate={() => setOpen(false)} />
          <div className="mt-4 border-t border-border pt-3">
            <UserMenu user={user} onSignOut={onSignOut} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
