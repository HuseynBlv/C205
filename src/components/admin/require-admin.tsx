"use client";

import { ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/states/empty-state";
import { useFixtureSession } from "@/lib/fixtures/session-context";

/**
 * Client-side guard so admin screens never render for a USER fixture
 * session. This is a UX convenience only — the real authorization boundary
 * is enforced server-side (Postgres row-level security + server actions) in
 * the database/auth step, per "enforce permissions beyond the interface."
 */
export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user } = useFixtureSession();

  if (user.role !== "ADMIN") {
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
