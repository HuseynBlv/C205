"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import {
  approveRequestAction,
  cancelReservationAction,
  rejectRequestAction,
} from "@/lib/booking/actions";

/** A STALE_RESERVATION_VERSION error means whatever the admin was looking
 * at has already changed — the only honest recovery is to refresh and
 * make the decision again against current values, never to retry blindly
 * against the version already known to be wrong. */
function StaleVersionNotice() {
  const router = useRouter();
  return (
    <Alert variant="destructive">
      <AlertDescription className="flex items-center justify-between gap-2">
        <span>This request changed since you opened it.</span>
        <Button size="sm" variant="outline" onClick={() => router.refresh()}>
          Refresh
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export function RejectButton({
  reservationId,
  expectedVersion,
  onSuccess,
}: {
  reservationId: string;
  expectedVersion: number;
  /** Called after a successful decision, in addition to the
   * `revalidatePath`s the action already does — for a panel (like the
   * calendar's ReservationPanel) holding its own client-fetched copy of
   * the reservation that a server-side revalidation alone won't refresh. */
  onSuccess?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setError(null); setStale(false); } }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-[color-mix(in_oklab,var(--status-rejected)_55%,var(--border))] text-[var(--status-rejected)] hover:bg-[color-mix(in_oklab,var(--status-rejected)_10%,white)]">
          <XCircle className="size-3.5" /> Reject
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject this request</DialogTitle>
          <DialogDescription>An optional reason is shown to the requester.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="reject-reason">Reason (optional)</Label>
          <Textarea id="reject-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {stale ? <StaleVersionNotice /> : error ? (
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
              setStale(false);
              startTransition(async () => {
                const result = await rejectRequestAction({ reservationId, expectedVersion, reason: reason || undefined });
                if (!result.ok) {
                  if (result.code === "STALE_RESERVATION_VERSION") setStale(true);
                  else setError(result.error);
                  return;
                }
                setOpen(false);
                onSuccess?.();
              });
            }}
          >
            {isPending ? "Rejecting…" : "Reject request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ApproveButton({
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
  const [stale, setStale] = useState(false);
  const [needsOverride, setNeedsOverride] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideOpen, setOverrideOpen] = useState(false);

  function attempt(override: boolean, reason?: string) {
    setError(null);
    setStale(false);
    startTransition(async () => {
      const result = await approveRequestAction({
        reservationId,
        expectedVersion,
        override,
        overrideReason: reason,
      });
      if (!result.ok) {
        if (result.code === "STALE_RESERVATION_VERSION") {
          setStale(true);
          return;
        }
        if (!override && (result.code === "OUTSIDE_AVAILABILITY" || result.code === "ADVANCE_NOTICE_REQUIRED")) {
          setNeedsOverride(result.error);
          setOverrideOpen(true);
          return;
        }
        setError(result.error);
        return;
      }
      setOverrideOpen(false);
      onSuccess?.();
    });
  }

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <Button
          size="sm"
          disabled={isPending}
          className="bg-[var(--status-approved)] text-white hover:bg-[var(--status-approved-glow)]"
          onClick={() => attempt(false)}
        >
          <CheckCircle2 className="size-3.5" /> {isPending ? "Approving…" : "Approve"}
        </Button>
        {stale ? (
          <StaleVersionNotice />
        ) : error ? (
          <p className="max-w-48 text-right text-xs text-destructive">{error}</p>
        ) : null}
      </div>

      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve with an override</DialogTitle>
            <DialogDescription>{needsOverride}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="approve-override-reason">Override reason (required)</Label>
            <Textarea
              id="approve-override-reason"
              rows={3}
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
            />
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button
              disabled={isPending || overrideReason.trim().length === 0}
              onClick={() => attempt(true, overrideReason)}
            >
              {isPending ? "Approving…" : "Approve anyway"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AdminCancelButton({
  reservationId,
  expectedVersion,
  onSuccess,
}: {
  reservationId: string;
  expectedVersion: number;
  onSuccess?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setError(null); setStale(false); } }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <X className="size-3.5" /> Cancel
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this reservation</DialogTitle>
          <DialogDescription>
            The requester is notified. This only cancels the reservation — it never touches published availability.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="cancel-reason">Reason (optional)</Label>
          <Textarea id="cancel-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {stale ? <StaleVersionNotice /> : error ? (
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
              setStale(false);
              startTransition(async () => {
                const result = await cancelReservationAction({ reservationId, expectedVersion, reason: reason || undefined });
                if (!result.ok) {
                  if (result.code === "STALE_RESERVATION_VERSION") setStale(true);
                  else setError(result.error);
                  return;
                }
                setOpen(false);
                onSuccess?.();
              });
            }}
          >
            {isPending ? "Cancelling…" : "Cancel reservation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
