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

## Step 2 — Database, auth, and account authorization (not started)

- [ ] Supabase project + schema (`users`, `reservations`, `availability`,
      `notification_outbox`, decision/audit history)
- [ ] Row-level security matching role + account status rules
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
