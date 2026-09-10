export const ROOM_NAME = "C205";
export const ROOM_TIMEZONE = "Asia/Baku";
export const ORG_NAME = "University Student Government";

/**
 * The room's fixed operating hours (its own local time, ROOM_TIMEZONE) —
 * a reservation, published availability window, or block edit can never
 * fall outside this range (enforced server-side by
 * reservation_within_room_hours and mirrored in publish/update-window
 * validation; see supabase/migrations/20260910180000_room_hours_08_to_23.sql).
 * Every time picker and calendar grid in the UI clips to this same range
 * so nothing shows a time that could never actually be booked.
 */
export const ROOM_OPEN_TIME = "08:00";
export const ROOM_CLOSE_TIME = "23:00";

/**
 * Fixtures let the UI render realistic data before the database and auth
 * layers exist, and remain useful afterward for local development.
 *
 * Safety rule: fixtures can NEVER be active in a production build, no matter
 * how the env vars are set. In development they are on by default so pages
 * are easy to preview; set NEXT_PUBLIC_USE_FIXTURES=false locally to see the
 * real "no backend configured" / empty states instead.
 */
export const useFixtures =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_USE_FIXTURES !== "false";
