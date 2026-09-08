# C205 — Architecture

C205 is a mobile-friendly room reservation and approval system for a
university student government (USG). This document tracks the technical
shape of the project as it's built in steps. It is kept short and updated
alongside the code, not written once and left stale.

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js (App Router), TypeScript, single deployable app |
| Database | Supabase Postgres — schema, RLS, and functions (`supabase/migrations`); real reads/writes for auth and account authorization, reservations still pending Step 3 |
| Auth | Supabase Auth via `@supabase/ssr`, fully wired: registration, login, logout, email verification, password reset, admin authorization |
| Styling | Tailwind CSS v4 + shadcn/ui (Radix primitives) |
| Forms | React Hook Form + Zod |
| Desktop scheduling | FullCalendar (deps installed, not yet wired) |
| Mobile booking | Date field + time-list picker (deps in place, not yet wired) |
| Email | Transactional provider + durable Postgres outbox (not yet built) |

## Why one app, no separate backend

All data access and mutations run as Next.js server operations (Server
Actions / Route Handlers) calling Postgres directly (via Supabase) or through
Postgres functions for anything transactional (the approval workflow,
overlap checks). There is no separate Java/API backend — this keeps the
request→approval→notification pipeline in one deployable unit with one
source of truth for authorization.

## Domain model (`src/lib/types.ts`)

- `AppUser` — `role: USER | ADMIN` is separate from `accountStatus: PENDING
  | ACTIVE | REJECTED | SUSPENDED | REMOVED`. Registration + email
  verification only gets a user to `PENDING`; an administrator must move
  them to `ACTIVE` before they can request the room.
- `ReservationRequest` — `status: PENDING | APPROVED | REJECTED | CANCELLED`,
  plus `adminOverride` / `overrideReason` and full decision metadata
  (`decidedAt`, `decidedBy`, `rejectionReason`) so history is never lost.
- `AvailabilityWindow` — published open hours / blocked dates, date-scoped.

These types are the contract the eventual Postgres schema must satisfy.
They intentionally match the business rules in the prompt (e.g. overlap and
advance-notice rules operate on `startsAt`/`endsAt`, both `TIMESTAMPTZ`).

## Database schema (`supabase/`)

Version-controlled SQL migrations under `supabase/migrations/`, applied in
order by the Supabase CLI. No app code reads from this yet — `useFixtures`
still governs every screen (see below) — this is the schema/RLS/functions
layer only, landed ahead of wiring it into the UI.

- `profiles` — one row per `auth.users` identity (auto-created by an
  `on_auth_user_created` trigger). `role`/`account_status` mirror
  `src/lib/types.ts`'s `UserRole`/`AccountStatus` exactly, and are
  protected columns: no client GRANT covers them at all, so they're only
  changeable via `set_user_role()` / `set_account_status()`. Accounts are
  never deleted (`auth.users` FK is `ON DELETE RESTRICT`) — removal is
  always `account_status = 'REMOVED'`, which is what keeps historical
  requester information and reservation history intact.
- `rooms` — seeded with C205, `timezone = 'Asia/Baku'`.
- `availability_windows`, `blocked_intervals` — published open hours and
  blackout periods; admin-write, active-user-read.
- `reservations` — `requester_name`/`requester_email` are point-in-time
  snapshots taken at submission, not a live join, so history reads
  correctly even after a requester's profile changes or is removed.
  Carries submission/decision/cancellation metadata and an
  auto-incrementing `version` column (optimistic-concurrency signal; the
  real correctness guarantee against concurrent admin decisions is
  row-level locking inside the decision functions, not client-side version
  comparison). No direct INSERT/UPDATE/DELETE grant exists for any
  client role — every write goes through `submit_reservation()`,
  `decide_reservation()`, or `cancel_reservation()`.
- A partial exclusion constraint
  (`reservations_no_overlapping_approved`, using `btree_gist` on
  `room_id` + `tstzrange(starts_at, ends_at, '[)')` `where status =
  'APPROVED'`) makes overlapping approved bookings impossible at the
  database level, while still allowing adjacent approved bookings and any
  number of overlapping pending requests.
- `room_occupancy` — a view exposing only `id`/`room_id`/`starts_at`/
  `ends_at`/`status`, with no requester identity, email, or purpose. This
  is what other users' calendars are built from; it deliberately runs with
  the view owner's privileges (not `security_invoker`) so it can show
  everyone's occupancy without giving callers row access to the underlying
  `reservations` table.
- `audit_events` — append-only (`BEFORE UPDATE/DELETE` triggers raise on
  any attempt), written only from inside the SECURITY DEFINER functions.
- `app_settings` — single-row config (`usg_notification_email`), writable
  only via `set_usg_notification_email()`, never by direct UPDATE.
- `email_outbox` — durable notification queue; no client grant at all,
  reserved for a future sending worker using the service-role key.
- `idempotency_keys` — scoped `(scope, key)` records so a retried
  `submit_reservation()` call can't create a duplicate reservation.

### Row Level Security and grants

Least-privilege by default: schema-level default privileges are revoked
up front (`alter default privileges ... revoke all ...`), so every table
and function must be explicitly granted access rather than inheriting
Supabase's normally-broad defaults. In summary:

| Role | Can |
|---|---|
| `anon` (unauthenticated) | Nothing — no grant on any table |
| Any authenticated account | Read/edit only their own `profiles` row (never `role`/`account_status` — not in the column grant) |
| `PENDING`/`SUSPENDED`/`REJECTED`/`REMOVED` account | Their own profile row only — enough to explain their status, nothing else |
| `ACTIVE` account | Read rooms/availability/blocks, read their own reservations in full, read everyone's via the anonymized `room_occupancy` view, call `submit_reservation`/`cancel_reservation` |
| `ACTIVE` `ADMIN` | All of the above, plus read every reservation/profile, write availability/blocks/rooms directly, and call `decide_reservation`/`set_account_status`/`set_user_role`/`set_usg_notification_email` |

`audit_events`, `email_outbox`, and `idempotency_keys` have **no** policy
and **no** grant for `anon`/`authenticated` at all — only the SECURITY
DEFINER functions (which run as the table owner) can touch them.

### Functions (`supabase/migrations/20260905120500_functions.sql`)

Every sensitive write goes through one of: `submit_reservation`,
`decide_reservation`, `cancel_reservation`, `set_account_status`,
`set_user_role`, `set_usg_notification_email`. Each is `SECURITY DEFINER`
with `set search_path = ''` and fully-qualified references (so it can't be
hijacked by a malicious search_path), checks `auth.uid()` is present, loads
and checks the caller's own `role`/`account_status`, validates its inputs,
and writes its own `audit_events` row (decision/cancellation functions also
enqueue an `email_outbox` row). `EXECUTE` is revoked from `PUBLIC`/`anon` on
every one of them and granted only to `authenticated` — authorization is
enforced by the runtime checks inside the function, not by which Postgres
role can call it. `is_active_user()`/`is_active_admin()` are the two
`SECURITY DEFINER` helper predicates RLS policies use; both only ever read
the caller's own profile row (`auth.uid()`, never caller-supplied input) —
they must run as DEFINER rather than INVOKER because the `profiles_select_admin`
policy calls `is_active_admin()`, and an INVOKER function would re-trigger
that same policy on its own internal SELECT, recursing forever.

