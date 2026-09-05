# C205 — Architecture

C205 is a mobile-friendly room reservation and approval system for a
university student government (USG). This document tracks the technical
shape of the project as it's built in steps. It is kept short and updated
alongside the code, not written once and left stale.

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js (App Router), TypeScript, single deployable app |
| Database | Supabase Postgres — schema, RLS, and functions exist (`supabase/migrations`); no app code consumes them yet |
| Auth | Supabase Auth (identities exist via `auth.users`/`profiles`; login/register UI still not wired) |
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

The database schema, RLS, and privileged functions exist
(`supabase/migrations/`), but no live Supabase project has been created
from them yet, and no app code calls Supabase — `useFixtures` still
governs every screen. Supabase Auth is not wired into the login/register
UI; those screens are still visual previews only. No Next.js server
actions exist yet to call `submit_reservation`/`decide_reservation`/
`cancel_reservation`. The booking form on
`requests/new` validates shape only (required fields, end after start,
positive participant count) — the 72-hour/overlap/availability rules,
FullCalendar wiring, and the real mobile time-list interaction are explicit
follow-up work. Notifications and the email outbox don't exist yet. None of
this is faked in the UI; screens that would depend on it show a
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
