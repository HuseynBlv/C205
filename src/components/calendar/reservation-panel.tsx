"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarClock, Hourglass, Info, ShieldCheck, Users } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ReservationStatusBadge } from "@/components/status/status-badge";
import { ROOM_NAME, ROOM_TIMEZONE } from "@/lib/config";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { getReservationDetailsAction, type ReservationDetailsResult } from "@/lib/booking/reservation-details";
import { CancelReservationButton } from "@/components/requests/cancel-reservation-button";
import { ApproveButton, RejectButton, AdminCancelButton } from "@/app/(app)/admin/reservations/decision-buttons";
import { ModifyReservationDialog } from "@/app/(app)/admin/reservations/modify-reservation-dialog";
import { Button } from "@/components/ui/button";

const WARNING_LABELS: Record<string, string> = {
  OUTSIDE_AVAILABILITY: "No longer fits published availability",
  RESERVATION_CONFLICT: "Now conflicts with an approved reservation",
};

function formatFull(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ROOM_TIMEZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatDateOnly(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ROOM_TIMEZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

function formatTimeOnly(iso: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: ROOM_TIMEZONE, hour: "numeric", minute: "2-digit" }).format(
    new Date(iso),
  );
}

function formatDuration(startIso: string, endIso: string): string {
  const minutes = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

function Field({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        <div className="mt-0.5 text-foreground">{children}</div>
      </div>
    </div>
  );
}

export interface ReservationFallback {
  status: "PENDING" | "APPROVED";
  startsAt: string;
  endsAt: string;
}

export function ReservationPanel({
  reservationId,
  fallback,
  open,
  onOpenChange,
}: {
  reservationId: string | null;
  fallback: ReservationFallback | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [details, setDetails] = useState<ReservationDetailsResult | null>(null);
  const [loading, setLoading] = useState(false);
  // Bumped after a successful action (approve/reject/cancel/modify) taken
  // from inside this panel — those actions call revalidatePath, which
  // refreshes the calendar's own event list, but this panel's `details`
  // is a separate client-fetched snapshot that a server revalidation
  // alone doesn't touch. Without this, approving a request here left the
  // panel showing stale "Pending" content (and its now-invalid Approve/
  // Reject buttons) even though the event underneath had already turned
  // green — a real bug caught by actually clicking Approve, not just
  // reading the code.
  const [refreshKey, setRefreshKey] = useState(0);
  const refetch = () => setRefreshKey((k) => k + 1);
  const prevIdRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      if (!open || !reservationId) {
        setDetails(null);
        prevIdRef.current = null;
        return;
      }
      if (prevIdRef.current !== reservationId) {
        // Switching to a different reservation — clear immediately so we
        // never show one reservation's details under another's id, even
        // for a moment. A same-id refetch (after a successful action)
        // deliberately keeps showing the last-known content until the
        // fresh copy arrives, instead of flashing to a loading skeleton.
        setDetails(null);
      }
      prevIdRef.current = reservationId;
      setLoading(true);
      getReservationDetailsAction(reservationId).then((result) => {
        if (active) {
          setDetails(result);
          setLoading(false);
        }
      });
    });
    return () => {
      active = false;
    };
  }, [open, reservationId, refreshKey]);

  const status = details?.reservation.status ?? fallback?.status ?? "PENDING";
  const startsAt = details?.reservation.starts_at ?? fallback?.startsAt;
  const endsAt = details?.reservation.ends_at ?? fallback?.endsAt;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isDesktop ? "right" : "bottom"}
        onCloseAutoFocus={(e) => e.preventDefault()}
        className={isDesktop ? "overflow-y-auto" : "max-h-[85vh] overflow-y-auto rounded-t-2xl"}
      >
        <SheetHeader>
          <SheetTitle>
            {details?.reservation.purpose ??
              (status === "APPROVED" ? `${ROOM_NAME} is reserved` : `${ROOM_NAME} has a pending request`)}
          </SheetTitle>
          <SheetDescription>Reservation details</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-4">
          <div className="flex items-center justify-between">
            <ReservationStatusBadge status={status} />
            {details?.tier === "admin" ? (
              <span className="text-xs text-muted-foreground">version {details.reservation.version}</span>
            ) : null}
          </div>

          {loading && !startsAt ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : startsAt && endsAt ? (
            <>
              {details?.tier === "admin" && details.warnings.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {details.warnings.map((w) => (
                    <Badge key={w} variant="destructive" className="text-[10px]">
                      {WARNING_LABELS[w] ?? w}
                    </Badge>
                  ))}
                </div>
              ) : null}

              {details?.tier === "admin" ? (
                <Field icon={Users} label="Requester">
                  {details.reservation.requester_name}
                  <span className="block text-xs text-muted-foreground">{details.reservation.requester_email}</span>
                </Field>
              ) : null}

              <Field icon={CalendarClock} label="Date">
                {formatDateOnly(startsAt)}
              </Field>

              <Field icon={Hourglass} label="Time">
                {formatTimeOnly(startsAt)} – {formatTimeOnly(endsAt)}
                <span className="block text-xs text-muted-foreground">
                  {formatDuration(startsAt, endsAt)} · {ROOM_TIMEZONE}
                </span>
              </Field>

              {details && (details.tier === "owner" || details.tier === "admin") ? (
                <Field icon={Users} label="Participants">
                  {details.reservation.participant_count}
                </Field>
              ) : null}

              {details && (details.tier === "owner" || details.tier === "admin") ? (
                <Field icon={ShieldCheck} label="Submitted">
                  {formatFull(details.reservation.submitted_at)}
                </Field>
              ) : null}

              {details?.reservation.decided_at ? (
                <Field icon={Info} label={details.reservation.status === "REJECTED" ? "Rejected" : "Decided"}>
                  {formatFull(details.reservation.decided_at)}
                  {details.reservation.decision_reason ? (
                    <span className="block text-xs text-muted-foreground">
                      Reason: {details.reservation.decision_reason}
                    </span>
                  ) : null}
                </Field>
              ) : null}

              {details?.reservation.admin_override && details.reservation.override_reason ? (
                <Field icon={Info} label="Approved with an override">
                  {details.reservation.override_reason}
                </Field>
              ) : null}

              {details?.reservation.status === "CANCELLED" ? (
                <Field icon={Info} label="Cancelled">
                  {details.reservation.cancelled_at ? formatFull(details.reservation.cancelled_at) : null}
                  {details.reservation.cancellation_reason ? (
                    <span className="block text-xs text-muted-foreground">
                      Reason: {details.reservation.cancellation_reason}
                    </span>
                  ) : null}
                </Field>
              ) : null}

              {!details ? (
                <p className="border-t border-border pt-3 text-xs text-muted-foreground">
                  Only the requester and USG admins can see who this is for and why.
                </p>
              ) : null}

              {details ? (
                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                  {details.tier === "admin" && details.reservation.status === "PENDING" ? (
                    <>
                      <RejectButton
                        reservationId={details.reservation.id}
                        expectedVersion={details.reservation.version}
                        onSuccess={refetch}
                      />
                      <ApproveButton
                        reservationId={details.reservation.id}
                        expectedVersion={details.reservation.version}
                        onSuccess={refetch}
                      />
                    </>
                  ) : null}
                  {details.tier === "admin" && details.reservation.status === "APPROVED" ? (
                    <AdminCancelButton
                      reservationId={details.reservation.id}
                      expectedVersion={details.reservation.version}
                      onSuccess={refetch}
                    />
                  ) : null}
                  {details.tier === "admin" &&
                  (details.reservation.status === "PENDING" || details.reservation.status === "APPROVED") ? (
                    <ModifyReservationDialog
                      reservation={details.reservation}
                      onSuccess={refetch}
                      trigger={
                        <Button size="sm" variant="outline">
                          Modify
                        </Button>
                      }
                    />
                  ) : null}
                  {details.tier === "owner" && details.reservation.status === "APPROVED" ? (
                    <CancelReservationButton
                      reservationId={details.reservation.id}
                      expectedVersion={details.reservation.version}
                      onSuccess={refetch}
                    />
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
