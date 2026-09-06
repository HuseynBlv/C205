import { AppShell } from "@/components/layout/app-shell";
import { MinimalShell } from "@/components/layout/minimal-shell";
import { PendingAuthorizationState } from "@/components/states/pending-authorization-state";
import { SuspendedAccountState } from "@/components/states/suspended-account-state";
import { EmailVerificationRequiredState } from "@/components/states/email-verification-required-state";
import { signOutAction } from "@/lib/auth/actions";
import type { Profile } from "@/lib/auth/dal";
import type { AppUser } from "@/lib/types";

function toAppUser(profile: Profile): AppUser {
  return {
    id: profile.id,
    fullName: profile.full_name,
    email: profile.email,
    role: profile.role,
    accountStatus: profile.account_status,
    createdAt: profile.created_at,
  };
}

/**
 * The real (Supabase-backed) counterpart to AccountStatusGate. Gate order
 * matters: email verification is checked before account_status, because a
 * PENDING-but-unverified account should be told to verify first — that's
 * the step actually in front of them — not "awaiting authorization", which
 * describes the step after it. Both gates are re-derived from a fresh
 * database read on every request (see getCurrentProfile); nothing here is
 * ever cached across requests or trusted from the session token.
 */
export function RealAccountStatusGate({
  profile,
  children,
}: {
  profile: Profile;
  children: React.ReactNode;
}) {
  if (!profile.email_verified_at) {
    return (
      <MinimalShell>
        <EmailVerificationRequiredState email={profile.email} onSignOut={signOutAction} />
      </MinimalShell>
    );
  }

  if (profile.account_status === "PENDING") {
    return (
      <MinimalShell>
        <PendingAuthorizationState onSignOut={signOutAction} />
      </MinimalShell>
    );
  }

  if (
    profile.account_status === "SUSPENDED" ||
    profile.account_status === "REJECTED" ||
    profile.account_status === "REMOVED"
  ) {
    return (
      <MinimalShell>
        <SuspendedAccountState status={profile.account_status} onSignOut={signOutAction} />
      </MinimalShell>
    );
  }

  return (
    <AppShell user={toAppUser(profile)} onSignOut={signOutAction}>
      {children}
    </AppShell>
  );
}
