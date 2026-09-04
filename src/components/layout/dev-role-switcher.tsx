"use client";

import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useFixtureSession } from "@/lib/fixtures/session-context";
import type { AccountStatus, UserRole } from "@/lib/types";

const roles: UserRole[] = ["USER", "ADMIN"];
const statuses: AccountStatus[] = ["ACTIVE", "PENDING", "SUSPENDED", "REJECTED", "REMOVED"];

/**
 * Development-only control panel for previewing every role and
 * account-status combination without a real backend. Rendered exclusively
 * when fixtures are enabled (see src/lib/config.ts) — compiled out of any
 * production build path.
 */
export function DevRoleSwitcher() {
  const { role, accountStatus, setRole, setAccountStatus } = useFixtureSession();
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {open ? (
        <div className="mb-2 w-64 rounded-xl border border-border bg-card p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <FlaskConical className="size-3.5 text-primary" />
              Fixture preview
            </p>
          </div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Role
          </p>
          <div className="mb-3 flex gap-1.5">
            {roles.map((r) => (
              <Button
                key={r}
                size="sm"
                variant={role === r ? "default" : "outline"}
                className="h-7 flex-1 px-2 text-xs"
                onClick={() => setRole(r)}
              >
                {r}
              </Button>
            ))}
          </div>
          <Separator className="mb-3" />
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Account status
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {statuses.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={accountStatus === s ? "default" : "outline"}
                className="h-7 px-2 text-[11px]"
                onClick={() => setAccountStatus(s)}
              >
                {s}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      <Button
        size="icon"
        className="size-10 rounded-full shadow-lg"
        variant={open ? "secondary" : "default"}
        onClick={() => setOpen((v) => !v)}
        aria-label="Toggle fixture preview controls"
      >
        <FlaskConical className="size-4" />
      </Button>
    </div>
  );
}
