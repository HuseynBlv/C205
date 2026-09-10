"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReservationStatusBadge } from "@/components/status/status-badge";
import { ROOM_TIMEZONE } from "@/lib/config";
import type { Reservation } from "@/lib/booking/actions";
import { ApproveButton, RejectButton } from "@/app/(app)/admin/reservations/decision-buttons";
import { ReservationDetailsSheet } from "@/components/admin/reservation-details-sheet";

const WARNING_LABELS: Record<string, string> = {
  OUTSIDE_AVAILABILITY: "No longer fits published availability",
  RESERVATION_CONFLICT: "Now conflicts with an approved reservation",
  EXTENDED_MEETING_BUFFER_REQUIRED: "Within an hour of another approved extended meeting",
};

function formatRange(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const dateFmt = new Intl.DateTimeFormat("en-US", { timeZone: ROOM_TIMEZONE, weekday: "short", month: "short", day: "numeric" });
  const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: ROOM_TIMEZONE, hour: "numeric", minute: "2-digit" });
  return `${dateFmt.format(start)} · ${timeFmt.format(start)}–${timeFmt.format(end)}`;
}

type SortKey = "SUBMITTED_NEWEST" | "SUBMITTED_OLDEST" | "START_SOONEST" | "START_LATEST";

export function PendingQueue({
  reservations,
  warningsById,
}: {
  reservations: Reservation[];
  warningsById: Record<string, string[]>;
}) {
  const [sort, setSort] = useState<SortKey>("SUBMITTED_OLDEST");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filtered = useMemo(() => {
    let rows = reservations;
    if (from) rows = rows.filter((r) => r.starts_at.slice(0, 10) >= from);
    if (to) rows = rows.filter((r) => r.starts_at.slice(0, 10) <= to);
    const sorted = [...rows];
    sorted.sort((a, b) => {
      switch (sort) {
        case "SUBMITTED_NEWEST":
          return b.submitted_at.localeCompare(a.submitted_at);
        case "SUBMITTED_OLDEST":
          return a.submitted_at.localeCompare(b.submitted_at);
        case "START_SOONEST":
          return a.starts_at.localeCompare(b.starts_at);
        case "START_LATEST":
          return b.starts_at.localeCompare(a.starts_at);
      }
    });
    return sorted;
  }, [reservations, sort, from, to]);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Pending decision ({filtered.length})</h2>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="pending-from" className="text-[11px] text-muted-foreground">
              From
            </Label>
            <Input id="pending-from" type="date" className="h-8 w-36" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pending-to" className="text-[11px] text-muted-foreground">
              To
            </Label>
            <Input id="pending-to" type="date" className="h-8 w-36" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Sort</Label>
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="h-8 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SUBMITTED_OLDEST">Submitted: oldest first</SelectItem>
                <SelectItem value="SUBMITTED_NEWEST">Submitted: newest first</SelectItem>
                <SelectItem value="START_SOONEST">Start time: soonest</SelectItem>
                <SelectItem value="START_LATEST">Start time: latest</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map((r) => {
          const warnings = warningsById[r.id] ?? [];
          return (
            <Card key={r.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{r.purpose}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {r.requester_name} · {formatRange(r.starts_at, r.ends_at)}
                  </p>
                  {warnings.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {warnings.map((w) => (
                        <Badge key={w} variant="destructive" className="text-[10px]">
                          {WARNING_LABELS[w] ?? w}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <ReservationStatusBadge status={r.status} />
                  <ReservationDetailsSheet
                    reservation={r}
                    warnings={warnings}
                    trigger={
                      <Button size="sm" variant="ghost">
                        View
                      </Button>
                    }
                  />
                  <RejectButton reservationId={r.id} expectedVersion={r.version} />
                  <ApproveButton reservationId={r.id} expectedVersion={r.version} />
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {reservations.length === 0 ? "No requests waiting on a decision." : "No requests match this filter."}
          </p>
        ) : null}
      </div>
    </section>
  );
}
