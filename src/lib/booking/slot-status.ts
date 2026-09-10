/**
 * Pure, framework-free helpers for turning a day's availability windows,
 * blocked intervals, and anonymized occupancy into per-slot statuses and a
 * live client-side preview of what the backend would say about a requested
 * range. Shared between the server action that fetches the day's data
 * (`availability-query.ts`) and the client form/picker that renders it.
 *
 * All ranges are minutes-since-midnight in the room's own local calendar day
 * (Asia/Baku), already clamped to [0, 1440] by the caller — this module does
 * no timezone conversion itself.
 */

export type SlotStatus = "available" | "pending" | "approved" | "unavailable";

export interface MinuteRange {
  startMin: number;
  endMin: number;
}

export interface DayAvailability {
  /** Published open hours. */
  windows: MinuteRange[];
  /** Explicit admin blocks within (or overriding) open hours. */
  blocks: MinuteRange[];
  /** Other users' still-pending requests (anonymized — no identity). */
  pending: MinuteRange[];
  /** Other users' approved reservations (anonymized — no identity). */
  approved: MinuteRange[];
}

export const EMPTY_DAY_AVAILABILITY: DayAvailability = {
  windows: [],
  blocks: [],
  pending: [],
  approved: [],
};

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function overlapsAny(ranges: MinuteRange[], startMin: number, endMin: number): boolean {
  return ranges.some((r) => overlaps(startMin, endMin, r.startMin, r.endMin));
}

/** Is [startMin, endMin) entirely inside the union of the given windows? */
function isFullyCovered(windows: MinuteRange[], startMin: number, endMin: number): boolean {
  if (startMin >= endMin) return false;
  const sorted = [...windows].sort((a, b) => a.startMin - b.startMin);
  let cursor = startMin;
  for (const w of sorted) {
    if (w.startMin > cursor) break;
    if (w.endMin > cursor) cursor = w.endMin;
    if (cursor >= endMin) return true;
  }
  return cursor >= endMin;
}

/** Status of a single small slot (e.g. one 30-minute picker option), most
 * restrictive first: an unavailable/blocked half-hour still reads as
 * unavailable even if it also happens to overlap a pending request. */
export function getSlotStatus(day: DayAvailability, startMin: number, endMin: number): SlotStatus {
  if (!isFullyCovered(day.windows, startMin, endMin) || overlapsAny(day.blocks, startMin, endMin)) {
    return "unavailable";
  }
  if (overlapsAny(day.approved, startMin, endMin)) return "approved";
  if (overlapsAny(day.pending, startMin, endMin)) return "pending";
  return "available";
}

export type ClientValidationCode =
  | "OUTSIDE_AVAILABILITY"
  | "RESERVATION_CONFLICT"
  | "ADVANCE_NOTICE_REQUIRED";

/** Client-side preview mirroring submit_request's own checks (see
 * booking_engine.sql) so the user gets feedback before round-tripping —
 * this is advisory only; the backend re-checks everything authoritatively
 * against the true, current data. */
export function evaluateRequestedRange(
  day: DayAvailability,
  startMin: number,
  endMin: number,
  opts: { startsAtMs: number; endsAtMs: number; nowMs: number },
): { code: ClientValidationCode | null; overlapsPending: boolean } {
  if (startMin >= endMin) return { code: null, overlapsPending: false };

  const overlapsPending = overlapsAny(day.pending, startMin, endMin);

  if (!isFullyCovered(day.windows, startMin, endMin) || overlapsAny(day.blocks, startMin, endMin)) {
    return { code: "OUTSIDE_AVAILABILITY", overlapsPending };
  }
  if (overlapsAny(day.approved, startMin, endMin)) {
    return { code: "RESERVATION_CONFLICT", overlapsPending };
  }
  const durationMs = opts.endsAtMs - opts.startsAtMs;
  const leadMs = opts.startsAtMs - opts.nowMs;
  const twoHoursMs = 2 * 60 * 60 * 1000;
  const fortyEightHoursMs = 48 * 60 * 60 * 1000;
  if (durationMs >= twoHoursMs && leadMs < fortyEightHoursMs) {
    return { code: "ADVANCE_NOTICE_REQUIRED", overlapsPending };
  }
  return { code: null, overlapsPending };
}