### Tests (`supabase/tests/database/*.test.sql`)

pgTAP tests, run via `supabase test db`:
`010_rls_and_grants.test.sql` proves unauthenticated/inactive/active access
boundaries (including that `room_occupancy` has no `requester_id` column
at all, not just a filtered one); `020_functions_authorization.test.sql`
proves the SECURITY DEFINER functions reject unauthenticated, wrong-role,
and wrong-account-state callers; `030_exclusion_constraint.test.sql` proves
the overlap rule directly against the table. **All 36 assertions across
the three files have been run and pass** against a local Supabase/Postgres
instance (`npm run db:start && npm run db:reset && npm run db:test`) — see
`IMPLEMENTATION_CHECKLIST.md`'s Step 2a for the real bugs that first run
surfaced (an RLS recursion in the `is_active_*` helpers, and a pgtap
argument-order gotcha in how these files originally called `throws_ok`).

A follow-up migration (`20260905130000_auth_hardening.sql`, Step 2b) added:
a `profiles.email_verified_at` column mirrored from
`auth.users.email_confirmed_at` by a trigger, so RLS policies can gate on
"is this email verified" without needing a grant on the `auth` schema;
`is_active_user`/`is_active_admin` and the reservation functions now also
require it; last-active-administrator protection in `set_account_status`/
`set_user_role` (a `pg_advisory_xact_lock` shared across every path that
can change the active-admin count, so two concurrent attempts to remove
the last two admins can't both succeed); and `bootstrap_first_admin()`,
the one-time, self-only, zero-admins-required first-administrator setup
function. `supabase/tests/database/040_auth_hardening.test.sql` covers all
of it, including a live proof that a status change takes effect against
an *already-simulated* session with unchanged JWT claims — see
[[project-c205]] for the bugs this step's actual (non-pgTAP) testing found
on top of that.

## Authentication (`src/lib/auth/`, `src/proxy.ts`, `src/lib/supabase/`)

Real Supabase Auth via `@supabase/ssr`, following its current documented
SSR pattern rather than the older `auth-helpers` packages:

- **`src/lib/supabase/client.ts`** — browser client (anon key only).
- **`src/lib/supabase/server.ts`** — server client for Server Components/
  Actions/Route Handlers, built from `next/headers` cookies with the
  `getAll`/`setAll` interface `@supabase/ssr` expects.
- **`src/proxy.ts`** + **`src/lib/supabase/proxy.ts`** (`updateSession`) —
  Next.js 16 renamed `middleware.ts` to `proxy.ts` (see AGENTS.md); this
  refreshes the auth cookie on every request (Server Components can't
  write cookies themselves) and does one *optimistic* redirect-if-signed-
  out check for `/calendar`, `/requests`, `/admin*`. Per Next's own
  guidance this is not a security boundary — a Server Action reachable
  outside the matcher must still protect itself, which is why every
  action in `src/lib/auth/actions.ts` and `src/lib/admin/actions.ts` also
  re-verifies independently.
- **`src/lib/auth/dal.ts`** — the single Data Access Layer function that
  decides identity: `getVerifiedUser()` calls `supabase.auth.getClaims()`,
  never `getSession()`. `getClaims()` cryptographically verifies the JWT
  (locally via the project's JWKS once it uses asymmetric signing keys;
  this project's local/HS256 setup makes it transparently fall back to
  the same Auth-server round trip `getUser()` makes) — either way the
  token is genuinely re-checked, not just decoded from a cookie a client
  could have tampered with. `getCurrentProfile()` then does a live
  `profiles` read — role/account_status/email_verified_at are **never**
  cached across requests or embedded in a custom JWT claim, which is
  exactly what makes a suspension or role change take effect on the very
  next request without needing the existing token to expire or be
  reissued. Both are wrapped in React's `cache()` to dedupe within one
  render pass.
- **`src/lib/auth/actions.ts`** — `signUpAction`, `signInAction`,
  `signOutAction`, `requestPasswordResetAction`, `updatePasswordAction`,
  `resendVerificationEmailAction`. All Server Actions, which get Next's
  built-in CSRF protection for free (the framework compares the request's
  `Origin` to `Host` and rejects a mismatch before the action body runs) —
  this is why every mutation in this app is a Server Action rather than a
  hand-rolled Route Handler, and no separate CSRF token machinery exists.
- **`src/app/auth/confirm/route.ts`** — the one Route Handler in the auth
  flow, because email links are GETs. Handles both signup confirmation
  and password recovery via the current `token_hash` + `type` pattern
  (`supabase.auth.verifyOtp`), then redirects with an explicit
  `Cache-Control: private, no-store` header. A GET performing a state
  change here is fine, unlike a typical CSRF-vulnerable GET: the
  unforgeable secret *is* the token_hash in the URL, not an ambient
  cookie, so there's nothing for a forged cross-site request to reuse. See
  `supabase/templates/*.html` and IMPLEMENTATION_CHECKLIST.md for why
  custom email templates are required for this route to ever receive a
  `token_hash` at all (the CLI's default template uses GoTrue's own
  legacy `/verify` endpoint and an implicit-flow URL fragment instead).
- **Account-status gating** (`src/components/layout/real-account-status-gate.tsx`,
  used from `src/app/(app)/layout.tsx` when fixtures are off) — two gates,
  both re-derived from the live profile on every request, checked in this
  order: email verification first (an `EmailVerificationRequiredState`,
  with a resend action), then `account_status` (`PendingAuthorizationState`
  for PENDING; `SuspendedAccountState` for SUSPENDED/REJECTED/REMOVED;
  otherwise the real `AppShell`). These are the same presentational
  components the Step 1 fixtures preview already used — only the data
  source changed, from `FixtureSessionProvider`'s client state to a
  server-rendered live database read.
- **`src/app/admin-setup/`** — the controlled, idempotent
  first-administrator setup flow. Not linked from any navigation. Requires
  (1) a signed-in, email-verified caller, (2) a server-only
  `ADMIN_BOOTSTRAP_SECRET` compared with `crypto.timingSafeEqual`, and (3)
  `bootstrap_first_admin()`'s own database-level check that zero active
  admins currently exist — so even if the app-layer secret were somehow
  bypassed, the database still refuses to create a second "first" admin,
  concurrently or otherwise.
- **`src/lib/admin/actions.ts`** — `authorizeAccountAction`,
  `rejectAccountAction`, `suspendAccountAction`, `restoreAccountAction`,
  `removeAccountAction`, each a thin wrapper around the
  `set_account_status` RPC. `src/app/(app)/admin/accounts/page.tsx` lists
  every profile (RLS already limits this to admins) and renders one of
  these per row as a plain `<form action={...}>` — no client JS needed.
- **`src/components/admin/require-admin.tsx`** — takes an optional
  `isAdmin` prop computed server-side from a real profile; when omitted it
  falls back to the fixture role-switcher context. `admin/reservations`,
  `admin/availability`, and `admin/settings` pass a real `isAdmin` too now
  (their underlying data is still Step 3/4 fixtures-only) — see
  IMPLEMENTATION_CHECKLIST.md.

## Booking engine (`supabase/migrations/20260906100000_booking_engine.sql`)

The authoritative C205 scheduling operations, each a transactional
Postgres function invoked with the caller's own identity (`auth.uid()`) —
no app code calls them yet (Step 3b).

**Locking.** Every function below acquires the same lock first: the
room's own row in `public.rooms` (`select ... for update`), in the same
order every time (room, then the specific reservation row once its id is
known, never the reverse). With one room this fully serializes every
scheduling write; the correctness this buys isn't hypothetical — it was
proven with two real concurrent connections holding overlapping
approvals, not just asserted (see IMPLEMENTATION_CHECKLIST.md's Step 3a
for the actual timestamps). The exclusion constraint from the
reservations migration is unchanged and still the final guarantee below
the lock, exactly as before.

**Availability fit.** `reservation_fits_availability(room, starts, ends)`
answers "does this interval sit entirely inside the union of published
availability, minus anything blocked?" using native PG14+ multirange
containment (`tstzrange <@ range_agg(...)`) rather than manual gap-
stitching — this is what lets two adjacent published windows (9-12 and
12-15) correctly cover a request spanning both without extra logic.
`reservation_overlaps_approved(room, starts, ends, exclude_id)` is the
separate, simpler check against existing APPROVED rows. Both are
`SECURITY DEFINER` so they see the complete picture regardless of the
original caller's own RLS visibility (a regular user's own reservations
RLS would otherwise silently under-count conflicts).

