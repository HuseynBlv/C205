import { redirect } from "next/navigation";
import { AccountStatusGate } from "@/components/layout/account-status-gate";
import { RealAccountStatusGate } from "@/components/layout/real-account-status-gate";
import { DevRoleSwitcher } from "@/components/layout/dev-role-switcher";
import { BackendNotConfiguredState } from "@/components/states/backend-not-configured-state";
import { MinimalShell } from "@/components/layout/minimal-shell";
import { FixtureSessionProvider } from "@/lib/fixtures/session-context";
import { useFixtures } from "@/lib/config";
import { getCurrentProfile } from "@/lib/auth/dal";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  if (useFixtures) {
    return (
      <FixtureSessionProvider>
        <AccountStatusGate>{children}</AccountStatusGate>
        <DevRoleSwitcher />
      </FixtureSessionProvider>
    );
  }

  const isConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  if (!isConfigured) {
    // Never fake a signed-in shell when there is nothing real behind it.
    return (
      <MinimalShell>
        <BackendNotConfiguredState />
      </MinimalShell>
    );
  }

  // A live database read, not a claim from the session token — this is what
  // makes a suspension (or a role change) take effect on the very next
  // request, without needing the client's token to expire or change.
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  return <RealAccountStatusGate profile={profile}>{children}</RealAccountStatusGate>;
}
