import { formatInTimeZone } from "date-fns-tz";
import type { CalendarEvent } from "@/components/calendar/calendar-view";
import { ROOM_TIMEZONE } from "@/lib/config";
import { computeDaySummary, datesWithWindows } from "@/lib/booking/day-availability-client";

export interface NextAvailableSlot {
  date: string;
  startTime: string;
  endTime: string;
}

function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * The earliest bookable gap from `nowMs` onward, scanning only the dates
 * that actually have a published window (a small, already-fetched set —
 * no extra day-by-day round trips). Informational only, same staleness
 * caveat as `day-availability-client.ts`: this never substitutes for the
 * real revalidation `selection-evaluation.ts` does before a selection is
 * shown as requestable.
 */
export function findNextAvailableSlot(
  events: CalendarEvent[],
  nowMs: number,
  minDurationMinutes = 30,
): NextAvailableSlot | null {
  const todayKey = formatInTimeZone(nowMs, ROOM_TIMEZONE, "yyyy-MM-dd");
  const nowMinutesOfDay = Number(formatInTimeZone(nowMs, ROOM_TIMEZONE, "H")) * 60 + Number(formatInTimeZone(nowMs, ROOM_TIMEZONE, "m"));

  for (const date of datesWithWindows(events)) {
    if (date < todayKey) continue;
    const summary = computeDaySummary(events, date, date === todayKey ? nowMinutesOfDay : undefined);
    const fit = summary.openRanges.find((r) => r.endMin - r.startMin >= minDurationMinutes);
    if (fit) {
      return {
        date,
        startTime: minutesToHHMM(fit.startMin),
        endTime: minutesToHHMM(Math.min(fit.startMin + minDurationMinutes, fit.endMin)),
      };
    }
  }
  return null;
}