**The functions**, in the order a reservation moves through them:

- `submit_request` — active+verified account required; identity and
  PENDING status always derived server-side; validates future start,
  positive duration, purpose, participants; must fit availability; rejects
  overlap with APPROVED (permits overlapping PENDING); 72-hour notice for
  ≥2-hour requests. `submitted_at` is `clock_timestamp()` captured *after*
  the room lock — `now()` is frozen at transaction start and would predate
  however long the call waited on the lock, undermining the whole point of
  timestamping "when this was actually submitted." Idempotency
  (`idempotency_keys`, now keyed by `(scope, requester_id, key)` with a
  stored `payload` to detect a changed-payload replay) lets a client retry
  a network failure safely.
- `approve_request` — active admin, PENDING, matching `p_expected_version`
  required. Re-checks availability and approved-conflicts at approval
  time, not just submission time; advance notice is evaluated against
  the *original* `submitted_at`, so a slow-to-decide admin can't turn a
  compliant request into a violation just by sitting on it. An explicit,
  audited override can bypass availability-fit and advance-notice — never
  the approved-overlap check, which stays absolute (the exclusion
  constraint would refuse the `UPDATE` anyway).
- `reject_request` — PENDING → REJECTED, admin-only, version-checked.
- `cancel_reservation` — **APPROVED → CANCELLED only.** The full state
  machine this migration implements is exactly `PENDING → APPROVED |
  REJECTED` and `APPROVED → CANCELLED` — no `PENDING → CANCELLED` edge. A
  requester can't withdraw their own still-pending request in this
  version; an admin rejecting it is the equivalent path today.
- `modify_reservation` — admin-only; revalidates the *new* interval
  exactly like submission, requiring an override reason only when the new
  values actually need one. The approved-overlap check is absolute
  regardless of override. Any raised exception rolls back the entire
  function — a failed modification is provably a no-op, not just assumed
  to be one (see the pgTAP file).
- `create_manual_reservation` — admin-only; creates and approves in one
  atomic step and sends exactly one confirmation email, deliberately never
  the "pending" receipt `submit_request` sends.
- `publish_availability_window` / `remove_availability_window` /
  `create_blocked_interval` / `remove_blocked_interval` — availability
  writes now go through these locked functions instead of a direct table
  grant (the direct `INSERT`/`UPDATE`/`DELETE` grants for `authenticated`
  were revoked) — a raw client write here would have made the room lock
  meaningless for every other function that depends on it. Blocking time
  never touches existing reservations; see the next paragraph.
- `reservation_conflict_warnings(reservation_id)` — read-only, derived,
  mutates nothing. When a block or a competing approval makes a PENDING
  request no longer fit or no longer conflict-free, it stays exactly
  PENDING; this function is how a caller finds out why approving it as-is
  would now fail, without the system silently rejecting or cancelling
  anything on their behalf.

**Stable errors.** Six identifiers are returned as the exception message
text itself, so client code can match on it directly:
`ACCOUNT_NOT_AUTHORIZED`, `ADVANCE_NOTICE_REQUIRED`,
`OUTSIDE_AVAILABILITY`, `RESERVATION_CONFLICT`,
`INVALID_STATUS_TRANSITION`, `STALE_RESERVATION_VERSION`. Other
situational validation errors (bad input shape, not-found) keep the
codebase's existing free-text convention since they aren't part of this
specific contract.

## Booking engine UI wiring (`src/lib/booking/`, `src/components/calendar/`)

The app-code side of the booking engine — Server Actions calling each
Postgres function above, and the pages that use them.

- **`src/lib/booking/actions.ts`** — `submitRequestAction`,
  `cancelReservationAction`, `approveRequestAction`, `rejectRequestAction`,
  `createManualReservationAction` (RPC wrapper exists; no UI calls it
  yet), `getConflictWarnings`. Each maps a stable error code to
  user-facing copy via `src/lib/booking/errors.ts`, and revalidates every
  path whose data it could have changed.
- **`src/lib/booking/availability-actions.ts`** — the four availability/
  block mutation wrappers, same pattern.
