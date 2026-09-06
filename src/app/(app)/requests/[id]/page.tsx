import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, ShieldCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ReservationStatusBadge } from "@/components/status/status-badge";
import { CancelReservationButton } from "@/components/requests/cancel-reservation-button";
import { fixtureReservations, fixtureCurrentUser } from "@/lib/fixtures/data";
import { ROOM_NAME, ROOM_TIMEZONE, useFixtures } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/dal";
import type { Reservation } from "@/lib/booking/actions";
import type { ReservationRequest } from "@/lib/types";

function formatFull(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ROOM_TIMEZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
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

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let request: ReservationRequest | null = null;
  let version = 1;

  if (useFixtures) {
    const found = fixtureReservations.find((r) => r.id === id && r.requesterId === fixtureCurrentUser.id);
    request = found ?? null;
  } else {
    const user = await getVerifiedUser();
    if (!user) notFound();
    const supabase = await createClient();
    // RLS (reservations_select_own) already restricts this to the caller's
    // own rows, so a request that exists but belongs to someone else comes
    // back empty here — indistinguishable from "doesn't exist", which is
    // the point: this page never confirms or denies another user's
    // reservation exists.
    const { data } = await supabase.from("reservations").select("*").eq("id", id).single();
    if (!data) notFound();
    const row = data as Reservation;
    request = fromReservationRow(row);
    version = row.version;
  }

  if (!request) notFound();

  return (
    <div className="mx-auto max-w-xl">
      <Link
        href="/requests"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Back to My Requests
      </Link>
      <PageHeader title={request.purpose} description={`Request for ${ROOM_NAME}`} />

      <Card>
        <CardContent className="space-y-5 p-5">
          <div className="flex items-center justify-between">
            <ReservationStatusBadge status={request.status} />
            {!useFixtures && request.status === "APPROVED" ? (
              <CancelReservationButton reservationId={request.id} expectedVersion={version} />
            ) : null}
          </div>

          <div className="flex items-start gap-2.5 text-sm">
            <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="font-medium text-foreground">{formatFull(request.startsAt)}</p>
              <p className="text-muted-foreground">
                until {formatFull(request.endsAt)} · {ROOM_TIMEZONE}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5 text-sm">
            <Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p>{request.participantCount} participants</p>
          </div>

          <div className="flex items-start gap-2.5 text-sm">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="text-muted-foreground">
              <p>Submitted {formatFull(request.submittedAt)}</p>
              {request.decidedAt ? <p>Decided {formatFull(request.decidedAt)}</p> : null}
            </div>
          </div>

          {request.status === "REJECTED" && request.rejectionReason ? (
            <div className="rounded-lg border border-[#eccbc7] bg-[#f8ebe9] p-3 text-sm text-[#8a3c37]">
              <p className="font-medium">Reason for rejection</p>
              <p className="mt-0.5">{request.rejectionReason}</p>
            </div>
          ) : null}

          {request.adminOverride && request.overrideReason ? (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Approved with an override</p>
              <p className="mt-0.5">{request.overrideReason}</p>
            </div>
          ) : null}

          <p className="border-t border-border pt-3 text-xs text-muted-foreground">
            {request.status === "PENDING"
              ? "Pending USG approval. The room is not yet reserved."
              : `This page is only visible to you${useFixtures ? " (and, for real requests, USG admins)" : " and USG admins"}.`}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
