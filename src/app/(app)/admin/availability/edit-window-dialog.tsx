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
import { updateAvailabilityWindowAction } from "@/lib/booking/availability-actions";
import { ImpactPreview } from "@/app/(app)/admin/availability/impact-preview";
import type { Tables } from "@/lib/supabase/database.types";

function toLocalInput(iso: string): string {
  return formatInTimeZone(new Date(iso), ROOM_TIMEZONE, "yyyy-MM-dd'T'HH:mm");
}

export function EditWindowDialog({ window: w, roomId }: { window: Tables<"availability_windows">; roomId: string }) {
  const [open, setOpen] = useState(false);
  const [startsAt, setStartsAt] = useState(() => toLocalInput(w.starts_at));
  const [endsAt, setEndsAt] = useState(() => toLocalInput(w.ends_at));
  const [label, setLabel] = useState(w.label ?? "");
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
          <DialogTitle>Edit availability window</DialogTitle>
          <DialogDescription>
            Shrinking or moving this window never touches existing reservations — an approved booking outside the
            new range stays approved.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-window-start">Starts</Label>
            <Input id="edit-window-start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-window-end">Ends</Label>
            <Input id="edit-window-end" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-window-label">Label (optional)</Label>
          <Input id="edit-window-label" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Affected reservations</p>
          <ImpactPreview roomId={roomId} startsAt={w.starts_at} endsAt={w.ends_at} />
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter>
          <Button
            disabled={isPending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await updateAvailabilityWindowAction({
                  windowId: w.id,
                  startsAt: localDateTimeToUtcIso(startsAt),
                  endsAt: localDateTimeToUtcIso(endsAt),
                  label: label || undefined,
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
