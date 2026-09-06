import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/states/empty-state";
import { ReservationStatusBadge } from "@/components/status/status-badge";
import { fixtureReservations, fixtureCurrentUser } from "@/lib/fixtures/data";
import { useFixtures, ROOM_TIMEZONE } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/dal";
import { CancelReservationButton } from "@/components/requests/cancel-reservation-button";
import type { ReservationRequest } from "@/lib/types";
import type { Reservation } from "@/lib/booking/actions";

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

function fromReservationRow(r: Reservation): ReservationRequest {
  return {
    id: r.id,
    requesterId: r.requester_id ?? "",
    requesterName: r.requester_name,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    purpose: r.purpose,
    participantCount: r.participant_count,
    status: r.status,
    submittedAt: r.submitted_at,
    decidedAt: r.decided_at,
    decidedBy: r.decided_by,
    rejectionReason: r.status === "REJECTED" ? r.decision_reason : null,
    adminOverride: r.admin_override,
    overrideReason: r.override_reason,
  };
}

export default async function MyRequestsPage() {
  let requests: ReservationRequest[] = [];
  let versionById = new Map<string, number>();

  if (useFixtures) {
    requests = fixtureReservations.filter((r) => r.requesterId === fixtureCurrentUser.id);
  } else {
    const user = await getVerifiedUser();
    if (user) {
      const supabase = await createClient();
      const { data } = await supabase
        .from("reservations")
        .select("*")
        .eq("requester_id", user.id)
        .order("submitted_at", { ascending: false });
      const rows = (data ?? []) as Reservation[];
      requests = rows.map(fromReservationRow);
      versionById = new Map(rows.map((r) => [r.id, r.version]));
    }
  }

  return (
    <div>
      <PageHeader
        title="My Requests"
        description="Every request you've submitted, its decision, and reservation history."
        actions={
          <Button asChild size="sm">
            <Link href="/requests/new">Request C205</Link>
          </Button>
        }
      />

      {requests.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No requests yet"
          description="Submit a request for C205 and track its status here — from Pending through a final decision."
          action={
            <Button asChild size="sm">
              <Link href="/requests/new">Request C205</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {requests.map((request) => (
            <Card key={request.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{request.purpose}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {formatRange(request.startsAt, request.endsAt)} · {request.participantCount}{" "}
                    participants
                  </p>
                  {request.status === "REJECTED" && request.rejectionReason ? (
                    <p className="mt-1.5 text-sm text-[#8a3c37]">
                      Reason: {request.rejectionReason}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <ReservationStatusBadge status={request.status} />
                  {!useFixtures && request.status === "APPROVED" ? (
                    <CancelReservationButton
                      reservationId={request.id}
                      expectedVersion={versionById.get(request.id) ?? 1}
                    />
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
