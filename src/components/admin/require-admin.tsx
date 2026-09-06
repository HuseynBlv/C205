"use client";

import { useContext } from "react";
import { ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/states/empty-state";
import { FixtureSessionContext } from "@/lib/fixtures/session-context";

/**
 * Renders `children` only for an admin. When `isAdmin` is passed (the real,
 * non-fixture path — computed server-side from the caller's actual profile,
 * never from client state), it's authoritative and the fixture context is
 * never touched. Without it (the fixture-preview path), this falls back to
 * the fixture role switcher. Either way, this is UX only — the real
 * authorization boundary is Postgres RLS and the SECURITY DEFINER
 * functions, which re-check on every request regardless of what this
 * component renders.
 */
export function RequireAdmin({
  children,
  isAdmin,
}: {
  children: React.ReactNode;
  isAdmin?: boolean;
}) {
  const fixtureSession = useContext(FixtureSessionContext);
  const resolvedIsAdmin = isAdmin ?? fixtureSession?.user.role === "ADMIN";

  if (!resolvedIsAdmin) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Administrator access required"
        description="This section is only available to USG administrators."
      />
    );
  }

  return <>{children}</>;
}
