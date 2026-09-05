# C205 — Implementation Checklist

Kept up to date at the end of each step. See `ARCHITECTURE.md` for the
technical shape behind these items.

## Step 1 — Foundation, shell, navigation, reusable components ✅ (this step)

- [x] Next.js App Router + TypeScript project, Tailwind v4, shadcn/ui (Radix)
- [x] Core dependencies installed for later steps: React Hook Form, Zod,
      Supabase JS/SSR clients, date-fns + date-fns-tz, FullCalendar packages
- [x] Design tokens: light background, navy text, blue accent, subtle
      borders (`src/app/globals.css`)
- [x] Domain types matching the business rules (`src/lib/types.ts`)
- [x] Fixtures layer, hard-disabled in production (`src/lib/config.ts`,
      `src/lib/fixtures/*`)
- [x] Responsive app shell: desktop sidebar, mobile top bar + nav sheet +
      bottom tab bar (`src/components/layout/*`)
- [x] Role-aware navigation (USER vs ADMIN) via `src/lib/nav-config.ts`
- [x] Account-status gate: PENDING → pending-authorization screen;
      SUSPENDED/REJECTED/REMOVED → restricted-access screen; ACTIVE → shell
- [x] Reusable states: `EmptyState`, `ErrorState`, `LoadingState`,
      `CalendarLoadingState`, `PendingAuthorizationState`,
      `SuspendedAccountState`, `BackendNotConfiguredState`
- [x] Reusable status badges: `ReservationStatusBadge`, `AccountStatusBadge`
- [x] Marketing landing page explaining the Pending→Review→Decision→Email flow
- [x] Auth screens (login/register) — UI + client-side validation only,
      clearly marked as preview, not connected to a real backend
- [x] Placeholder screens for Calendar, My Requests, Request C205, and all
      four admin sections, each honestly empty without a backend or showing
      fixture data in development
- [x] Dev-only fixture role/status switcher and component gallery
      (`/dev/states`, 404s when fixtures are off)
- [x] `README.md`, `ARCHITECTURE.md`, this checklist

### Known gaps after this step

- No Supabase project/schema/RLS exists. No Supabase Auth wiring exists.
  Sign-in and registration are visual previews only.
- No server actions or Postgres functions exist — nothing persists.
- `requests/new` validates field shape only (required fields, end after
  start, positive participant count). The 72-hour advance-notice rule,
  overlap checks, availability enforcement, and admin overrides are not
  implemented yet — they require the database.
- FullCalendar is installed but not wired into `/calendar`; that page shows
  a static list of fixture availability windows instead.
- The mobile "date picker with a time list" is not built as the real
  booking interaction yet — only a reusable time-option generator
  (`src/lib/time-options.ts`) exists as groundwork.
- No email provider or Postgres outbox exists — no notification is ever
  sent.
- No automated tests yet.
- Dark mode CSS variables exist (shadcn convention) but there is no toggle
  UI and it hasn't been visually reviewed — light mode is the reviewed,
  intended experience for now.

### Configuration required before this step does anything real

None — this step intentionally requires zero configuration. Every screen
either renders fixture data (development) or an honest "not configured yet"
state (production). Nothing here should be mistaken for a working backend.

## Visual redesign to match usg.az ✅

Replaced the earlier "Make Space" cinematic visual system with usg.az's
own navy (`#172e35`) / orange (`#df8130`) institutional palette and Inter
typeface: rewrote `globals.css` tokens, `layout.tsx` fonts, the marketing
hero/header/footer, the shield-style `BrandMark`, and fixed sidebar/user-menu
contrast against the new dark navy surfaces. Removed the room-capsule SVG,
the scroll-jacking hero transition, and the calendar-preview morph
entirely (no longer fit the flatter institutional look). Verified visually
in a browser across the marketing page, the authenticated app shell
(sidebar, both roles), the admin accounts screen, and the login screen;
also verified `npx tsc --noEmit`, `npm run lint`, and `npm run build` all
still pass. Purely visual — no data model, auth, or booking logic changed.

### Known gaps after this step

- Not pixel-audited on every single screen (e.g. every admin sub-page,
  every form validation state) — the shared design tokens and layout
  components cover them, but only a sample was manually checked.
- The real ADA University USG crest (`public/usg-crest.png`) now replaces
  the original placeholder shield outline, used both as the header/sidebar
  brand mark and the browser tab favicon (`src/app/favicon.ico`, supplied
  directly by the user as source artwork, background keyed to transparent
  so it renders on both the light and navy surfaces). The marketing hero
  still has no photo background by design (no rights to usg.az's own
  campus photography).
