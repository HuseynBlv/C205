"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  removeAvailabilityWindowAction,
  removeBlockedIntervalAction,
} from "@/lib/booking/availability-actions";

export function RemoveButton({ id, kind }: { id: string; kind: "window" | "block" }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const action = kind === "window" ? removeAvailabilityWindowAction : removeBlockedIntervalAction;

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await action(id);
            if (!result.ok) setError(result.error);
          });
        }}
      >
        {isPending ? "Removing…" : "Remove"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