- **`src/lib/booking/timezone.ts`** — `roomLocalToUtcIso(date, time)`
  combines a local date + time-of-day, interpreted in `ROOM_TIMEZONE`
  (Asia/Baku), into the UTC ISO string the RPCs expect
  (`date-fns-tz`'s `fromZonedTime`). This exact kind of naive-timestamp-
  vs-session-timezone mismatch is what broke `supabase/seed.sql` (see
  IMPLEMENTATION_CHECKLIST.md's Step 3b "Bugs found") — this helper is
  the one place in app code that does the conversion, so it only had to
  be gotten right once.
- **`src/lib/booking/slot-status.ts`** — pure, framework-free helpers
  shared between the server (`availability-query.ts`, below) and the
  client form: `getSlotStatus` turns a day's windows/blocks/pending/
  approved ranges into one of `available`/`pending`/`approved`/
  `unavailable` for a single slot, and `evaluateRequestedRange` mirrors
  `submit_request`'s own checks (fit, approved-overlap, 72h/2h advance
  notice) to preview what the backend would say about a candidate range
  — advisory only; the backend re-checks everything authoritatively.
- **`src/lib/booking/availability-query.ts`** — a Server Action,
  `getDayAvailabilityAction(roomId, date)`, that fetches one local
  calendar day's `availability_windows`, `blocked_intervals`, and
  `room_occupancy` (never the base `reservations` table — no other
  user's identity/purpose is ever fetched for this purpose) and converts
  every row into Asia/Baku minutes-since-midnight, clamped to that day.
- **`requests/new`** (`RequestForm`) — as the user picks a date, it calls
  `getDayAvailabilityAction` and colors every start/end slot in
  `TimeSlotPicker` by real status (icon + color, via `SlotStatusLegend` —
  never color alone), and shows a live, non-blocking validation preview
  from `evaluateRequestedRange` before the user submits. A pending
  overlap is shown as an informational note, never treated as blocking —
  only an approved overlap or an outside-hours slot reads as
  unavailable, matching `submit_request`'s own rules. The idempotency key
  is derived from the actual submitted payload (room/time/purpose/
  participants): resubmitting the *same* payload after a dropped network
  response reuses the same key, but editing anything before resubmitting
  mints a fresh one — tracked in `useState`, never a `useRef` (reading a
  ref inside the `handleSubmit` callback, even transitively through a
  called function, trips `react-hooks/refs`, since that callback is
  *constructed* during render even though it only *runs* on submit). If
  a submission is rejected because the slot became unavailable after the
  page loaded, the form preserves every field, refreshes the day's
  availability in place, and says so explicitly rather than resetting.
- **`requests/requests-list.tsx`** and **`requests/[id]/page.tsx`** — a
  client-side status-filter (All/Pending/Approved/Rejected/Cancelled/
  Past) over the requester's own already-fetched rows, and a per-request
  detail page whose privacy is enforced by RLS itself
  (`reservations_select_own`/`_admin`), not app logic: a request that
  exists but belongs to someone else comes back empty, indistinguishable
  from "doesn't exist."
- **`src/components/states/error-state.tsx`** and **`loading.tsx`**
  route files — a real Supabase query failure now renders a distinct
  "something went wrong, Retry" state (never silently as an empty list),
  and the `LoadingState`/`CalendarLoadingState` skeletons built in Step 1
  are finally wired to a route via Next's `loading.tsx` convention.
- **`src/lib/hooks/use-refresh-on-focus.ts`** / **`AutoRefresh`** — plain
  polling (window focus/visibility + a fixed interval calling
  `router.refresh()`), deliberately not realtime infrastructure:
  calendar, My Requests, and both admin screens refresh every 60s; the
  request form's own availability fetch refreshes every 45s, since it's
  the most time-sensitive screen open.
- **`/calendar`** (`src/components/calendar/calendar-view.tsx`) —
  FullCalendar, read-only: published availability and blocked intervals
  as background events, `room_occupancy` as real (anonymized) events.
  Deliberately renders with `timeZone="UTC"` and pre-formats every event's
  start/end into a naive Asia/Baku wall-clock string server-side, rather
  than passing `timeZone="Asia/Baku"` straight through — FullCalendar's
  core doesn't understand named IANA zones without the separate
  `@fullcalendar/moment-timezone` plugin (not installed), and silently
  falls back to the *viewer's own browser zone* otherwise, showing the
  wrong time to anyone not physically in Baku. See "Calendar redesign"
  below for the full custom header/event/mobile-agenda treatment built
  on top of this same data.
- **`admin/reservations`** — real pending/decided lists, `Approve`/
  `Reject` buttons calling the Server Actions above, and
  `reservation_conflict_warnings` rendered as badges on pending items.
- **`admin/availability`** — real window/block lists with inline
  publish/block forms and per-row `Remove` buttons.
- **`@fullcalendar/react` was pinned to `^7.0.2` while `core`/`daygrid`/
  `timegrid`/`interaction` were pinned to `^6.1.21`** since Step 1 — a
  genuine major-version mismatch nothing had exercised until this step
  first rendered a `<FullCalendar>` component. Fixed by pinning
  `@fullcalendar/react` back to `^6.1.21` to match the rest, rather than
  upgrading everything to 7.x (which pulls in a new
  `@full-ui/headless-calendar` peer dependency not worth taking on here).

## Calendar redesign (`src/components/calendar/`)

Purely presentational — `calendar/page.tsx`'s data fetch, the UTC-faking
timezone trick, and every RLS/query contract above are unchanged. What
changed is how that same data is drawn.

- **`calendar-toolbar.tsx`** — a compact custom header replacing
  FullCalendar's own (`headerToolbar={false}` on the `<FullCalendar>`
  element itself): grouped prev/next, a secondary "Today" button, a
  quiet range label, the existing `Tabs` component reused as a Week/
  Month segmented control, and a quiet timezone label. It holds no
  calendar state — every action calls the FullCalendar API directly
  through a ref (`calendarRef.current.getApi().prev()/.next()/
  .today()/.changeView()`), and `datesSet` feeds the range label and
  "is this the current period" flag back into React state.
- **`calendar-view.tsx`** — desktop FullCalendar (`hidden md:block`)
  and the mobile agenda (`md:hidden`) are both always mounted; Tailwind
  responsive classes pick which one is visible, avoiding any
  viewport-detection JS and the SSR/hydration mismatches that come
  with it. Two content-generation callbacks matter here:
  - `eventContent` renders custom markup (status dot, time, label,
    room chip) only for occupancy events (`extendedProps.kind` is
    `"pending"`/`"approved"`) — availability/block background events
    keep FullCalendar's default (plain color fill, `undefined`
    returned). Events under ~40 minutes, or any event in month view,
    collapse to a single dot+time line instead of truncating text.
  - `dayHeaderContent`/`dayCellContent` render the small-weekday-label
    + big-date-number header and the "today" filled-circle badge.
    Both branch on `arg.view.type` (FullCalendar's own live value)
    rather than being conditionally swapped based on React's `view`
    state — the latter raced with FullCalendar's internal view-change
    timing and briefly rendered week-view header content inside month
    view.
  - `now={fakeBakuNow}` re-labels the real current instant as Baku
    wall-clock-but-tagged-UTC, the same trick used for every event's
    start/end — without it, the now-indicator line would sit at
    *real-UTC*-now's position, 4 hours off from actual Baku time. A
    real, previously invisible bug from Step 3b's original
    `nowIndicator` addition; this is the first thing to scrutinize its
    exact position.
- **`calendar.css`** — restyles FullCalendar mostly through its own
  CSS custom-property theming layer (`--fc-border-color`,
  `--fc-page-bg-color`, `--fc-now-indicator-color`,
  `--fc-non-business-color`, etc.) rather than fighting its markup:
  a warm off-white surface, fine low-contrast grid lines, a quiet
  cobalt now-indicator, rounded/shadowed event blocks, a diagonal
  hatch for `.fc-non-business` (unavailable) time, and a restrained
  radial-gradient glow behind the whole container.
- **`calendar/page.tsx`** additions — `computeScheduleRange` derives
  `slotMinTime`/`slotMaxTime` from the actual earliest-start/latest-end
  across published availability windows (padded, clamped), replacing a
  fixed 7am–9pm. `computeBusinessHours` derives one `businessHours`
  rule per ISO weekday that has at least one published window (that
  weekday's own hours) — a weekday with none gets no rule, so
  FullCalendar shades its whole column with the hatch pattern via
  `.fc-non-business`. Both are display-only computations; nothing here
  changes what a submission is validated against. Every event now
  also carries `extendedProps.kind` (`"window" | "block" | "pending" |
  "approved"`) — the discriminator both the desktop custom event
  content and the mobile agenda read, so neither has to guess status
  from a background-color string.
- **`calendar-legend.tsx`** — Available/Pending/Reserved/Unavailable,
  icon + color + label, under the calendar on both desktop and mobile.
- **`mobile-agenda.tsx`** — the seven-column week grid never renders
  below the `md` breakpoint; instead, a horizontally scrollable date
  strip (14 days, 44px+ touch targets) plus a vertical timeline of the
  selected day, reading the exact same `events` array as the desktop
  view. Parses each event's naive datetime string as plain text
  (`"2026-09-08T09:00:00".split("T")`) rather than constructing a
  `Date` — a bare ISO-looking string with no offset parses as the
  *browser's local time* in native JS, which would silently misgroup
  events for any viewer not in Baku; string-splitting sidesteps the
  ambiguity entirely rather than fighting it. Its sticky "Request
  C205" button uses `position: sticky; bottom: 5rem`, not `fixed`,
  specifically so it settles just above the app shell's own fixed
  mobile bottom nav instead of overlapping it.
- **A real, pre-existing responsive bug surfaced and fixed**: the app
  shell's own content column (`app-shell.tsx`,
  `flex min-h-dvh flex-1 flex-col`) had no `min-w-0`, so at narrow
  widths its descendants' content-based minimum width silently forced
  the whole page wider than the viewport — the classic flexbox
  "min-width: auto" gotcha. Not specific to the calendar; no earlier
  page's content had been wide/complex enough to trigger it. Fixed
  with one `min-w-0` there, plus two more on the mobile agenda's own
  horizontally-scrolling date strip and its wrapper.
- Two new tokens in `globals.css`, `--cal-surface` (warm off-white) and
  `--cal-accent` (cobalt blue), deliberately distinct from `--primary`
  (brand orange, reserved for CTAs elsewhere) — everything else
  (status colors, grid lines, borders) reuses existing tokens directly.

## Calendar interactivity (`src/lib/booking/reservation-details.ts`, `src/components/calendar/`)

An app-layer feature on top of the pre-existing RLS policies from the
database schema section above — no new migration, no new Postgres
function. The only new authorization logic is which *fields* to show
once a row has already cleared RLS.

- **`reservation-details.ts`**'s `getReservationDetailsAction` fetches
  one reservation `.single()` under the caller's own session and derives
  a tier from what came back: no row → bystander (RLS hid it, or it
  doesn't exist — indistinguishable by design, same as the existing
  `requests/[id]` page); a row where `requester_id !== caller` →
  bystander with the row's public fields; `requester_id === caller` →
  owner; caller is an active admin → admin. The bystander/owner/admin
  field lists are enforced here in code, but the *rows a caller can
  read at all* remain entirely RLS's job — this function adds no new
  database access path.
- **`reservation-panel.tsx`**'s `ReservationPanel` is the `Sheet`
  (desktop: right; mobile: bottom, `useMediaQuery("(min-width: 768px)")`
  picks the side) opened by clicking/tapping a calendar event. It's
  handed an instant `fallback` (the calendar's own already-fetched
  status/start/end, converted through `roomLocalToUtcIso` since the
  calendar's naive Baku strings aren't real UTC — see "Bugs found"
  below) so it never opens empty, then replaces that with the tiered
  fetch's fuller result. An `onSuccess`-driven `refreshKey` re-runs the
  fetch after an in-panel action (Approve/Reject/Cancel/Modify) — a
  `revalidatePath` refreshes the calendar's own event list but not this
  panel's separately-fetched snapshot.
- **`calendar-view.tsx`** drives the panel's open/closed state from a
  `?event=<id>` URL query param (`useSearchParams`/`useRouter`/
  `usePathname`) rather than local component state, so back/forward
  navigation, not just an explicit close, correctly opens/closes it; a
  dedicated `useEffect` returns keyboard focus to the exact triggering
  `data-event-id` element after close (replacing the underlying Radix
  `Dialog`'s own auto-focus-restore, which doesn't survive that DOM node
  being recreated by a data refresh). `eventDidMount` adds `tabindex`,
  `role="button"`, a status-only `aria-label`, and an Enter/Space
  keydown handler directly to FullCalendar's own event DOM nodes, since
  they aren't natively focusable; the same hover listeners there drive a
  small quick-preview popover showing only the bystander-tier fields —
  never anything a click wouldn't also reveal.
- **Available-time selection** — `selectable` (disabled in month view via
  a per-view `views` override) plus a `select` handler (`handleSelect`)
  that revalidates the picked range with the exact same pure logic the
  request form already uses (`evaluateRequestedRange` from
  `slot-status.ts`, `getDayAvailabilityAction` from
  `availability-query.ts`) before deciding what to show — a valid range
  renders `selection-panel.tsx`'s summary and a "Continue to request"
  link to `/requests/new?date=&start=&end=`; an invalid one (past,
  outside published hours, blocked, or conflicting with an approved
  reservation) renders a specific reason instead and never links to a
  request form at all. `/requests/new` reads those query params as a
  loose prefill only (`requests/new/page.tsx`,
  `RequestFormInitialSelection`) — the real submission revalidates
  everything from scratch server-side regardless of what the URL says.
- Motion stays local and cause-driven: a 180–260ms transition on the
  event block, an outline+elevation on the selected event
  (`eventClassNames` + `.fc-event.cal-event-selected` in `calendar.css`),
  and the panel's own slide-in — nothing calendar-wide or continuous.

### Bugs found and fixed by actually running this step

- **A timezone bug caught while wiring the fallback, not from a failed
  test**: the calendar's event `start`/`end` are naive Asia/Baku strings
  meant only for FullCalendar's `timeZone="UTC"` display trick (see the
  Calendar redesign section above) — feeding one straight into
  `ReservationPanel`'s real-timezone formatters (which expect genuine
  UTC-with-offset, matching what the authorized fetch returns) would
  have silently shown the wrong time to any viewer outside Baku. Fixed
  by converting the fallback through `roomLocalToUtcIso(date, time)`
  first.
