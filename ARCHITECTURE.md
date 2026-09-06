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
- **`requests/new`** (`RequestForm`) — a per-mount idempotency key
  (lazy `useState`, not a `useRef` — reading a ref inside the
  `handleSubmit` callback trips `react-hooks/refs`, since that callback
  is *constructed* during render even though it only *runs* on submit) is
  sent with every submission, so a retried request after a dropped
  network response can't create a duplicate.
- **`/calendar`** (`src/components/calendar/calendar-view.tsx`) —
  FullCalendar, read-only: published availability and blocked intervals
  as background events, `room_occupancy` as real (anonymized) events.
  Deliberately renders with `timeZone="UTC"` and pre-formats every event's
  start/end into a naive Asia/Baku wall-clock string server-side, rather
  than passing `timeZone="Asia/Baku"` straight through — FullCalendar's
  core doesn't understand named IANA zones without the separate
  `@fullcalendar/moment-timezone` plugin (not installed), and silently
  falls back to the *viewer's own browser zone* otherwise, showing the
  wrong time to anyone not physically in Baku.
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

Auth, account authorization, and the full booking engine (submit, approve,
reject, cancel, availability publishing/blocking, the desktop calendar)
are all wired to real Supabase now — both locally and on a linked hosted
project (C205-prod — see IMPLEMENTATION_CHECKLIST.md's Step 2b for its own
remaining gap, that its email templates can't be pushed until custom SMTP
is configured). What's still deferred:

- **`modify_reservation` and `create_manual_reservation` have no UI.**
  Both database functions exist and are pgTAP-tested (Step 3a); wiring an
  "edit this reservation" or "book directly on someone's behalf" admin
  screen was deprioritized in Step 3b in favor of the core submit →
  approve/reject → cancel loop.
- **`admin/settings` (the USG notification email) is still fixtures-only.**
  `set_usg_notification_email()` exists (Step 2a) but nothing calls it yet.
- **Notifications don't send.** `submit_request`/`approve_request`/
  `reject_request`/`cancel_reservation`/`modify_reservation`/
  `create_manual_reservation` all write real jobs into `email_outbox`, but
  nothing drains that queue yet (Step 5).
- **The calendar is read-only** — no drag-to-select or click-to-prefill
  the request form. Booking happens entirely through `/requests/new`.
- **A requester can't withdraw their own PENDING request** — see Step
  3a's note on the tightened state machine (`PENDING → CANCELLED` isn't a
  valid transition; only an admin rejecting achieves the equivalent).

None of this is faked in the UI; screens that would depend on it show a
`PreviewNotice` or an honest empty state instead.

The admin Approve/Reject buttons on `admin/reservations` are now clickable
(previously `disabled`) so the decision motion and card layout can be
previewed, but the resulting status change is local component state only —
a reload reverts it, nothing is written anywhere, and the page's
`PreviewNotice` says so explicitly. The illuminated `TimeSlotPicker` on
`requests/new` is a nicer-looking input, not a real availability check —
it doesn't yet know which hours are actually open or already reserved;
that lands with the booking engine step alongside the 72-hour rule.

The visual system described in "Design tokens" above (navy/orange,
matching usg.az) replaced the earlier cinematic "Make Space" system in
this same step — see git history for that prior design if it's ever
needed for reference. This was a visual-only change: no data model, auth,
or booking logic was touched, and the fixtures-honesty pattern (preview
notices, honest empty states) was kept exactly as it was.
