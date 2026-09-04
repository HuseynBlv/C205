import { AccountStatusGate } from "@/components/layout/account-status-gate";
import { DevRoleSwitcher } from "@/components/layout/dev-role-switcher";
import { BackendNotConfiguredState } from "@/components/states/backend-not-configured-state";
import { MinimalShell } from "@/components/layout/minimal-shell";
import { FixtureSessionProvider } from "@/lib/fixtures/session-context";
import { useFixtures } from "@/lib/config";

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  if (!useFixtures) {
    // Auth + database wiring lands in a follow-up step. Never fake a signed-in
    // shell when there is nothing real behind it.
    return (
      <MinimalShell>
        <BackendNotConfiguredState />
      </MinimalShell>
    );
  }

  return (
    <FixtureSessionProvider>
      <AccountStatusGate>{children}</AccountStatusGate>
      <DevRoleSwitcher />
    </FixtureSessionProvider>
  );
}