- **The panel didn't refresh after a successful in-panel admin action** —
  approving from the panel left it showing stale "Pending" content and
  invalid Approve/Reject buttons even after the underlying event turned
  green, since `revalidatePath` doesn't touch the panel's own separately
  client-fetched snapshot. Caught by clicking Approve and watching the
  panel, not by reading the code. Fixed with the `onSuccess`/`refreshKey`
  mechanism described above, careful to only clear shown content on a
  genuine reservation-id change so a same-id refetch never flashes a
  loading skeleton.
- **"Continue to request" silently did nothing on click**: the link
  lives in `SelectionPanel`, outside FullCalendar's own grid DOM, so the
  click was also read by FullCalendar's default `unselectAuto`
  outside-click behavior (`unselect={() => setSelection(null)}`), which
  unmounted the panel/link mid-click before navigation ran — confirmed
  by testing the same destination via a direct URL, which worked.
  Fixed by removing the `unselect` prop entirely; the selection now only
  clears via the panel's own dismiss button, a new selection, or
  navigating away.

## Calendar UX improvements (`src/lib/booking/{day-availability-client,next-available,selection-evaluation}.ts`, `src/components/calendar/`)

A discoverability/feedback/navigation pass on the calendar interactivity
section above. No business rule changed; every gating decision still
goes through the exact same `getDayAvailabilityAction` +
`evaluateRequestedRange` path — the additions here are either purely
informational (derived from data already on the client) or navigation
conveniences (view memory, deep links).

