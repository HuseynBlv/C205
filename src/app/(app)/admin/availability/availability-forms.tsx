"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { localDateTimeToUtcIso as toUtcIso } from "@/lib/booking/timezone";
import {
  createBlockedIntervalAction,
  publishAvailabilityWindowAction,
} from "@/lib/booking/availability-actions";

export function PublishAvailabilityForm({ roomId }: { roomId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [label, setLabel] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Publish availability</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              const result = await publishAvailabilityWindowAction({
                roomId,
                startsAt: toUtcIso(startsAt),
                endsAt: toUtcIso(endsAt),
                label: label || undefined,
              });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setStartsAt("");
              setEndsAt("");
              setLabel("");
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="avail-start">Starts</Label>
            <Input
              id="avail-start"
              type="datetime-local"
              required
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="avail-end">Ends</Label>
            <Input
              id="avail-end"
              type="datetime-local"
              required
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="avail-label">Label (optional)</Label>
            <Input
              id="avail-label"
              placeholder="Weekday hours"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? "Publishing…" : "Publish"}
          </Button>
        </form>
        {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}

export function CreateBlockForm({ roomId }: { roomId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Block a time</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              const result = await createBlockedIntervalAction({
                roomId,
                startsAt: toUtcIso(startsAt),
                endsAt: toUtcIso(endsAt),
                reason,
              });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setStartsAt("");
              setEndsAt("");
              setReason("");
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="block-start">Starts</Label>
            <Input
              id="block-start"
              type="datetime-local"
              required
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="block-end">Ends</Label>
            <Input
              id="block-end"
              type="datetime-local"
              required
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="block-reason">Reason</Label>
            <Input
              id="block-reason"
              placeholder="Facilities maintenance"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <Button type="submit" size="sm" variant="outline" disabled={isPending}>
            {isPending ? "Blocking…" : "Block"}
          </Button>
        </form>
        {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
