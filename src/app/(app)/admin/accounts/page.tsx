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

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export default function AdminAccountsPage() {
  const accounts = useFixtures
    ? [fixturePendingUser, fixtureCurrentUser, fixtureSuspendedUser, fixtureAdminUser]
    : [];

  return (
    <RequireAdmin>
      <PageHeader
        title="Accounts"
        description="Authorize, reject, suspend, restore, or remove reservation access."
      />
      <PreviewNotice>
        Account actions are connected once Supabase Auth is wired up.
        Registration and email verification alone never grant reservation
        access — every account is authorized here first.
      </PreviewNotice>

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
                    <p className="truncate text-sm text-muted-foreground">{account.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <AccountStatusBadge status={account.accountStatus} />
                  {account.accountStatus === "PENDING" ? (
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
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </RequireAdmin>
  );
}
