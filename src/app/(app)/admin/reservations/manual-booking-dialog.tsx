"use client";

import { useState, useTransition } from "react";
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
import { localDateTimeToUtcIso } from "@/lib/booking/timezone";
import { createManualReservationAction } from "@/lib/booking/actions";

const empty = {
  startsAt: "",
  endsAt: "",
  purpose: "",
  participantCount: 1,
  requesterName: "",
  requesterEmail: "",
};

export function ManualBookingDialog({ roomId }: { roomId: string }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [needsOverride, setNeedsOverride] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [isPending, startTransition] = useTransition();

  function attempt(override: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await createManualReservationAction({
        roomId,
        startsAt: localDateTimeToUtcIso(form.startsAt),
        endsAt: localDateTimeToUtcIso(form.endsAt),
        purpose: form.purpose,
        participantCount: form.participantCount,
        requesterName: form.requesterName,
        requesterEmail: form.requesterEmail,
        override,
        overrideReason: override ? overrideReason : undefined,
      });
      if (!result.ok) {
        if (
          !override &&
          (result.code === "OUTSIDE_AVAILABILITY" ||
            result.code === "ADVANCE_NOTICE_REQUIRED" ||
            result.code === "EXTENDED_MEETING_BUFFER_REQUIRED")
        ) {
          setNeedsOverride(result.error);
          return;
        }
        setError(result.error);
        return;
      }
      setOpen(false);
      setForm(empty);
      setNeedsOverride(null);
      setOverrideReason("");
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setForm(empty); setError(null); setNeedsOverride(null); } }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Manual booking
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Book directly on someone&apos;s behalf</DialogTitle>
          <DialogDescription>
            Created and approved in the same step — this exempts the 48-hour advance-notice rule, since nothing
            about it is pending review. It still can never overlap an approved reservation, and the usual one-hour
            buffer between extended meetings still applies.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="manual-start">Starts</Label>
            <Input id="manual-start" type="datetime-local" value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="manual-end">Ends</Label>
            <Input id="manual-end" type="datetime-local" value={form.endsAt} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="manual-name">Requester name</Label>
            <Input id="manual-name" value={form.requesterName} onChange={(e) => setForm((f) => ({ ...f, requesterName: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="manual-email">Requester email</Label>
            <Input id="manual-email" type="email" value={form.requesterEmail} onChange={(e) => setForm((f) => ({ ...f, requesterEmail: e.target.value }))} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="manual-purpose">Purpose</Label>
          <Textarea id="manual-purpose" rows={2} value={form.purpose} onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))} />
        </div>
        <div className="max-w-32 space-y-1.5">
          <Label htmlFor="manual-participants">Participants</Label>
          <Input
            id="manual-participants"
            type="number"
            min={1}
            value={form.participantCount}
            onChange={(e) => setForm((f) => ({ ...f, participantCount: Number(e.target.value) }))}
          />
        </div>

        {needsOverride ? (
          <div className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">{needsOverride}</p>
            <Label htmlFor="manual-override-reason">Override reason (required)</Label>
            <Textarea id="manual-override-reason" rows={2} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
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
              {isPending ? "Booking…" : "Book anyway"}
            </Button>
          ) : (
            <Button
              disabled={
                isPending ||
                !form.startsAt ||
                !form.endsAt ||
                !form.purpose ||
                !form.requesterName ||
                !form.requesterEmail
              }
              onClick={() => attempt(false)}
            >
              {isPending ? "Booking…" : "Create booking"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
