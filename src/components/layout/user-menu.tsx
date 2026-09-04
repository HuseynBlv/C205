"use client";

import { LogOut, ShieldCheck, UserRound } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AppUser } from "@/lib/types";

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function UserMenu({ user, onSignOut }: { user: AppUser; onSignOut?: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-sidebar-accent/60"
        >
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
              {initials(user.fullName)}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">
              {user.fullName}
            </span>
            <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-medium text-foreground">{user.fullName}</p>
          <p className="text-xs text-muted-foreground">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <UserRound className="size-4" />
          Profile
        </DropdownMenuItem>
        {user.role === "ADMIN" ? (
          <DropdownMenuItem disabled>
            <ShieldCheck className="size-4" />
            Administrator
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onSignOut}>
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