- Mobile-viewport resize in the browser check didn't visibly take effect
  in this session; the mobile nav/bottom-bar were reviewed by reading the
  component code (they use light `bg-card`, not the navy sidebar, so the
  same contrast issue doesn't apply) but not re-screenshotted narrow.

## Step 2a — Database foundation ✅ (this step)

- [x] Version-controlled SQL migrations (`supabase/migrations/`):
      `profiles`, `rooms`, `availability_windows`, `blocked_intervals`,
      `reservations`, `audit_events`, `app_settings`, `email_outbox`,
      `idempotency_keys`
- [x] `btree_gist` partial exclusion constraint on `reservations` —
      overlapping APPROVED bookings are impossible, adjacent APPROVED and
      overlapping PENDING are both allowed
- [x] `profiles.role`/`account_status` protected: no client grant covers
      them; accounts are never deleted, only status-flipped to `REMOVED`,
      preserving reservation history
- [x] Row Level Security + least-privilege grants on every table (schema
      default privileges revoked up front); `anon` has zero access to any
      table
- [x] `room_occupancy` view: anonymized calendar projection with no
      requester identity, email, or purpose
- [x] SECURITY DEFINER functions for every sensitive write:
      `submit_reservation`, `decide_reservation`, `cancel_reservation`,
      `set_account_status`, `set_user_role`,
      `set_usg_notification_email` — each checks authentication, role,
      account state, and inputs; `EXECUTE` revoked from `PUBLIC`/`anon`
- [x] `src/lib/supabase/database.types.ts` generated for real via
      `npm run db:types` against a running local database — no longer
      hand-authored
- [x] `supabase/seed.sql`: local-dev-only demo accounts/reservations,
      clearly marked as never running against a hosted project
- [x] pgTAP tests (`supabase/tests/database/*.test.sql`) proving
      unauthenticated/inactive access is blocked, RLS/grant boundaries
      hold, functions enforce authorization, and the exclusion constraint
      behaves as specified — **all 36 assertions verified passing** against
      a real local Supabase/Postgres instance (`npm run db:start && npm
      run db:reset && npm run db:test`)

### Bugs found and fixed by actually running this step

Writing SQL against no live database hid real defects — exactly why the
prior "not executed" gap mattered. Running it surfaced three:

- **Infinite RLS recursion**: `is_active_admin()`/`is_active_user()` were
  `SECURITY INVOKER` functions that query `public.profiles`, but
  `profiles_select_admin`'s RLS policy calls `is_active_admin()` — so the
  function's own internal SELECT re-triggered the same policy, which
  called the function again, forever (`stack depth limit exceeded`).
  Fixed by making both helpers `SECURITY DEFINER` (safe here because the
  query is hard-scoped to `auth.uid()`, never caller-supplied input).
- **pgTAP argument-order gotcha**: this pgtap version's 3-argument
  `throws_ok(sql, code, description)` doesn't exist as its own overload —
  it resolves to a shim that puts the third argument into the *expected
  exact error message* slot, not a display description, so every such
  assertion failed even though the actual behavior was correct. Rewrote
  every call to the explicit 4-argument form:
  `throws_ok(sql, code::char(5), NULL, description)`.
- **Two test-authoring bugs** in `020_functions_authorization.test.sql`:
  the "anonymous caller" case for `decide_reservation` could never reach
  its internal `auth.uid() IS NULL` check because `EXECUTE` is already
  revoked from `anon` at the grant level (fixed by testing as
  `authenticated` with no JWT `sub` instead); and the "bystander cannot
  cancel another user's reservation" case never switched identity away
  from the reservation's own owner, so it was accidentally testing (and
  passing) the wrong scenario — RLS then also blocked the bystander from
  reading the target row's id via the old inline subquery, so the id now
  has to be captured while still authenticated as the owner, before the
  identity switch.

### Known gaps after this step

- No Supabase project is linked yet (local or hosted) — see the README for
  how to create one.
- No app code calls Supabase at all yet. `useFixtures` still governs every
  screen; nothing above is wired into the UI.
- No Supabase Auth wiring in the login/register UI — those remain visual
  previews.
- No Next.js server actions calling `submit_reservation` /
  `decide_reservation` / `cancel_reservation` yet.
- `app_settings.usg_notification_email` is seeded with an obvious
  placeholder (`replace-before-launch@usg.example.edu`), not a real
  address — must be set via `set_usg_notification_email()` before
  notifications mean anything.
- Manual admin "create/modify reservation on someone's behalf" is not
  implemented (still Step 4 scope, per the original plan).

## Step 2b — Auth wiring and account authorization (not started)

- [ ] Supabase Auth wiring: registration, email verification, session
- [ ] Admin authorization flow (PENDING → ACTIVE) replacing the fixture gate
- [ ] Replace `useFixtures` reads with real data fetching

## Step 3 — Booking engine (not started)

- [ ] Postgres functions enforcing: interval fits published availability,
      72-hour advance notice for ≥2-hour requests, no overlapping approved
      reservations (including under concurrent admin actions), admin
      override with recorded reason
- [ ] `requests/new` wired to submit real requests
- [ ] FullCalendar wired into `/calendar` for desktop
- [ ] Real mobile date-picker + time-list booking interaction

## Step 4 — User & admin screens (not started)

- [ ] My Requests backed by real data + realtime-ish status updates
- [ ] Admin reservation review (approve/reject with reason), manual
      create/modify/cancel, override with reason
- [ ] Admin availability publishing/blocking, without silently cancelling
      approved reservations
- [ ] Admin account management (authorize/reject/suspend/restore/remove)
- [ ] USG notification email setting persisted

## Step 5 — Notifications (not started)

- [ ] Transactional email provider integration
- [ ] Durable Postgres outbox, written atomically with reservation changes
- [ ] Retry for delivery failures
- [ ] All four required emails: submission (USG + requester "Pending"),
      decision, cancellation/material change

## Step 6 — Verification (not started)

- [ ] Automated tests for business rules (overlap, advance notice, override)
- [ ] Manual QA pass against every business rule in the prompt
- [ ] Accessibility pass on all interactive components
