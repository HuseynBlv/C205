"use client";

import { ArrowRight, CalendarX2, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ROOM_NAME } from "@/lib/config";
import type { DaySummary } from "@/lib/booking/day-availability-client";
import type { NextAvailableSlot } from "@/lib/booking/next-available";

function formatDateShort(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTimeFromMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${period}`;
}

function formatOpenRanges(ranges: { startMin: number; endMin: number }[]) {
  return ranges.map((r) => `${formatTimeFromMinutes(r.startMin)}–${formatTimeFromMinutes(r.endMin)}`).join(", ");
}

/**
 * The "concise availability summary for the selected day" from the
 * interactivity brief — plain-language, three distinct states so "nothing
 * booked yet" never reads the same as "the room isn't open today":
 * no published window at all, a published window with no time left, or a
 * published window with real open time (plus reservation counts). Purely
 * informational, computed from the calendar's own already-fetched events
 * (see day-availability-client.ts) — never gates anything itself.
 */
export function CalendarDaySummary({
  dateStr,
  summary,
  nextAvailable,
  onJumpToNextAvailable,
}: {
  dateStr: string;
  summary: DaySummary;
  nextAvailable: NextAvailableSlot | null;
  onJumpToNextAvailable: (slot: NextAvailableSlot) => void;
}) {
  const dateLabel = formatDateShort(dateStr);
  // Only worth surfacing when the focused day itself has nothing open —
  // if it already has real open time, a next-available jump elsewhere
  // (possibly to an *earlier* date, like a still-open "today" after
  // navigating ahead) would read as backwards rather than useful.
  const showNextAvailable = nextAvailable && summary.openRanges.length === 0;

  let body: React.ReactNode;
  if (!summary.hasWindows) {
    body = (
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <CalendarX2 className="size-4 shrink-0 text-muted-foreground/70" aria-hidden="true" />
        {ROOM_NAME} isn&apos;t open on {dateLabel}.
      </p>
    );
  } else if (summary.openRanges.length === 0) {
    body = (
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <CalendarX2 className="size-4 shrink-0 text-muted-foreground/70" aria-hidden="true" />
        Fully booked for the rest of {dateLabel}
        {summary.approvedCount > 0 ? ` · ${summary.approvedCount} reserved` : ""}
        {summary.pendingCount > 0 ? ` · ${summary.pendingCount} pending` : ""}
      </p>
    );
  } else {
    const noReservations = summary.pendingCount === 0 && summary.approvedCount === 0;
    body = (
      <p className="flex items-center gap-1.5 text-sm text-foreground">
        <CircleCheck className="size-4 shrink-0 text-[var(--status-available)]" aria-hidden="true" />
        <span>
          {dateLabel}: {formatOpenRanges(summary.openRanges)} open
          {noReservations
            ? " · no reservations yet"
            : ` · ${summary.pendingCount ? `${summary.pendingCount} pending` : ""}${
                summary.pendingCount && summary.approvedCount ? " · " : ""
              }${summary.approvedCount ? `${summary.approvedCount} reserved` : ""}`}
        </span>
      </p>
    );
  }

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      {body}
      {showNextAvailable && nextAvailable ? (
        <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => onJumpToNextAvailable(nextAvailable)}>
          Next available: {formatDateShort(nextAvailable.date)} at {formatTimeFromMinutes(
            Number(nextAvailable.startTime.split(":")[0]) * 60 + Number(nextAvailable.startTime.split(":")[1]),
          )}
          <ArrowRight className="size-3" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
