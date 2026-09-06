/**
 * The six stable identifiers supabase/migrations/20260906100000_booking_engine.sql
 * returns as the exception message itself. Anything else (bad input shape,
 * not-found) is already a human-readable free-text message from Postgres —
 * shown as-is, not mapped.
 */
const STABLE_ERROR_MESSAGES: Record<string, string> = {
  ACCOUNT_NOT_AUTHORIZED: "Your account isn't authorized to do that.",
  ADVANCE_NOTICE_REQUIRED:
    "Requests of 2 hours or longer need to be submitted at least 72 hours in advance.",
  OUTSIDE_AVAILABILITY: "That time falls outside C205's published availability.",
  RESERVATION_CONFLICT: "That time is no longer available — it conflicts with an approved reservation.",
  INVALID_STATUS_TRANSITION: "This request can no longer be changed in that way.",
  STALE_RESERVATION_VERSION: "This request changed since you last loaded it. Refresh and try again.",
};

export type StableErrorCode = keyof typeof STABLE_ERROR_MESSAGES;

export function mapBookingError(message: string): string {
  return STABLE_ERROR_MESSAGES[message] ?? message;
}

/** The raw code if `message` is one of the six stable identifiers,
 * otherwise undefined — for client code that needs to branch on the
 * exact error (e.g. offering an override), never on the mapped display
 * text, which is free to reword. */
export function stableErrorCode(message: string): StableErrorCode | undefined {
  return message in STABLE_ERROR_MESSAGES ? (message as StableErrorCode) : undefined;
}
