"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cancelReservationAction } from "@/lib/booking/actions";

export function CancelReservationButton({
  reservationId,
  expectedVersion,
  onSuccess,
}: {
  reservationId: string;
  expectedVersion: number;
  onSuccess?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await cancelReservationAction({ reservationId, expectedVersion });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            onSuccess?.();
          });
        }}
      >
        <X className="size-3.5" />
        {isPending ? "Cancelling…" : "Cancel"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