- **`day-availability-client.ts`** — pure functions turning the
  calendar's already-fetched `events` (windows/blocks/anonymized
  occupancy) into per-date rollups, entirely client-side, no server
  round trip: `computeDaySummary` (open ranges after subtracting blocks
  and approved reservations — never pending, which is an overlay, not a
  block — clamped to not-yet-elapsed time when the date is today) for
  the day-summary line and month-view dots; `buildDayAvailabilityFromEvents`
  (the fuller `DayAvailability` shape `slot-status.ts` already defines)
  for the mobile tap-to-select picker's live per-slot coloring;
  `datesWithWindows` for scanning candidates. Explicitly never the
  authority for whether a range can be booked — it can be up to the
  calendar's own 60s refresh interval stale, fine for a passive summary,
  not for a gating decision.
- **`next-available.ts`**'s `findNextAvailableSlot` scans only the
  (small, already-known) set of dates with a published window for the
  earliest open gap from "now," reusing `computeDaySummary` per
  candidate date rather than a day-by-day server scan.
- **`selection-evaluation.ts`**'s `evaluateTimeSelection` is
  `calendar-view.tsx`'s old inline `handleSelect` validation, extracted
  so the desktop drag-select grid and the new mobile tap-to-select flow
  (`mobile-agenda.tsx`) call the identical revalidation — always a fresh
  `getDayAvailabilityAction` call, never the client's own `events` —
  producing the same `CalendarSelection` shape `SelectionPanel` renders
  either way.
- **`CalendarDaySummary`** (new component) renders one "focused" date's
  status in three distinct copy paths — no published window at all
  ("isn't open"), a window with nothing left to book ("fully booked" +
  counts), or real open time (+ "no reservations yet" vs. actual
  pending/approved counts) — so "nothing booked" and "room unavailable"
  never read the same way. `focusedDate` lives in `CalendarView`,
  auto-derived from navigation (today if visible, else the range's first
  day) except when a month-view `dateClick` or the "Next available"
  action sets it explicitly — tracked via an `explicitFocusRef` so the
  `datesSet` callback that fires right after doesn't immediately
  override an explicit choice back to "today" (a real bug, see below).
- **View memory**: `calendar-view.tsx` persists `{view, date}` to
  `localStorage` on every `datesSet` and restores it in a mount effect
  (not `initialView`/`initialDate`, to stay SSR-safe — this causes one
  accepted visible snap from the default "this week" to the restored
  view rather than an SSR/hydration mismatch risk). This single
  mechanism satisfies both "remember the last view on this device" and
  "return to the previously viewed week after closing a request": the
  latter is really just this component remounting after a round trip
  through `/requests/new` and reading the same stored value back. The
  reservation *details* panel needs no such handling — it's a `?event=`
  query param on the same route, so the view is never disturbed by
  opening/closing it.
- **Month view as an overview**: `dayCellContent`'s month branch now
  renders a date number plus up to three small status dots from a
  once-per-`events`-change `Map<date, DaySummary>` (`monthSummaries` in
  `calendar-view.tsx`); `calendar.css` hides every raw event chip in
  month view (`.fc-dayGridMonth-view .fc-daygrid-day-events`,
  `.fc-bg-event { display: none }`) so the dots are the only content —
  no per-event text at month granularity. A `dateClick` handler (guarded
  to `dayGridMonth` only, the same `arg.view.type` branching pattern
  `dayHeaderContent`/`dayCellContent` already used) switches to the week
  view anchored on the clicked date.
- **Sticky toolbar + scroll-to-now**: the desktop toolbar wrapper is now
  `sticky top-0` (desktop has no other sticky top bar to conflict with —
  that's mobile-only, `Topbar`'s own `md:hidden`). Entering the week view
  scrolls FullCalendar's own now-indicator arrow (or, absent one, the
  grid's first slot, already anchored near the earliest published hour
  by the existing `computeScheduleRange`) into view via a plain DOM
  `scrollIntoView` — `height="auto"` means the calendar has no internal
  scroll container of its own, so this scrolls the page.
- **Mobile flow**: `mobile-agenda.tsx` gained a genuine tap-to-select
  path — tapping an "Available" timeline entry expands inline Start/End
  `TimeSlotPicker`s (the same shared, tap-friendly, no-drag control the
  request form uses) defaulting to "now rounded up" through a clamped
  1-hour span, and "Review time" calls the same `evaluateTimeSelection`
  desktop uses. `SelectionPanel` itself is now responsive
  (`useMediaQuery`): the existing inline banner on desktop, a genuine
  `Sheet` (`side="bottom"`) on mobile — the brief's exact "summary bottom
  sheet" step. `focusedDate` (the date strip's selection) was lifted out
  of `MobileAgenda` into `CalendarView`, so desktop's day summary and
  mobile's timeline share one notion of "the day being looked at."
- **`NavButton`** (`components/shared/nav-button.tsx`) wraps every
  "start a request" entry point (header/mobile "Request C205,"
  "Continue to request," the post-submit "View on calendar") in a
  `router.push` guarded by `useTransition`'s pending state, so a rapid
  double click/tap can't fire the navigation twice. `request-form.tsx`
  now also carries the created reservation's id through to its success
  screen for that last link.

### Bugs found and fixed by actually running this step

- **A timezone bug in the day summary's "elapsed minutes" calculation**:
  computed as raw ms arithmetic against `Date.parse(dateStr +
  "T00:00:00Z")` — but that instant is Baku's *4am*, not its midnight
  (Baku is UTC+4), so every "now" cutoff was silently off by the zone's
  exact offset. Caught by comparing the summary's own displayed time
  against the grid's own now-indicator line position. Fixed by deriving
  elapsed minutes from `formatInTimeZone`'s own Baku wall-clock
  hour/minute, the pattern already used everywhere else in this file.
- **A month-view `dateClick` could have its explicit focus immediately
  overwritten**: the `datesSet` callback that fires right after the
  resulting `changeView` unconditionally re-derives `focusedDate` from
  "is today visible in this range" — so clicking a date in the same week
  as today snapped the summary back to today. Fixed with an
  `explicitFocusRef` consumed (and cleared) by the very next
  `datesSet`, rather than that callback always winning.
- **"Next available" could point "backwards"**: it originally showed
  whenever the globally-next slot's date differed from the focused
  date, which fired even when the focused day already had plenty of
  open time and the "next" slot was actually on an earlier, already-
  visible date. Fixed by keying the action purely on the focused day's
  own open-range emptiness.
