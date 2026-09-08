import { ROOM_NAME } from "@/lib/config";
import { roomLocalToUtcIso } from "@/lib/booking/timezone";
import { mapBookingError } from "@/lib/booking/errors";
import { evaluateRequestedRange } from "@/lib/booking/slot-status";
import { getDayAvailabilityAction } from "@/lib/booking/availability-query";
import type { CalendarSelection } from "@/components/calendar/selection-panel";

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Revalidates one picked time range against live data and shapes the
 * result for `SelectionPanel` — shared by the desktop drag-to-select
 * (`calendar-view.tsx`) and the mobile tap-to-select flow
 * (`mobile-agenda.tsx`) so both paths run the exact same checks. Always a
 * fresh server round trip (`getDayAvailabilityAction`), never the
 * calendar's own already-fetched `events` — those can be up to a minute
 * stale (see day-availability-client.ts), fine for a passive summary, not
 * for what decides whether "Continue to request" appears at all. The real
 * submission on `/requests/new` still re-checks everything again
 * regardless of what this returns.
 */
export async function evaluateTimeSelection(input: {
  roomId: string | null;
  date: string;
  startTime: string;
  endTime: string;
}): Promise<CalendarSelection> {
  const { roomId, date, startTime, endTime } = input;

  const startsAtIso = roomLocalToUtcIso(date, startTime);
  const endsAtIso = roomLocalToUtcIso(date, endTime);

  if (new Date(startsAtIso).getTime() < Date.now()) {
    return { date, startTime, endTime, blockedReason: "That time has already passed — pick a time in the future.", note: null };
  }

  if (!roomId) {
    return { date, startTime, endTime, blockedReason: `${ROOM_NAME} isn't configured yet. Contact an administrator.`, note: null };
  }

  const dayResult = await getDayAvailabilityAction({ roomId, date });
  if (!dayResult.ok) {
    return { date, startTime, endTime, blockedReason: dayResult.error, note: null };
  }

  const evaluation = evaluateRequestedRange(dayResult.data, timeToMinutes(startTime), timeToMinutes(endTime), {
    startsAtMs: new Date(startsAtIso).getTime(),
    endsAtMs: new Date(endsAtIso).getTime(),
    nowMs: Date.now(),
  });

  if (evaluation.code === "OUTSIDE_AVAILABILITY" || evaluation.code === "RESERVATION_CONFLICT") {
    return { date, startTime, endTime, blockedReason: mapBookingError(evaluation.code), note: null };
  }

  return {
    date,
    startTime,
    endTime,
    blockedReason: null,
    note:
      evaluation.code === "ADVANCE_NOTICE_REQUIRED"
        ? mapBookingError("ADVANCE_NOTICE_REQUIRED")
        : evaluation.overlapsPending
          ? "This overlaps another pending request — you can still request it; USG decides in submission order."
          : null,
  };
}
