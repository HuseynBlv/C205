import { notFound } from "next/navigation";
import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState, CalendarLoadingState } from "@/components/states/loading-state";
import { PendingAuthorizationState } from "@/components/states/pending-authorization-state";
import { SuspendedAccountState } from "@/components/states/suspended-account-state";
import { ReservationStatusBadge, AccountStatusBadge } from "@/components/status/status-badge";
import { useFixtures } from "@/lib/config";
import type { AccountStatus, ReservationStatus } from "@/lib/types";

const reservationStatuses: ReservationStatus[] = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"];
const accountStatuses: AccountStatus[] = ["PENDING", "ACTIVE", "REJECTED", "SUSPENDED", "REMOVED"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-b border-border pb-10">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function StatesGalleryPage() {
  if (!useFixtures) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-10">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Component &amp; state gallery</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Development-only route (404s when fixtures are disabled). Not linked
          from the app nav.
        </p>
      </div>

      <Section title="Status badges">
        <div className="flex flex-wrap gap-2">
          {reservationStatuses.map((s) => (
            <ReservationStatusBadge key={s} status={s} />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {accountStatuses.map((s) => (
            <AccountStatusBadge key={s} status={s} />
          ))}
        </div>
      </Section>

      <Section title="Empty state">
        <EmptyState
          icon={Inbox}
          title="No requests yet"
          description="Submit a request for C205 to see it appear here."
        />
      </Section>

      <Section title="Error state">
        <ErrorState />
      </Section>

      <Section title="Loading state">
        <LoadingState rows={2} />
      </Section>

      <Section title="Calendar loading state">
        <CalendarLoadingState />
      </Section>

      <Section title="Pending authorization">
        <div className="rounded-xl border border-border">
          <PendingAuthorizationState />
        </div>
      </Section>

      <Section title="Suspended / rejected / removed account">
        <div className="space-y-4">
          <div className="rounded-xl border border-border">
            <SuspendedAccountState status="SUSPENDED" />
          </div>
          <div className="rounded-xl border border-border">
            <SuspendedAccountState status="REJECTED" />
          </div>
          <div className="rounded-xl border border-border">
            <SuspendedAccountState status="REMOVED" />
          </div>
        </div>
      </Section>
    </div>
  );
}
