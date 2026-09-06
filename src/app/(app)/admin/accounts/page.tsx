import { Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { RequireAdmin } from "@/components/admin/require-admin";
import { PreviewNotice } from "@/components/shared/preview-notice";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { EmptyState } from "@/components/states/empty-state";
import { AccountStatusBadge } from "@/components/status/status-badge";
import {
  fixtureAdminUser,
  fixtureCurrentUser,
  fixturePendingUser,
  fixtureSuspendedUser,
} from "@/lib/fixtures/data";
import { useFixtures } from "@/lib/config";
import { getCurrentProfile, isActiveAdmin, type Profile } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import {
  authorizeAccountAction,
  rejectAccountAction,
  removeAccountAction,
  restoreAccountAction,
  suspendAccountAction,
} from "@/lib/admin/actions";
import type { AccountStatus } from "@/lib/types";

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

type AccountRow = {
  id: string;
  fullName: string;
  email: string;
  accountStatus: AccountStatus;
  emailVerified: boolean;
};

function fromProfile(p: Profile): AccountRow {
  return {
    id: p.id,
    fullName: p.full_name,
    email: p.email,
    accountStatus: p.account_status,
    emailVerified: p.email_verified_at !== null,
  };
}

function fromFixture(u: { id: string; fullName: string; email: string; accountStatus: AccountStatus }): AccountRow {
  return { ...u, emailVerified: true };
}

/** One admin action, submitted as its own tiny form — no client JS needed. */
function ActionButton({
  action,
  accountId,
  label,
  variant = "outline",
}: {
  action: (id: string) => Promise<{ ok: boolean; error?: string }>;
  accountId: string;
  label: string;
  variant?: "outline" | "default";
}) {
  return (
    <form action={async () => { "use server"; await action(accountId); }}>
      <Button size="sm" variant={variant} type="submit">
        {label}
      </Button>
    </form>
  );
}

export default async function AdminAccountsPage() {
  const profile = useFixtures ? null : await getCurrentProfile();
  const admin = useFixtures ? undefined : isActiveAdmin(profile);

  let accounts: AccountRow[] = [];
  if (useFixtures) {
    accounts = [fixturePendingUser, fixtureCurrentUser, fixtureSuspendedUser, fixtureAdminUser].map(fromFixture);
  } else if (admin) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: true });
    accounts = (data ?? []).map(fromProfile);
  }

  return (
    <RequireAdmin isAdmin={admin}>
      <PageHeader
        title="Accounts"
        description="Authorize, reject, suspend, restore, or remove reservation access."
      />
      {useFixtures ? (
        <PreviewNotice>
          Account actions are connected once Supabase Auth is wired up.
          Registration and email verification alone never grant reservation
          access — every account is authorized here first.
        </PreviewNotice>
      ) : null}

      {accounts.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No accounts yet"
          description="Accounts appear here once students register and verify their email."
        />
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => (
            <Card key={account.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="size-9">
                    <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                      {initials(account.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {account.fullName}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {account.email}
                      {!account.emailVerified ? " · email not verified yet" : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <AccountStatusBadge status={account.accountStatus} />
                  {useFixtures ? (
                    account.accountStatus === "PENDING" ? (
                      <>
                        <Button size="sm" variant="outline" disabled>
                          Reject
                        </Button>
                        <Button size="sm" disabled>
                          Authorize
                        </Button>
                      </>
                    ) : account.accountStatus === "ACTIVE" ? (
                      <Button size="sm" variant="outline" disabled>
                        Suspend
                      </Button>
                    ) : account.accountStatus === "SUSPENDED" ? (
                      <Button size="sm" variant="outline" disabled>
                        Restore
                      </Button>
                    ) : null
                  ) : (
                    <>
                      {account.accountStatus === "PENDING" ? (
                        <>
                          <ActionButton action={rejectAccountAction} accountId={account.id} label="Reject" />
                          <ActionButton action={authorizeAccountAction} accountId={account.id} label="Authorize" variant="default" />
                        </>
                      ) : null}
                      {account.accountStatus === "ACTIVE" ? (
                        <ActionButton action={suspendAccountAction} accountId={account.id} label="Suspend" />
                      ) : null}
                      {account.accountStatus === "SUSPENDED" ? (
                        <>
                          <ActionButton action={restoreAccountAction} accountId={account.id} label="Restore" />
                          <ActionButton action={removeAccountAction} accountId={account.id} label="Remove" />
                        </>
                      ) : null}
                      {account.accountStatus === "REJECTED" ? (
                        <ActionButton action={authorizeAccountAction} accountId={account.id} label="Authorize" variant="default" />
                      ) : null}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </RequireAdmin>
  );
}
