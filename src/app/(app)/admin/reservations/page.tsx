import { ListChecks } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { RequireAdmin } from "@/components/admin/require-admin";
import { PreviewNotice } from "@/components/shared/preview-notice";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/states/empty-state";
import { ReservationStatusBadge } from "@/components/status/status-badge";
import { fixtureReservations } from "@/lib/fixtures/data";
import { useFixtures, ROOM_TIMEZONE } from "@/lib/config";

function formatRange(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const dateFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: ROOM_TIMEZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: ROOM_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
  });
  return `${dateFmt.format(start)} · ${timeFmt.format(start)}–${timeFmt.format(end)}`;
}

export default function AdminReservationsPage() {
  const requests = useFixtures ? fixtureReservations : [];
  const pending = requests.filter((r) => r.status === "PENDING");
  const decided = requests.filter((r) => r.status !== "PENDING");

  return (
    <RequireAdmin>
      <PageHeader
        title="Reservations"
        description="Review pending requests and manage the full reservation history."
      />
      <PreviewNotice>
        Approve, reject, modify, and override actions are connected in the
        booking engine step. This preview shows the review layout with
        fixture data.
      </PreviewNotice>

      {requests.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No reservation activity yet"
          description="Requests will appear here as soon as authorized users start submitting them."
        />
      ) : (
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 text-sm font-semibold text-foreground">
              Pending decision ({pending.length})
            </h2>
            <div className="space-y-3">
              {pending.map((request) => (
                <Card key={request.id}>
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {request.purpose}
                      </p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {request.requesterName} · {formatRange(request.startsAt, request.endsAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <ReservationStatusBadge status={request.status} />
                      <Button size="sm" variant="outline" disabled>
                        Reject
                      </Button>
                      <Button size="sm" disabled>
                        Approve
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {pending.length === 0 ? (
                <p className="text-sm text-muted-foreground">No requests waiting on a decision.</p>
              ) : null}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-foreground">Decision history</h2>
            <div className="space-y-3">
              {decided.map((request) => (
                <Card key={request.id}>
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {request.purpose}
                      </p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {request.requesterName} · {formatRange(request.startsAt, request.endsAt)}
                      </p>
                      {request.decidedBy ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Decided by {request.decidedBy}
                        </p>
                      ) : null}
                    </div>
                    <ReservationStatusBadge status={request.status} />
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        </div>
      )}
    </RequireAdmin>
  );
}
