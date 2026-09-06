import { ListChecks } from "lucide-react";
import { AdminReservationsClient } from "@/app/(app)/admin/reservations/reservations-client";
import { PageHeader } from "@/components/layout/page-header";
import { RequireAdmin } from "@/components/admin/require-admin";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { ReservationStatusBadge } from "@/components/status/status-badge";
import { getCurrentProfile, isActiveAdmin } from "@/lib/auth/dal";
import { useFixtures, ROOM_TIMEZONE } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { AutoRefresh } from "@/components/shared/auto-refresh";
import { getConflictWarnings } from "@/lib/booking/actions";
import type { Reservation } from "@/lib/booking/actions";
import { PendingQueue } from "@/app/(app)/admin/reservations/pending-queue";
import { ManualBookingDialog } from "@/app/(app)/admin/reservations/manual-booking-dialog";
import { AdminCancelButton } from "@/app/(app)/admin/reservations/decision-buttons";
import { ReservationDetailsSheet } from "@/components/admin/reservation-details-sheet";

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

async function RealAdminReservations({ roomId }: { roomId: string | null }) {
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

  const warningsById = Object.fromEntries(
    await Promise.all(
      pending.map(async (r) => [r.id, await getConflictWarnings(r.id)] as [string, string[]]),
    ),
  );

  return (
    <div className="space-y-6">
      {roomId ? (
        <div className="flex justify-end">
          <ManualBookingDialog roomId={roomId} />
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No reservation activity yet"
          description="Requests will appear here as soon as authorized users start submitting them."
        />
      ) : (
        <>
          <PendingQueue reservations={pending} warningsById={warningsById} />

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
                    <div className="flex shrink-0 items-center gap-2">
                      <ReservationStatusBadge status={r.status} />
                      <ReservationDetailsSheet
                        reservation={r}
                        trigger={
                          <Button size="sm" variant="ghost">
                            View
                          </Button>
                        }
                      />
                      {r.status === "APPROVED" ? (
                        <AdminCancelButton reservationId={r.id} expectedVersion={r.version} />
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {decided.length === 0 ? (
                <p className="text-sm text-muted-foreground">No decisions yet.</p>
              ) : null}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default async function AdminReservationsPage() {
  if (useFixtures) {
    return <AdminReservationsClient />;
  }

  const profile = await getCurrentProfile();
  const admin = isActiveAdmin(profile);
  const supabase = await createClient();
  const { data: room } = await supabase.from("rooms").select("id").eq("code", "C205").single();

  return (
    <RequireAdmin isAdmin={admin}>
      <AutoRefresh />
      <PageHeader
        title="Reservations"
        description="Review pending requests and manage the full reservation history."
      />
      <RealAdminReservations roomId={room?.id ?? null} />
    </RequireAdmin>
  );
}
