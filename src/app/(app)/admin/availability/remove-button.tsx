"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
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
import {
  removeAvailabilityWindowAction,
  removeBlockedIntervalAction,
} from "@/lib/booking/availability-actions";
import { ImpactPreview } from "@/app/(app)/admin/availability/impact-preview";

export function RemoveButton({
  id,
  kind,
  roomId,
  startsAt,
  endsAt,
}: {
  id: string;
  kind: "window" | "block";
  roomId: string;
  startsAt: string;
  endsAt: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const action = kind === "window" ? removeAvailabilityWindowAction : removeBlockedIntervalAction;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Remove
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove this {kind === "window" ? "availability window" : "block"}?</DialogTitle>
          <DialogDescription>
            {kind === "window"
              ? "Any approved reservation already relying on this window keeps its time — this only affects what new requests can be submitted for."
              : "Removing a block never cancels anything — it only reopens the time for new requests."}
          </DialogDescription>
        </DialogHeader>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Affected reservations</p>
          <ImpactPreview roomId={roomId} startsAt={startsAt} endsAt={endsAt} />
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter>
          <Button
            variant="destructive"
            disabled={isPending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await action(id);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setOpen(false);
              });
            }}
          >
            {isPending ? "Removing…" : "Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
