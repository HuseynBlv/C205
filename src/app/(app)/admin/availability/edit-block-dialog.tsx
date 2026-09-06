"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { formatInTimeZone } from "date-fns-tz";
import { ROOM_TIMEZONE } from "@/lib/config";
import { localDateTimeToUtcIso } from "@/lib/booking/timezone";
import { updateBlockedIntervalAction } from "@/lib/booking/availability-actions";
import { ImpactPreview } from "@/app/(app)/admin/availability/impact-preview";
import type { Tables } from "@/lib/supabase/database.types";

function toLocalInput(iso: string): string {
  return formatInTimeZone(new Date(iso), ROOM_TIMEZONE, "yyyy-MM-dd'T'HH:mm");
}

export function EditBlockDialog({ block, roomId }: { block: Tables<"blocked_intervals">; roomId: string }) {
  const [open, setOpen] = useState(false);
  const [startsAt, setStartsAt] = useState(() => toLocalInput(block.starts_at));
  const [endsAt, setEndsAt] = useState(() => toLocalInput(block.ends_at));
  const [reason, setReason] = useState(block.reason);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit blocked time</DialogTitle>
          <DialogDescription>
            Blocking time never touches existing reservations — approved bookings inside it stay approved.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-block-start">Starts</Label>
            <Input id="edit-block-start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-block-end">Ends</Label>
            <Input id="edit-block-end" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-block-reason">Reason</Label>
          <Input id="edit-block-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Affected reservations</p>
          <ImpactPreview roomId={roomId} startsAt={block.starts_at} endsAt={block.ends_at} />
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter>
          <Button
            disabled={isPending || reason.trim().length === 0}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await updateBlockedIntervalAction({
                  blockId: block.id,
                  startsAt: localDateTimeToUtcIso(startsAt),
                  endsAt: localDateTimeToUtcIso(endsAt),
                  reason,
                });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setOpen(false);
              });
            }}
          >
            {isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
