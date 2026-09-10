"use client";

import { useState } from "react";
import { CalendarClock, Info, ShieldCheck, Users } from "lucide-react";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ReservationStatusBadge } from "@/components/status/status-badge";
import { ROOM_TIMEZONE } from "@/lib/config";
import type { Reservation } from "@/lib/booking/actions";
import { ApproveButton, RejectButton, AdminCancelButton } from "@/app/(app)/admin/reservations/decision-buttons";
import { ModifyReservationDialog } from "@/app/(app)/admin/reservations/modify-reservation-dialog";

const WARNING_LABELS: Record<string, string> = {
  OUTSIDE_AVAILABILITY: "No longer fits published availability",
  RESERVATION_CONFLICT: "Now conflicts with an approved reservation",
  EXTENDED_MEETING_BUFFER_REQUIRED: "Within an hour of another approved extended meeting",
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

function Field({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        <div className="mt-0.5 text-foreground">{children}</div>
      </div>
    </div>
  );
}

export function ReservationDetailsSheet({
  reservation,
  warnings = [],
  trigger,
}: {
  reservation: Reservation;
  warnings?: string[];
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{reservation.purpose}</SheetTitle>
          <SheetDescription>Request details</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-4">
          <div className="flex items-center justify-between">
            <ReservationStatusBadge status={reservation.status} />
            <span className="text-xs text-muted-foreground">version {reservation.version}</span>
          </div>

          {warnings.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {warnings.map((w) => (
                <Badge key={w} variant="destructive" className="text-[10px]">
                  {WARNING_LABELS[w] ?? w}
                </Badge>
              ))}
            </div>
          ) : null}

          <Field icon={Users} label="Requester">
            {reservation.requester_name}
            <span className="block text-xs text-muted-foreground">{reservation.requester_email}</span>
          </Field>

          <Field icon={CalendarClock} label="Requested interval">
            {formatFull(reservation.starts_at)}
            <span className="block text-xs text-muted-foreground">
              until {formatFull(reservation.ends_at)} · {ROOM_TIMEZONE}
            </span>
          </Field>

          <Field icon={Users} label="Participants">
            {reservation.participant_count}
          </Field>

          <Field icon={ShieldCheck} label="Submitted">
            {formatFull(reservation.submitted_at)}
          </Field>

          {reservation.decided_at ? (
            <Field icon={Info} label={reservation.status === "REJECTED" ? "Rejected" : "Decided"}>
              {formatFull(reservation.decided_at)}
              {reservation.decision_reason ? (
                <span className="block text-xs text-muted-foreground">Reason: {reservation.decision_reason}</span>
              ) : null}
            </Field>
          ) : null}

          {reservation.admin_override && reservation.override_reason ? (
            <Field icon={Info} label="Approved with an override">
              {reservation.override_reason}
            </Field>
          ) : null}

          {reservation.status === "CANCELLED" ? (
            <Field icon={Info} label="Cancelled">
              {reservation.cancelled_at ? formatFull(reservation.cancelled_at) : null}
              {reservation.cancellation_reason ? (
                <span className="block text-xs text-muted-foreground">Reason: {reservation.cancellation_reason}</span>
              ) : null}
            </Field>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            {reservation.status === "PENDING" ? (
              <>
                <RejectButton reservationId={reservation.id} expectedVersion={reservation.version} />
                <ApproveButton reservationId={reservation.id} expectedVersion={reservation.version} />
              </>
            ) : null}
            {reservation.status === "APPROVED" ? (
              <AdminCancelButton reservationId={reservation.id} expectedVersion={reservation.version} />
            ) : null}
            {reservation.status === "PENDING" || reservation.status === "APPROVED" ? (
              <ModifyReservationDialog
                reservation={reservation}
                trigger={
                  <Button size="sm" variant="outline">
                    Modify
                  </Button>
                }
              />
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
