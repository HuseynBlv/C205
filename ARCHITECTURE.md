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

The "Make Space" visual system: warm off-white ground (`#faf7f1`), dark
navy ink (`#141c30`), a single cobalt accent (`#2b4de0`), and status colors
— amber (pending), emerald (approved), muted red (rejected/cancelled) —
defined as shared `--status-*` custom properties (`globals.css`) rather than
only inline Tailwind palette classes, so the calendar, badges, and the hero
capsule can all reference the same colors. An unrelated `.dark` variant
still exists via the same CSS-variable mechanism but has no toggle UI —
not a priority for this step.

A second, separately-scoped set of tokens (`.hero-scene-vars` /
`.hero-scene`) defines the cinematic marketing hero's midnight palette
(deep charcoal, blue/amber glow). This is deliberately **not** the app's
dark mode — it's a fixed atmospheric backdrop for the landing page only;
the authenticated application is always the light workspace.

### The room capsule (`src/components/marketing/room-capsule.tsx`)

The one visual spectacle in the product: an SVG "doorway" frame holding a
grid of glowing time blocks (available / pending / reserved), reused at
three scales — full detail in the hero, simplified as the recurring
`BrandMark` spatial-outline icon, and echoed in the calendar preview's
color language. `src/components/marketing/hero-transition.tsx` is the
signature moment: a scroll-pinned section that fades/scales the capsule
into a real calendar-shaped preview as the visitor scrolls past the hero.
It's pure CSS transform/opacity driven by a rAF-throttled scroll listener
(no animation library), and does nothing (renders the two states
statically stacked, no pin, no listener) under `prefers-reduced-motion`.

### Booking motion

`src/components/booking/time-slot-picker.tsx` replaces the old plain
dropdown with illuminated "window" buttons. `use-slot-travel-glow.tsx`
animates a small glow from the clicked slot to the reservation summary
panel on `requests/new`, and also no-ops under reduced motion. The admin
reservations screen (`admin/reservations/page.tsx`) is a client component
with local optimistic Approve/Reject state (glow-ring transition, item
moves from "Pending decision" to "Decision history") — this is UI motion
only, not persistence; see the fixtures note below.

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

The admin Approve/Reject buttons on `admin/reservations` are now clickable
(previously `disabled`) so the decision motion and card layout can be
previewed, but the resulting status change is local component state only —
a reload reverts it, nothing is written anywhere, and the page's
`PreviewNotice` says so explicitly. The illuminated `TimeSlotPicker` on
`requests/new` is a nicer-looking input, not a real availability check —
it doesn't yet know which hours are actually open or already reserved;
that lands with the booking engine step alongside the 72-hour rule.
