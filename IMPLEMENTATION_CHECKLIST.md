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

## Step 2b — Auth wiring and account authorization ✅ (this step)

- [x] Registration, login, logout, email verification, and password reset —
      all real Supabase Auth, via `src/lib/auth/actions.ts` (Server Actions)
      and `src/app/auth/confirm/route.ts` (the `token_hash`/`verifyOtp`
      link handler both flows share)
- [x] Custom local email templates (`supabase/templates/*.html`) so
      confirmation/recovery links point at `/auth/confirm` with a
      `token_hash` instead of GoTrue's own legacy `/verify` endpoint — see
      "Known gaps" below, this is also required hosted configuration
- [x] Server-side identity verification via `supabase.auth.getClaims()`
      (never `getSession()`) in a single Data Access Layer
      (`src/lib/auth/dal.ts`), `cache()`-wrapped per request
- [x] Two independent access gates, both re-derived from a live `profiles`
      read on every request, never from the JWT: email verification, then
      administrator authorization (`RealAccountStatusGate`) — PENDING,
      SUSPENDED, REJECTED, REMOVED, and an unverified-email state each get
      their own screen; ACTIVE + verified reaches the real app shell
- [x] `src/proxy.ts` (Next.js 16 renamed `middleware.ts` → `proxy.ts`, see
      AGENTS.md) refreshes the session cookie every request and redirects
      signed-out visitors away from `/calendar`, `/requests`, `/admin*` —
      an optimistic check only; the real boundary is the DAL + database
- [x] Admin account authorization UI (`/admin/accounts`) wired to real
      `set_account_status` calls: Authorize, Reject, Suspend, Restore,
      Remove — moved out of Step 4 into this step, since "administrator
      authorization" is exactly what this step's gating model needs to
      demonstrate end-to-end
- [x] Controlled, idempotent first-administrator bootstrap: `/admin-setup`
      (unlinked from navigation) + `bootstrap_first_admin()` — requires a
      verified caller, a server-only `ADMIN_BOOTSTRAP_SECRET`, and the
      database's own zero-admins check (same advisory-lock guard as
      last-admin protection, so two simultaneous bootstrap attempts can't
      both succeed)
- [x] Last-active-administrator protection against removal/suspension,
      including concurrent attempts (`pg_advisory_xact_lock`, added in
      Step 2a's follow-up migration — see that step's entry below)
- [x] CSRF/origin protection: every mutation is a Next.js Server Action,
      which enforces its own Origin-vs-Host check before the action body
      ever runs (framework-level, not something this app implements
      itself) — see Next's own `data-security` guide
- [x] `Cache-Control: private, no-store` on every session-bearing response
      (proxy.ts for the app/auth pages, `/auth/confirm`'s route handler
      directly) so a shared cache can never serve one session's response
      to a different visitor
- [x] Safe, non-enumerating messages: signup and password-reset both
      return the same generic confirmation regardless of whether the email
      already has an account (matches Supabase's own anti-enumeration
      behavior, deliberately not overridden)
- [x] Privileged credentials never reach browser code —
      `SUPABASE_SERVICE_ROLE_KEY` is unused by any app code (every
      privileged write goes through a SECURITY DEFINER function instead);
      confirmed with a repo-wide grep, not just by inspection
- [x] All hardened against a real, running local Supabase instance — not
      just pgTAP: manually verified signup → Mailpit → confirm →
      pending-authorization screen → admin authorizes → real access →
      admin suspends → **the same still-valid session cookie loses access
      on its very next request** → password reset via Mailpit → old
      password rejected, new one works → privilege-escalation and
      last-admin RPC calls rejected — see "Bugs found" below for what that
      surfaced

### Bugs found and fixed by actually running this step

- **Seeded demo accounts couldn't sign in at all.** `supabase/seed.sql`
  inserted `auth.users` rows without `confirmation_token`,
  `recovery_token`, `email_change_token_new`, or `email_change` — those
  four columns have no database default (unlike `phone_change` and
  friends, which default to `''`), so GoTrue's own query left them `NULL`
  and its Go code failed with `converting NULL to string is unsupported`
  on every login attempt. This existed since Step 2a but was never caught
  because that step only ever tested via pgTAP, never a real sign-in.
  Fixed by explicitly inserting `''` for all four.
- **Confirmation/recovery links didn't reach `/auth/confirm` at all.**
  Without a custom email template, the local Supabase CLI's default
  template uses GoTrue's own hosted `/auth/v1/verify?token=...` endpoint
  (the older implicit-flow link), which verifies the token itself and
  redirects with the session in a URL **fragment** — never sent to a
  server, so `/auth/confirm`'s route handler (built for the current
  `token_hash` query-param pattern) never saw it. Fixed with custom
  `supabase/templates/confirmation.html` / `recovery.html` wired up in
  `config.toml`. **A hosted project needs the equivalent set in the
  dashboard** (Authentication → Email Templates) — see "Known gaps."
  Caught only by actually clicking (well, curling) a real email link.
- **A pre-hydration form submit leaked the password into the URL.** The
  first click on a login/register button before React finished hydrating
  fell back to the browser's native form submission — a plain GET with
  every field, including the password, appended to the URL (and so into
  browser history and any server access log). Fixed by adding
  `method="post"` to all four auth `<form>` elements, so even that
  fallback path never puts credentials in a URL.

### Known gaps after this step

- **Hosted-project configuration required, not yet done anywhere** (no
  hosted project exists — see [[project-c205]]):
  - Custom email templates (Authentication → Email Templates in the
    dashboard) matching `supabase/templates/confirmation.html` /
    `recovery.html`, or confirmation/recovery links will silently fall
    back to the broken legacy flow described above.
  - `site_url` and redirect URL allow-list matching the real domain.
  - SMTP configured for production-volume sending (Supabase's built-in
    sender is rate-limited and meant for development only).
  - A real, random `ADMIN_BOOTSTRAP_SECRET` (never the local placeholder)
    in the hosting platform's environment variables.
  - Auth rate limits (`auth.rate_limit` — dashboard-only for hosted
    projects) reviewed for production traffic; local `config.toml` uses
    the CLI's defaults, which this step did not change.
  - No CAPTCHA (hCaptcha/Turnstile) on the auth forms — Supabase Auth
    supports this natively, but it needs external site/secret keys this
    environment doesn't have. Worth adding before any public launch.
- `/admin-setup` is unlinked from navigation but still a reachable URL to
  anyone who knows it — acceptable because both gates (the secret *and*
  the database's zero-admins check) are still required, but a determined
  operator may prefer removing the route entirely after the first admin
  exists.
- Login attempts against an email with unconfirmed status surface
  Supabase's own "Email not confirmed" error, which does confirm the
  account exists (a minor enumeration signal, gated behind also knowing
  the correct password) — accepted as standard Supabase behavior, not
  patched around.
- `next.config.ts` gained `allowedDevOrigins: ["127.0.0.1"]` — dev-only
  (Next.js blocks cross-origin HMR requests by default; this repo's
  Supabase `site_url` is `127.0.0.1`, not `localhost`), no effect on a
  production build.
- Everything from Step 2a's gaps list that this step didn't touch still
  applies (no hosted project, `app_settings` placeholder email, etc.) —
  see that entry below.
- Admin reservation review, availability publishing, and settings pages
  are still fixtures-only past their existing admin gate (now real,
  rather than fixture-driven, but the underlying data is still Step 3/4
  scope) — see Step 3/4 below.

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
- [x] ~~Admin account management (authorize/reject/suspend/restore/remove)~~
      — done early, in Step 2b, since the auth step needed it to
      demonstrate authorization gating end-to-end
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
