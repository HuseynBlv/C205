/**
 * The eight stable identifiers supabase/migrations/20260906100000_booking_engine.sql,
 * 20260910150000_extended_meeting_buffer_and_48h_notice.sql, and
 * 20260910180000_room_hours_08_to_23.sql return as the exception message
 * itself. Anything else (bad input shape, not-found) is already a
 * human-readable free-text message from Postgres — shown as-is, not
 * mapped.
 */
const STABLE_ERROR_MESSAGES: Record<string, string> = {
  ACCOUNT_NOT_AUTHORIZED: "Your account isn't authorized to do that.",
  ADVANCE_NOTICE_REQUIRED:
    "Requests of 2 hours or longer need to be submitted at least 48 hours in advance.",
  OUTSIDE_AVAILABILITY: "That time falls outside C205's published availability.",
  RESERVATION_CONFLICT: "That time is no longer available — it conflicts with an approved reservation.",
  EXTENDED_MEETING_BUFFER_REQUIRED:
    "Meetings over 2 hours need about an hour of buffer before or after another meeting that long.",
  OUTSIDE_ROOM_HOURS: "C205 can only be reserved between 8:00 AM and 11:00 PM.",
  INVALID_STATUS_TRANSITION: "This request can no longer be changed in that way.",
  STALE_RESERVATION_VERSION: "This request changed since you last loaded it. Refresh and try again.",
};

export type StableErrorCode = keyof typeof STABLE_ERROR_MESSAGES;

export function mapBookingError(message: string): string {
  return STABLE_ERROR_MESSAGES[message] ?? message;
}

/** The raw code if `message` is one of the eight stable identifiers,
 * otherwise undefined — for client code that needs to branch on the
 * exact error (e.g. offering an override), never on the mapped display
 * text, which is free to reword. */
export function stableErrorCode(message: string): StableErrorCode | undefined {
  return message in STABLE_ERROR_MESSAGES ? (message as StableErrorCode) : undefined;
}