- **Closing the reservation panel via `router.back()` could land on the
  wrong page**: correct for a panel opened by clicking an event on
  `/calendar` itself, but the new "View on calendar" link pushes
  straight to `/calendar?event=<id>` with no plain `/calendar` entry
  beneath it in history — so the in-app close button sent the user to
  whatever preceded that link (the just-submitted request form) instead.
  Fixed by having `closeEvent` push a deterministic event-less URL
  rather than relying on history depth; real browser back/forward are
  unaffected (a separate, `popstate`-driven path).
- **The mobile picker's pre-selected default could be scrolled out of
  view**: "now rounded up" often lands mid-row in the 7am–9pm option
  list, off-screen at the picker's initial scroll position. Fixed with a
  `scrollIntoView` effect on the shared `TimeSlotPicker` keyed on
  `value` — also benefits the request form's own picker after a
  calendar-selection prefill.
- **The new scroll-to-now effect ignored `prefers-reduced-motion`**: it
  passes `behavior: "smooth"` directly to `scrollIntoView`, which, as an
  explicit JS option, overrides the project's existing global
  `prefers-reduced-motion` CSS rule (a universal
  `transition-duration`/`animation-duration` override with no power over
  a JS-specified scroll behavior). Fixed by checking
  `window.matchMedia("(prefers-reduced-motion: reduce)")` directly.

## Administrator dashboard (`supabase/migrations/20260907100000_admin_dashboard.sql`, `src/app/(app)/admin/`)

The Step 3a/3b booking engine covered submit/approve/reject/cancel and
single-window availability publish/block. This section covers what the
admin dashboard needed on top of that: editing an existing window/block
in place, publishing a whole month of recurring hours atomically, and
letting an admin actually see the audit trail — plus the app-layer UI
for functions that already existed but had no screen
(`create_manual_reservation`, `modify_reservation`).

**New database functions**, all following the exact same convention as
Step 3a's (room-lock-first, SECURITY DEFINER, audited):

- **`update_availability_window`** / **`update_blocked_interval`** —
  admin-only edits. Editing a window also runs the merge step below;
  editing a block never does (each block carries its own reason, and
  merging two would silently lose one).
- **`_merge_adjacent_availability_windows(room_id)`** — an internal
  helper, not granted to any client role, called at the end of both
  `publish_availability_window` (now `create or replace`d to call it)
  and `update_availability_window`. It merges any windows for a room
  that overlap or exactly touch into one row, and leaves windows with
  a genuine gap alone. This is purely for tidiness of the *stored*
  rows — `reservation_fits_availability`'s `range_agg`/`<@` containment
  check already treats back-to-back windows as continuous for actual
  booking purposes (see the "Booking engine" section above), so nothing
  about correctness depended on this; it exists so an admin looking at
  the availability list doesn't see fragmented duplicate-looking rows
  after repeated publish/edit calls.
- **`publish_availability_month(room_id, month, weekdays[],
  start_time, end_time, excluded_dates[], label)`** — one transactional
  call for "these weekdays, these hours, this whole month, minus these
  dates," rather than the app looping N separate publishes (N separate
  transactions, each independently interruptible). Locks the room once
  for the whole batch and is the first function to read
  `rooms.timezone` (a column that existed since Step 2a but nothing
  ever queried) instead of assuming Asia/Baku, converting each matching
  date's wall-clock hours to `timestamptz` itself.
- **`audit_events_select_admin`** — an RLS policy (plus the matching
  grant) letting admins finally read `audit_events`. The table stays
  append-only for every role regardless (`audit_events_immutable()`
  still blocks UPDATE/DELETE) — this only adds SELECT.

**App layer:**

- **Request-details panel** (`components/admin/reservation-details-sheet.tsx`)
  — a side sheet (built on the same Radix `Dialog` primitive as
  `Sheet`) showing every field the spec asked for (requester identity,
  submission time, interval, purpose, participants, status, version,
  decision/override info), with Approve/Reject/Cancel/Modify inline.
