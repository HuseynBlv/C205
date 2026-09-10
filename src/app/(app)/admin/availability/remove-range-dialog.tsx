"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { roomLocalToUtcIso } from "@/lib/booking/timezone";
import {
  countAvailabilityWindowsInRangeAction,
  removeAvailabilityWindowsInRangeAction,
} from "@/lib/booking/availability-actions";
import { ImpactPreview } from "@/app/(app)/admin/availability/impact-preview";

function addOneDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * The bulk counterpart to publish_availability_month: that function can
 * create 20+ individual rows in one call, and until now the only way
 * back was removing each one by hand via RemoveButton. Lets an admin
 * remove every window overlapping an arbitrary date range in one
 * confirmed action instead of N individual clicks — the range end is
 * treated as inclusive (the whole end date), converted to an exclusive
 * upper bound one day later, matching how a person reads "Sep 1 to
 * Sep 30" rather than needing them to think in half-open intervals.
 */
export function RemoveRangeDialog({ roomId }: { roomId: string }) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [rangeStartIso, setRangeStartIso] = useState("");
  const [rangeEndIso, setRangeEndIso] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isCounting, setIsCounting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canPreview = Boolean(startDate && endDate) && startDate <= endDate;

  async function openPreview() {
    setError(null);
    const rangeStart = roomLocalToUtcIso(startDate, "00:00");
    const rangeEnd = roomLocalToUtcIso(addOneDay(endDate), "00:00");
    setRangeStartIso(rangeStart);
    setRangeEndIso(rangeEnd);
    setIsCounting(true);
    setOpen(true);
    const n = await countAvailabilityWindowsInRangeAction({ roomId, rangeStart, rangeEnd });
    setCount(n);
    setIsCounting(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Remove a range</CardTitle>
        <CardDescription>
          Remove every published window in one date range at once —
          faster than removing a whole month one row at a time. Never
          cancels any reservation; approved bookings keep their time
          regardless.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="remove-range-start">From</Label>
            <Input
              id="remove-range-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="remove-range-end">Through</Label>
            <Input
              id="remove-range-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <Button type="button" variant="outline" disabled={!canPreview} onClick={() => void openPreview()}>
            Preview removal
          </Button>
        </div>
        {startDate && endDate && startDate > endDate ? (
          <p className="mt-2 text-xs text-destructive">The end date must be on or after the start date.</p>
        ) : null}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isCounting
                ? "Checking how many windows this affects…"
                : count === 0
                  ? "No windows in this range"
                  : `Remove ${count} availability window${count === 1 ? "" : "s"}?`}
            </DialogTitle>
            <DialogDescription>
              {count === 0
                ? "There's nothing published between these dates — nothing to remove."
                : "This deletes every published window overlapping this range. Reservations already approved or pending keep their time either way — only what new requests can be submitted for changes."}
            </DialogDescription>
          </DialogHeader>

          {count !== null && count > 0 ? (
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Affected reservations
              </p>
              <ImpactPreview roomId={roomId} startsAt={rangeStartIso} endsAt={rangeEndIso} />
            </div>
          ) : null}

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            {count !== null && count > 0 ? (
              <Button
                variant="destructive"
                disabled={isPending}
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    const result = await removeAvailabilityWindowsInRangeAction({
                      roomId,
                      rangeStart: rangeStartIso,
                      rangeEnd: rangeEndIso,
                    });
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    setOpen(false);
                    setStartDate("");
                    setEndDate("");
                    setCount(null);
                  });
                }}
              >
                {isPending ? "Removing…" : `Remove ${count} window${count === 1 ? "" : "s"}`}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
