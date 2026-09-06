"use client";

import { useState, useTransition } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ROOM_TIMEZONE } from "@/lib/config";
import { localDateTimeToUtcIso } from "@/lib/booking/timezone";
import { modifyReservationAction, type Reservation } from "@/lib/booking/actions";

function toLocalInput(iso: string): string {
  return formatInTimeZone(new Date(iso), ROOM_TIMEZONE, "yyyy-MM-dd'T'HH:mm");
}

export function ModifyReservationDialog({
  reservation,
  trigger,
}: {
  reservation: Reservation;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [startsAt, setStartsAt] = useState(() => toLocalInput(reservation.starts_at));
  const [endsAt, setEndsAt] = useState(() => toLocalInput(reservation.ends_at));
  const [purpose, setPurpose] = useState(reservation.purpose);
  const [participantCount, setParticipantCount] = useState(reservation.participant_count);
  const [error, setError] = useState<string | null>(null);
  const [needsOverride, setNeedsOverride] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [isPending, startTransition] = useTransition();

  function attempt(override: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await modifyReservationAction({
        reservationId: reservation.id,
        expectedVersion: reservation.version,
        startsAt: localDateTimeToUtcIso(startsAt),
        endsAt: localDateTimeToUtcIso(endsAt),
        purpose,
        participantCount,
        override,
        overrideReason: override ? overrideReason : undefined,
      });
      if (!result.ok) {
        if (result.code === "STALE_RESERVATION_VERSION") {
          setError("This request changed since you opened it. Close this dialog and refresh to try again.");
          return;
        }
        if (!override && (result.code === "OUTSIDE_AVAILABILITY" || result.code === "ADVANCE_NOTICE_REQUIRED")) {
          setNeedsOverride(result.error);
          return;
        }
        setError(result.error);
        return;
      }
      setOpen(false);
      setNeedsOverride(null);
      setOverrideReason("");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modify reservation</DialogTitle>
          <DialogDescription>
            Changes are visible to the requester immediately; they&apos;re notified about material changes.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="modify-start">Starts</Label>
            <Input id="modify-start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="modify-end">Ends</Label>
            <Input id="modify-end" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="modify-purpose">Purpose</Label>
          <Textarea id="modify-purpose" rows={2} value={purpose} onChange={(e) => setPurpose(e.target.value)} />
        </div>
        <div className="max-w-32 space-y-1.5">
          <Label htmlFor="modify-participants">Participants</Label>
          <Input
            id="modify-participants"
            type="number"
            min={1}
            value={participantCount}
            onChange={(e) => setParticipantCount(Number(e.target.value))}
          />
        </div>

        {needsOverride ? (
          <div className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">{needsOverride}</p>
            <Label htmlFor="modify-override-reason">Override reason (required)</Label>
            <Textarea
              id="modify-override-reason"
              rows={2}
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
            />
          </div>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter>
          {needsOverride ? (
            <Button disabled={isPending || overrideReason.trim().length === 0} onClick={() => attempt(true)}>
              {isPending ? "Saving…" : "Save anyway"}
            </Button>
          ) : (
            <Button disabled={isPending} onClick={() => attempt(false)}>
              {isPending ? "Saving…" : "Save changes"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
