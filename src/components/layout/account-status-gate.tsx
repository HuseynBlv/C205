"use client";

import { AppShell } from "@/components/layout/app-shell";
import { MinimalShell } from "@/components/layout/minimal-shell";
import { PendingAuthorizationState } from "@/components/states/pending-authorization-state";
import { SuspendedAccountState } from "@/components/states/suspended-account-state";
import { useFixtureSession } from "@/lib/fixtures/session-context";

/**
 * Renders the authenticated shell only for ACTIVE accounts. Every other
 * account status shows its dedicated blocking state instead — registration
 * and email verification alone never grant reservation access.
 */
export function AccountStatusGate({ children }: { children: React.ReactNode }) {
  const { user, setAccountStatus } = useFixtureSession();
  const signOut = () => setAccountStatus("ACTIVE");

  if (user.accountStatus === "PENDING") {
    return (
      <MinimalShell>
        <PendingAuthorizationState onSignOut={signOut} />
      </MinimalShell>
    );
  }
  if (
    user.accountStatus === "SUSPENDED" ||
    user.accountStatus === "REJECTED" ||
    user.accountStatus === "REMOVED"
  ) {
    return (
      <MinimalShell>
        <SuspendedAccountState status={user.accountStatus} onSignOut={signOut} />
      </MinimalShell>
    );
  }

  return <AppShell user={user} onSignOut={signOut}>{children}</AppShell>;
}
