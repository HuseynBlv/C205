"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ROOM_TIMEZONE } from "@/lib/config";
import { previewAvailabilityImpactAction, type AffectedReservation } from "@/lib/booking/availability-actions";

function formatRange(startsAt: string, endsAt: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: ROOM_TIMEZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${fmt.format(new Date(startsAt))} – ${fmt.format(new Date(endsAt))}`;
}

/**
 * Shows which PENDING/APPROVED reservations overlap a proposed
 * availability change before the admin confirms it — never used to
 * auto-cancel anything. Approved reservations always keep their time
 * regardless of what happens to availability/blocks around them;
 * cancelling one is a separate, explicit action elsewhere.
 */
export function ImpactPreview({ roomId, startsAt, endsAt }: { roomId: string; startsAt: string; endsAt: string }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AffectedReservation[]>([]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      setLoading(true);
      if (startsAt && endsAt) {
        previewAvailabilityImpactAction({ roomId, startsAt, endsAt }).then((data) => {
          if (active) {
            setRows(data);
            setLoading(false);
          }
        });
      } else {
        setRows([]);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [roomId, startsAt, endsAt]);

  if (loading) {
    return <Skeleton className="h-12 w-full rounded-lg" />;
  }

  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">No pending or approved reservations overlap this range.</p>;
  }

  return (
    <div className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3">
      <p className="text-xs font-medium text-foreground">
        {rows.length} reservation{rows.length === 1 ? "" : "s"} overlap this range
      </p>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="truncate">
              {r.purpose} · {formatRange(r.startsAt, r.endsAt)}
            </span>
            <Badge variant={r.status === "APPROVED" ? "secondary" : "outline"} className="shrink-0 text-[10px]">
              {r.status === "APPROVED" ? "Approved · kept as-is" : "Pending"}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}
