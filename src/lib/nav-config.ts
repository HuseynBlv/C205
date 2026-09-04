import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  ClipboardList,
  DoorOpen,
  ListChecks,
  Settings,
  SquarePlus,
  Users,
} from "lucide-react";
import type { UserRole } from "@/lib/types";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Short description shown in the mobile nav sheet. */
  description?: string;
}

export const primaryNavItems: NavItem[] = [
  {
    label: "Calendar",
    href: "/calendar",
    icon: CalendarDays,
    description: "View room availability",
  },
  {
    label: "Request C205",
    href: "/requests/new",
    icon: SquarePlus,
    description: "Submit a new room request",
  },
  {
    label: "My Requests",
    href: "/requests",
    icon: ClipboardList,
    description: "Track pending and past requests",
  },
];

export const adminNavItems: NavItem[] = [
  {
    label: "Reservations",
    href: "/admin/reservations",
    icon: ListChecks,
    description: "Review, approve, or reject requests",
  },
  {
    label: "Availability",
    href: "/admin/availability",
    icon: DoorOpen,
    description: "Publish open hours and block dates",
  },
  {
    label: "Accounts",
    href: "/admin/accounts",
    icon: Users,
    description: "Authorize and manage account access",
  },
  {
    label: "Settings",
    href: "/admin/settings",
    icon: Settings,
    description: "USG notification email and overrides",
  },
];

export function navItemsForRole(role: UserRole): NavItem[] {
  return role === "ADMIN" ? [...primaryNavItems, ...adminNavItems] : primaryNavItems;
}

/**
 * The single longest matching href among `items`, so a parent route (e.g.
 * "/requests") never lights up alongside a more specific sibling (e.g.
 * "/requests/new").
 */
export function getActiveHref(pathname: string, items: NavItem[]) {
  return items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}
