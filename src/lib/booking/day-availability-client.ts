/**
 * Client-side, informational-only day summaries derived directly from the
 * calendar's already-fetched `events` array (windows/blocks/anonymized
 * occupancy — see calendar/page.tsx). These power the "concise availability
 * summary" and month-view indicators; they are never the authority for
 * whether a specific range can actually be booked — that stays
 * `getDayAvailabilityAction` + `evaluateRequestedRange`
 * (`selection-evaluation.ts`), called fresh at the moment of selection.
 * Being derived from `events` means this can be up to the calendar's own
 * refresh interval stale (60s, via `AutoRefresh`) — acceptable for a
 * passive summary, never acceptable for gating a submission.
 */
import type { CalendarEvent } from "@/components/calendar/calendar-view";
import { EMPTY_DAY_AVAILABILITY, type DayAvailability, type MinuteRange } from "@/lib/booking/slot-status";

export interface DaySummary {
  /** Any published window at all for this date — false means the room
   * simply isn't open that day (distinct from "open but nothing booked"). */
  hasWindows: boolean;
  /** Windows minus blocks minus approved reservations, clamped to not-yet-
   * elapsed time when the date is today. Pending requests don't subtract —
   * they're an overlay, not a block, matching the booking engine's own
   * "overlap with pending is allowed" rule. */
  openRanges: MinuteRange[];
  pendingCount: number;
  approvedCount: number;
}

type EventKind = "window" | "block" | "pending" | "approved";

interface DatedRange extends MinuteRange {
  date: string;
  kind: EventKind;
}

/** Every calendar event's start/end is a naive (no offset) Asia/Baku
 * wall-clock string — split as plain text rather than constructing a
 * `Date`, since a bare "YYYY-MM-DDTHH:mm:ss" parses as the *browser's*
 * local time in native JS. Shared with mobile-agenda.tsx, which used to
 * define this itself. */
export function splitNaive(iso: string | undefined): { date: string; time: string } | null {
  if (!iso) return null;
  const [date, time] = iso.split("T");
  if (!date || !time) return null;
  return { date, time: time.slice(0, 5) };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function datedRangesFromEvents(events: CalendarEvent[]): DatedRange[] {
  const out: DatedRange[] = [];
  for (const ev of events) {
    const kind = (ev.extendedProps as { kind?: EventKind } | undefined)?.kind;
    const start = splitNaive(typeof ev.start === "string" ? ev.start : undefined);
    const end = splitNaive(typeof ev.end === "string" ? ev.end : undefined);
    if (!kind || !start || !end || start.date !== end.date) continue;
    out.push({ date: start.date, kind, startMin: toMinutes(start.time), endMin: toMinutes(end.time) });
  }
  return out;
}

function mergeRanges(ranges: MinuteRange[]): MinuteRange[] {
  const sorted = [...ranges].sort((a, b) => a.startMin - b.startMin);
  const merged: MinuteRange[] = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.startMin <= last.endMin) {
      last.endMin = Math.max(last.endMin, r.endMin);
    } else {
      merged.push({ ...r });
    }
  }
  return merged;
}

function subtractRanges(base: MinuteRange[], subtract: MinuteRange[]): MinuteRange[] {
  let result = base.map((r) => ({ ...r }));
  for (const s of subtract) {
    const next: MinuteRange[] = [];
    for (const r of result) {
      if (s.endMin <= r.startMin || s.startMin >= r.endMin) {
        next.push(r);
        continue;
      }
      if (s.startMin > r.startMin) next.push({ startMin: r.startMin, endMin: Math.min(s.startMin, r.endMin) });
      if (s.endMin < r.endMin) next.push({ startMin: Math.max(s.endMin, r.startMin), endMin: r.endMin });
    }
    result = next.filter((r) => r.endMin > r.startMin);
  }
  return result;
}

/**
 * Summarizes one local calendar date. Pass `elapsedMinutes` (minutes since
 * midnight, room-local) only when `dateStr` is today — it's subtracted from
 * the open ranges so "already passed" time never reads as open.
 */
export function computeDaySummary(
  events: CalendarEvent[],
  dateStr: string,
  elapsedMinutes?: number,
): DaySummary {
  const dayRanges = datedRangesFromEvents(events).filter((r) => r.date === dateStr);
  const windows = mergeRanges(dayRanges.filter((r) => r.kind === "window"));
  const blocks = dayRanges.filter((r) => r.kind === "block");
  const approved = dayRanges.filter((r) => r.kind === "approved");
  const pendingCount = dayRanges.filter((r) => r.kind === "pending").length;
  const approvedCount = approved.length;

  const subtract = elapsedMinutes ? [...blocks, ...approved, { startMin: 0, endMin: elapsedMinutes }] : [...blocks, ...approved];
  const openRanges = subtractRanges(windows, subtract);

  return { hasWindows: windows.length > 0, openRanges, pendingCount, approvedCount };
}

/**
 * The same day, shaped as `DayAvailability` (windows/blocks/pending/
 * approved, each an array of ranges) rather than the reduced `DaySummary`
 * — for `getSlotStatus`/`evaluateRequestedRange` callers that need
 * per-slot detail (the mobile tap-to-select picker's live coloring), not
 * just a rollup. Same staleness caveat as everything else in this module.
 */
export function buildDayAvailabilityFromEvents(events: CalendarEvent[], dateStr: string): DayAvailability {
  const dayRanges = datedRangesFromEvents(events).filter((r) => r.date === dateStr);
  if (dayRanges.length === 0) return EMPTY_DAY_AVAILABILITY;
  return {
    windows: mergeRanges(dayRanges.filter((r) => r.kind === "window")),
    blocks: dayRanges.filter((r) => r.kind === "block").map(({ startMin, endMin }) => ({ startMin, endMin })),
    pending: dayRanges.filter((r) => r.kind === "pending").map(({ startMin, endMin }) => ({ startMin, endMin })),
    approved: dayRanges.filter((r) => r.kind === "approved").map(({ startMin, endMin }) => ({ startMin, endMin })),
  };
}

/** Every distinct date that has at least one published window, ascending. */
export function datesWithWindows(events: CalendarEvent[]): string[] {
  const dates = new Set(datedRangesFromEvents(events).filter((r) => r.kind === "window").map((r) => r.date));
  return Array.from(dates).sort();
}
