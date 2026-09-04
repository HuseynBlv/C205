export const ROOM_NAME = "C205";
export const ROOM_TIMEZONE = "Asia/Baku";
export const ORG_NAME = "University Student Government";

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
