"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { approveRequestAction, rejectRequestAction } from "@/lib/booking/actions";

function DecisionButton({
  reservationId,
  expectedVersion,
  variant,
  label,
  pendingLabel,
  icon: Icon,
  className,
  action,
}: {
  reservationId: string;
  expectedVersion: number;
  variant: "outline" | "default";
  label: string;
  pendingLabel: string;
  icon: React.ElementType;
  className?: string;
  action: (input: { reservationId: string; expectedVersion: number }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant={variant}
        className={className}
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await action({ reservationId, expectedVersion });
            if (!result.ok) setError(result.error ?? "Something went wrong.");
          });
        }}
      >
        <Icon className="size-3.5" />
        {isPending ? pendingLabel : label}
      </Button>
      {error ? <p className="max-w-40 text-right text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export function ApproveButton(props: { reservationId: string; expectedVersion: number }) {
  return (
    <DecisionButton
      {...props}
      variant="default"
      label="Approve"
      pendingLabel="Approving…"
      icon={CheckCircle2}
      className="bg-[var(--status-approved)] text-white hover:bg-[var(--status-approved-glow)]"
      action={approveRequestAction}
    />
  );
}

export function RejectButton(props: { reservationId: string; expectedVersion: number }) {
  return (
    <DecisionButton
      {...props}
      variant="outline"
      label="Reject"
      pendingLabel="Rejecting…"
      icon={XCircle}
      className="border-[color-mix(in_oklab,var(--status-rejected)_55%,var(--border))] text-[var(--status-rejected)] hover:bg-[color-mix(in_oklab,var(--status-rejected)_10%,white)]"
      action={rejectRequestAction}
    />
  );
}
