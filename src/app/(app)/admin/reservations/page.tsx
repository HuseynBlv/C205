import { ListChecks } from "lucide-react";
import { AdminReservationsClient } from "@/app/(app)/admin/reservations/reservations-client";
import { PageHeader } from "@/components/layout/page-header";
import { RequireAdmin } from "@/components/admin/require-admin";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { ReservationStatusBadge } from "@/components/status/status-badge";
import { getCurrentProfile, isActiveAdmin } from "@/lib/auth/dal";
import { useFixtures, ROOM_TIMEZONE } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { AutoRefresh } from "@/components/shared/auto-refresh";
import { getConflictWarnings } from "@/lib/booking/actions";
import type { Reservation } from "@/lib/booking/actions";
import { ApproveButton, RejectButton } from "@/app/(app)/admin/reservations/decision-buttons";

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

const WARNING_LABELS: Record<string, string> = {
  OUTSIDE_AVAILABILITY: "No longer fits published availability",
  RESERVATION_CONFLICT: "Now conflicts with an approved reservation",
};

async function RealAdminReservations() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reservations")
    .select("*")
    .order("submitted_at", { ascending: false });

  if (error) {
    return <ErrorState description="We couldn't load reservations just now." />;
  }

  const rows = (data ?? []) as Reservation[];

  const pending = rows.filter((r) => r.status === "PENDING");
  const decided = rows.filter((r) => r.status !== "PENDING");

  const warningsByPending = new Map<string, string[]>(
    await Promise.all(
      pending.map(async (r) => [r.id, await getConflictWarnings(r.id)] as [string, string[]]),
    ),
  );

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        title="No reservation activity yet"
        description="Requests will appear here as soon as authorized users start submitting them."
      />
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Pending decision ({pending.length})
        </h2>
        <div className="space-y-3">
          {pending.map((r) => {
            const warnings = warningsByPending.get(r.id) ?? [];
            return (
              <Card key={r.id}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{r.purpose}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {r.requester_name} · {formatRange(r.starts_at, r.ends_at)}
                    </p>
                    {warnings.length > 0 ? (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {warnings.map((w) => (
                          <Badge key={w} variant="destructive" className="text-[10px]">
                            {WARNING_LABELS[w] ?? w}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <ReservationStatusBadge status={r.status} />
                    <RejectButton reservationId={r.id} expectedVersion={r.version} />
                    <ApproveButton reservationId={r.id} expectedVersion={r.version} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">No requests waiting on a decision.</p>
          ) : null}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">Decision history</h2>
        <div className="space-y-3">
          {decided.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{r.purpose}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {r.requester_name} · {formatRange(r.starts_at, r.ends_at)}
                  </p>
                </div>
                <ReservationStatusBadge status={r.status} />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

export default async function AdminReservationsPage() {
  if (useFixtures) {
    return <AdminReservationsClient />;
  }

  const profile = await getCurrentProfile();
  const admin = isActiveAdmin(profile);

  return (
    <RequireAdmin isAdmin={admin}>
      <AutoRefresh />
      <PageHeader
        title="Reservations"
        description="Review pending requests and manage the full reservation history."
      />
      <RealAdminReservations />
    </RequireAdmin>
  );
}