- **Approve/reject/modify's override-and-stale-version handling**
  (`admin/reservations/decision-buttons.tsx`,
  `modify-reservation-dialog.tsx`) — every one of these mutations can
  fail with `OUTSIDE_AVAILABILITY`/`ADVANCE_NOTICE_REQUIRED` (retry
  with `override: true` and a required reason), `RESERVATION_CONFLICT`
  (absolute, no retry), or `STALE_RESERVATION_VERSION` (the version the
  admin has is already wrong — the only honest response is "refresh and
  decide again," never a blind retry). Client code branches on
  `ActionResult`'s `code: StableErrorCode` field
  (`src/lib/booking/errors.ts`'s `stableErrorCode()`), not on the
  mapped display text, so a copy change can never silently break this
  branching (see "Bugs found" in IMPLEMENTATION_CHECKLIST.md's Step 4b
  entry — the first draft got this wrong).
- **`ImpactPreview`** (`admin/availability/impact-preview.tsx`) — shown
  before confirming an edit, removal, or new block: which
  PENDING/APPROVED reservations overlap the affected range, with
  approved ones explicitly labeled "kept as-is." This is a plain query
  against `reservations` (admin RLS already grants full read access),
  not a new RPC. Closing availability never cancels anything — cancel
  is a separate, explicit action everywhere in this app; the preview
  exists so an admin knows who might need that separate action, not so
  the UI can take it automatically.
- **Monthly publish form** (`admin/availability/monthly-publish-form.tsx`)
  — weekday checkboxes, an hour range, a month picker, and an
  excluded-dates list, with a live preview computed entirely
  client-side (plain date arithmetic — no round trip) before calling
  `publish_availability_month`.
- **Audit log** (`admin/audit/`) — every `audit_events` row, newest
  first, with category tabs and the actor's name pulled in through
  Supabase's foreign-key embedding (`actor:profiles(full_name)`).
- **Settings** (`admin/settings`) — the USG notification email is now
  a real form against `set_usg_notification_email()` (existed since
  Step 2a, never had a UI), mirroring its server-side email-format
  check on the client for immediate feedback.

## Fixtures vs. production (`src/lib/config.ts`)

```ts
export const useFixtures =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_USE_FIXTURES !== "false";
```

This is the one flag that decides whether the UI reads `src/lib/fixtures/*`
or renders the real (currently empty, since there's no backend yet) state.
It is **hard-disabled in production** regardless of env vars — fixtures can
never leak into a deployed build. In development it defaults on so every
screen is easy to preview, and can be turned off locally
(`NEXT_PUBLIC_USE_FIXTURES=false`) to see genuine empty/not-configured
states.

A floating "fixture preview" control (`components/layout/dev-role-switcher.tsx`,
bottom-right, flask icon) lets you flip between `USER`/`ADMIN` and every
`accountStatus` to see the corresponding shell, nav, and blocking state —
without a real backend. It only renders when `useFixtures` is true.

## Route structure

```
src/app/
  layout.tsx                 root shell: fonts, metadata, TooltipProvider
  (marketing)/                public site
    layout.tsx                header/footer, sign in / create account links
    page.tsx                  landing page — workflow explainer, CTAs
  (auth)/                     centered auth card layout
    login/page.tsx            sign-in UI (preview — not yet wired to Supabase)
    register/page.tsx         registration UI (preview)
  (app)/                      authenticated application
    layout.tsx                 gate: fixtures → shell, else "not configured"
    calendar/page.tsx          published availability preview
    requests/page.tsx          "My Requests" — status history
    requests/new/page.tsx      "Request C205" — submission form (client-side
                                validation only; business rules land with the
                                booking engine)
    admin/
      reservations/page.tsx    review queue + decision history (admin-gated)
      availability/page.tsx    publish/block hours (admin-gated)
      accounts/page.tsx        authorize/suspend/restore (admin-gated)
      settings/page.tsx        USG notification email (admin-gated)
  dev/states/page.tsx          component/state gallery (fixtures only, 404s otherwise)
```

Admin pages are wrapped in `components/admin/require-admin.tsx`, a
client-side convenience gate. It is **not** the authorization boundary — the
real one is server-side (RLS + server actions), built in the auth/database
step. "Enforce permissions beyond the interface" means the UI gate is
cosmetic; nothing here should be trusted as security.

## Application shell

- `components/layout/app-shell.tsx` — desktop: fixed sidebar (brand, nav
  grouped by Workspace/Administration, user menu). Mobile: top bar (menu
  sheet + brand + avatar) and a bottom tab bar for the three primary actions
  (Calendar, Request C205, My Requests), so the core workflow never needs
  more than a thumb's reach on a phone.
- The brand mark in both the sidebar and the mobile top bar (`Topbar`) is a
  link to `/` — a way back to the public marketing page from anywhere in
  the authenticated app, `/calendar` included. `(marketing)/layout.tsx`
  reads the caller's own session (`getVerifiedUser()`, skipped under
  `useFixtures`) so that page never greets an already-signed-in visitor
  with "Sign in" / "Create account": `SiteHeader` shows a single "Go to
  calendar" button instead, and the footer's "Sign in" link disappears.
  Since `/` now varies per visitor, it's in `proxy.ts`'s
  `isSessionSensitive` set (an exact `pathname === "/"` match, not a
  prefix) alongside `/login`/`/register`/etc., so it gets the same
  never-shared-cache treatment — and is why `/` moved from a statically
  prerendered route to a dynamic one in the build output.
- `components/layout/account-status-gate.tsx` — the workflow gate. An
  `ACTIVE` user sees the shell; `PENDING` sees
  `pending-authorization-state`; `SUSPENDED` / `REJECTED` / `REMOVED` see
  `suspended-account-state`. This is where "registration doesn't grant
  access" becomes a real, reachable screen instead of a rule in a doc.

## Reusable components

- `components/status/status-badge.tsx` — `ReservationStatusBadge` and
  `AccountStatusBadge`, one source of truth for status colors/labels/icons.
- `components/states/*` — `EmptyState`, `ErrorState`, `LoadingState` /
  `CalendarLoadingState`, `PendingAuthorizationState`,
  `SuspendedAccountState`, `BackendNotConfiguredState`. Every page composes
  from these rather than inventing its own empty/error copy.
- `components/shared/preview-notice.tsx` — flags any screen whose action
  isn't wired to a backend yet, so nothing looks more finished than it is.

## Design tokens (`src/app/globals.css`)

C205 is styled as part of https://www.usg.az/ (ADA University's United
Student Government site), matched closely rather than loosely inspired:
deep navy ink (`#172e35`, used for the header, hero, footer, and app
sidebar), a single warm orange accent (`#df8130`) reserved for primary
CTAs and brand touches, a plain white ground for content, and the Inter
typeface throughout — no serif/display font, no cinematic treatment.
Status colors (amber/gold pending, emerald approved, muted red rejected/
cancelled) are defined as shared `--status-*` custom properties and kept
deliberately distinct from `--primary` (orange), so a "Pending" badge
never visually reads as a call-to-action button. An unrelated `.dark`
variant exists via the same CSS-variable mechanism but has no toggle UI —
not a priority for this step.

### Brand mark (`src/components/layout/brand-mark.tsx`)

Renders the real ADA University USG crest (`public/usg-crest.png`,
supplied directly by the user as source artwork; background keyed to
transparent so the white shield reads correctly on any surface). Also
used as the browser tab favicon (`src/app/favicon.ico`). `tone="dark"` is
used wherever the mark sits on the navy header/sidebar/footer;
`tone="light"` (default) everywhere else. Any component placed on the navy
sidebar (`UserMenu`, sidebar nav items) takes the same
`tone`/`sidebar-*`-token pattern for the same reason — text color must
follow the surface it's actually drawn on, not a single global default.

### Booking motion

`src/components/booking/time-slot-picker.tsx` renders time slots as a
horizontally scrollable row of buttons rather than a plain dropdown.
`use-slot-travel-glow.tsx` animates a small dot from the clicked slot to
the reservation summary panel on `requests/new` (a functional affordance,
kept through the redesign; it inherits the new orange accent
automatically via `var(--primary)`), and no-ops under reduced motion. The
admin reservations screen (`admin/reservations/page.tsx`) is a client
component with local optimistic Approve/Reject state (item moves from
"Pending decision" to "Decision history") — this is UI motion only, not
persistence; see the fixtures note below.

## Time handling

`ROOM_TIMEZONE = "Asia/Baku"` (`src/lib/config.ts`). All fixture timestamps
are ISO 8601 / UTC; every place that displays a date or time formats it
through `Intl.DateTimeFormat` with `timeZone: ROOM_TIMEZONE` rather than
relying on the browser's local zone. The eventual schema stores
`TIMESTAMPTZ` and this same rule carries over server-side.

## What's explicitly deferred

Auth, account authorization, the full booking engine, and the
administrator dashboard (queue, availability publishing/editing, manual
booking, modification, cancellation, account management, audit history,
settings) are all wired to real Supabase now — both locally and on a
linked hosted project (C205-prod — see IMPLEMENTATION_CHECKLIST.md's Step
2b for its own remaining gap, that its email templates can't be pushed
until custom SMTP is configured). What's still deferred:

- **Notifications don't send.** `submit_request`/`approve_request`/
  `reject_request`/`cancel_reservation`/`modify_reservation`/
  `create_manual_reservation` all write real jobs into `email_outbox`, but
  nothing drains that queue yet (Step 5).
- **The calendar is read-only** — no drag-to-select or click-to-prefill
  the request form. Booking happens entirely through `/requests/new`.
- **A requester can't withdraw their own PENDING request** — see Step
  3a's note on the tightened state machine (`PENDING → CANCELLED` isn't a
  valid transition; only an admin rejecting achieves the equivalent).
- **The pending queue's sort/filter and the audit log's category tabs
  are client-side over the full fetched dataset** — no server-side
  pagination yet, fine at this app's current scale.

None of this is faked in the UI; screens that would depend on it show a
`PreviewNotice` or an honest empty state instead.

The visual system described in "Design tokens" above (navy/orange,
matching usg.az) replaced the earlier cinematic "Make Space" system in
the foundation step — see git history for that prior design if it's ever
needed for reference. This was a visual-only change: no data model, auth,
or booking logic was touched, and the fixtures-honesty pattern (preview
notices, honest empty states) was kept exactly as it was.
