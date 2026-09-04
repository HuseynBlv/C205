# C205 — Architecture

C205 is a mobile-friendly room reservation and approval system for a
university student government (USG). This document tracks the technical
shape of the project as it's built in steps. It is kept short and updated
alongside the code, not written once and left stale.

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js (App Router), TypeScript, single deployable app |
| Database | Supabase Postgres (schema + RLS + functions — not yet created) |
| Auth | Supabase Auth (not yet wired) |
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

Light ground (`#f6f8fc`), navy ink (`#0f1b2d`), a single blue accent
(`#2354e6`) used for primary actions/active nav/links, and low-contrast
slate borders (`#e3e8f1`). Status colors (amber/emerald/rose/slate) are
applied directly via Tailwind utility classes in the badge components,
kept separate from the brand palette. A dark variant exists via the same
CSS-variable mechanism but has no toggle UI yet — not a priority for this
step.

## Time handling

`ROOM_TIMEZONE = "Asia/Baku"` (`src/lib/config.ts`). All fixture timestamps
are ISO 8601 / UTC; every place that displays a date or time formats it
through `Intl.DateTimeFormat` with `timeZone: ROOM_TIMEZONE` rather than
relying on the browser's local zone. The eventual schema stores
`TIMESTAMPTZ` and this same rule carries over server-side.

## What's explicitly deferred

No Supabase project, schema, RLS, or Auth wiring exists yet. No server
actions or Postgres functions exist yet. The booking form on
`requests/new` validates shape only (required fields, end after start,
positive participant count) — the 72-hour/overlap/availability rules,
FullCalendar wiring, and the real mobile time-list interaction are explicit
follow-up work. Notifications and the email outbox don't exist yet. None of
this is faked in the UI; screens that would depend on it show a
`PreviewNotice` or an honest empty state instead.
