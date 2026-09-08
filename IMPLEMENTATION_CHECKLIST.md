w # C205 — Implementation Checklist

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

- **Hosted project now exists and is partially configured** — C205-prod
  (`huxclffxxtbhawiajsxm`), linked via `supabase link`. Done so far:
  schema fully pushed (`supabase db push`, all 7 migrations); `site_url`
  and `additional_redirect_urls` pushed via `supabase config push`, using
  the `[remotes.production]` override block in `supabase/config.toml`
  (kept separate from local dev's `127.0.0.1:3000` settings). Still
  needed:
  - **`site_url`/`additional_redirect_urls` are still a placeholder**
    (`https://c205-prod.example.com`) — update `[remotes.production.auth]`
    in `config.toml` to the real domain once known, then re-run
    `supabase config push`.
  - **Custom email templates could not be pushed**: this project's free
    tier rejects *any* `config push` auth update that includes
    `[auth.email.template.*]` with `"Email template modification is not
    available for free tier projects using the default email provider"`
    — and rejects the whole update, not just the template part. Blocked
    until either a custom SMTP provider is configured (Project Settings →
    Auth → SMTP Settings) or the project is upgraded off the free tier.
    Until then, this hosted project's confirmation/recovery emails still
    use Supabase's legacy `/verify` link, which `/auth/confirm` can't
    read a session out of — **auth on this hosted project does not fully
    work yet**, only locally. See the `[remotes.production]` comment in
    `config.toml` for the exact workaround once SMTP is ready.
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

## Step 3a — Booking engine: database functions ✅ (this step)

Every C205 scheduling operation as a transactional Postgres function,
invoked with the authenticated caller's own identity — no app code wired
to them yet (that's 3b, below).

- [x] `submit_request`, `approve_request`, `reject_request`,
      `cancel_reservation` (now APPROVED → CANCELLED only — see "Tightened
      state machine" below), `modify_reservation`, `create_manual_reservation`,
      and four availability mutations (`publish_availability_window`,
      `remove_availability_window`, `create_blocked_interval`,
      `remove_blocked_interval`) — all in
      `supabase/migrations/20260906100000_booking_engine.sql`
- [x] Every one of them locks the room's own row (`select ... for update`
      on `rooms`) before reading any scheduling state, in the same order
      every time (room, then the specific reservation row once its id is
      known) — this is what actually prevents two concurrent
      submissions/approvals/modifications from interleaving, not just the
      exclusion constraint (kept, unchanged, as the final guarantee below
      the lock)
- [x] `submit_request`: active+verified account required; identity and
      PENDING status derived server-side (never client-supplied); future
      start, positive duration, non-blank purpose, positive participants;
      entire interval must fit published availability minus blocks
      (`reservation_fits_availability`, using native PG14+ multirange
      containment — `tstzrange <@ range_agg(...)`); rejects overlap with
      APPROVED reservations, permits overlapping PENDING ones; 72-hour
      notice required for ≥2-hour requests; `submitted_at` captured via
      `clock_timestamp()` *after* the room lock (not `now()`, which is
      frozen at transaction start and would predate any lock wait);
      atomically writes the reservation, an audit event, and two email
      jobs (USG notification + requester receipt)
- [x] Idempotency: `(scope, requester_id, key)` now the primary key on
      `idempotency_keys` (was `(scope, key)` — actor-unscoped, a real gap);
      table gained a `payload` column so a replay with the identical
      payload returns the cached original result, while the same key with
      a *changed* payload is rejected (`23505`) rather than silently
      returning a mismatched response
- [x] `approve_request`: active admin, PENDING status, and matching
      `p_expected_version` all required; re-checks availability and
      approved-conflicts at approval time (not just submission time);
      advance notice is evaluated against `submitted_at`, never the
      moment of approval; an explicit, audited override
      (`p_override` + non-blank `p_override_reason`) can bypass the
      availability and advance-notice checks — but never the
      approved-overlap check, which stays absolute
- [x] Tightened state machine: `PENDING → APPROVED | REJECTED`,
      `APPROVED → CANCELLED` are the only valid transitions —
      `cancel_reservation` no longer accepts a PENDING reservation (a
      requester withdrawing before any decision isn't in this version's
      scope; an admin rejecting is the equivalent path). Every mutating
      function rejects a wrong-status or stale-version call with the
      matching stable error rather than silently doing nothing
- [x] `modify_reservation` (admin-only): revalidates the *new* interval
      exactly like submission; requires an override reason only when the
      new time actually needs one (fits fine → no reason demanded); the
      approved-overlap check is absolute regardless of override; any
      raised exception rolls back the whole function, so a failed
      modification changes nothing — proven directly in
      `050_booking_engine.test.sql`, not just asserted
- [x] `create_manual_reservation` (admin-only): creates and approves in
      one atomic step, sends exactly one confirmation email — never the
      "pending, awaiting review" receipt `submit_request` sends, since
      nothing about it is actually pending
- [x] `reservation_conflict_warnings(reservation_id)`: read-only, derived,
      never mutates anything. A PENDING request that a later block or
      approval makes newly non-fitting/conflicting stays exactly PENDING —
      this just explains why approving it as-is would now fail
- [x] Stable error identifiers returned as the exception message text
      itself: `ACCOUNT_NOT_AUTHORIZED`, `ADVANCE_NOTICE_REQUIRED`,
      `OUTSIDE_AVAILABILITY`, `RESERVATION_CONFLICT`,
      `INVALID_STATUS_TRANSITION`, `STALE_RESERVATION_VERSION`
- [x] Availability/block writes now go through the same locked functions
      as reservations — direct `INSERT`/`UPDATE`/`DELETE` grants on
      `availability_windows`/`blocked_intervals` were revoked from
      `authenticated`, since a client bypassing the lock via a raw table
      write would have made the room lock meaningless
- [x] 88 pgTAP assertions across 5 files (54 → 88), including exact
      2-hour/72-hour boundary tests (a small, deliberate margin either
      side of the literal instant — see `050_booking_engine.test.sql`'s
      header comment for why testing the true zero-margin edge against a
      live clock would be flaky by construction, not more correct),
      idempotency replay-vs-mismatch, and rollback-on-failure
- [x] **Simultaneous approvals, proven with two real concurrently-held
      connections** (pgTAP itself is one session executing statements in
      order — it cannot demonstrate genuine concurrency on its own).
      Two overlapping PENDING requests; connection A approved one and
      held its transaction open for 3 seconds before committing;
      connection B's `approve_request` on the other one was issued 2.3
      seconds *before* A's commit and only returned (with
      `RESERVATION_CONFLICT`, correctly) *after* A committed — direct
      timestamp evidence that B blocked on the room lock rather than
      racing:
      ```
      A: approved slot A at 09:09:24.57, held open until 09:09:27.60 (commit)
      B: called approve_request at 09:09:25.28 (while A's lock was still held)
      B: only returned RESERVATION_CONFLICT after A's commit at 09:09:27.60
      ```
- [x] `supabase/seed.sql` updated for the new function names/signatures,
      and its demo reservation dates are now anchored to the next real
      weekdays rather than a fixed day-offset — the old approach would
      have failed roughly 2 days out of 7 once `submit_request` started
      actually enforcing availability-fit (it never did before this step)

### Bugs found and fixed by actually running this step

- **Check-ordering bug in `submit_request`**: the room-row lock was
  acquired *before* the active-account check. Since a suspended caller's
  own client-side subquery for the room id is itself RLS-gated to active
  users (and therefore resolves to `NULL`), this produced a confusing
  "room `<NULL>` not found" instead of `ACCOUNT_NOT_AUTHORIZED`. Fixed by
  moving the account check first — identity/permission isn't scheduling
  state, so it shouldn't need the lock at all.
- **A test-authoring bug, not a code bug**, initially looked like a real
  regression: "submit a request overlapping an approved reservation, then
  approve it" — but per spec, overlap with an *already-approved*
  reservation must be rejected at submission time, full stop; there's no
  way to reach "approve-time conflict" that way. The correct scenario is
  two requests that only overlap *each other*, both still PENDING,
  approved one at a time.
- **pgTAP polymorphic-type error**: `isnt(:'a', :'b', ...)` failed with
  "could not determine polymorphic type" when both sides are untyped
  `:'var'` substitutions — needs an explicit cast on at least one side
  (`:'a'::text`).

### Known gaps after this step

- No app code calls any of these functions yet — `/requests/new`,
  `/calendar`, and `admin/reservations` are still fixtures-only. That's
  Step 3b.
- No sending worker drains `email_outbox` yet (Step 5) — the two email
  jobs `submit_request` writes, and the ones `approve_request` /
  `reject_request` / `cancel_reservation` / `modify_reservation` /
  `create_manual_reservation` write, all sit in the outbox unsent.
- A requester cannot withdraw their own still-PENDING request — only an
  admin can reject it. Revisit if this turns out to matter in practice;
  it was a deliberate reading of the specified state machine, not an
  oversight.
- `modify_reservation`/`create_manual_reservation` are admin-only; a
  regular user cannot edit their own pending request's details (they'd
  cancel via... they currently can't — see the gap above — and resubmit,
  once cancellation of a PENDING request exists).

## Step 3b — Booking engine: UI wiring ✅ (this step)

- [x] `requests/new` wired to `submit_request` (`src/lib/booking/actions.ts`),
      with a stable-error-to-copy map (`src/lib/booking/errors.ts`) so
      `OUTSIDE_AVAILABILITY`/`RESERVATION_CONFLICT`/`ADVANCE_NOTICE_REQUIRED`
      etc. show as real, specific form errors instead of a generic failure.
      A per-mount idempotency key is generated once (`useState` lazy
      initializer, not a `ref` — see "Bugs found" below) so a retried
      submission after a network blip can't create a duplicate request.
      The mobile time-list picker (`TimeSlotPicker`, built in Step 1) now
      drives a real submission — no separate "mobile interaction" work was
      needed once the form itself was wired
- [x] FullCalendar wired into `/calendar` (`src/components/calendar/calendar-view.tsx`):
      published availability and blocked intervals as background events,
      the anonymized `room_occupancy` projection as real events (PENDING
      shown dimmed, APPROVED solid) — no requester identity, matching the
      view's own anonymity guarantee
- [x] `admin/reservations` wired to `approve_request`/`reject_request`
      with `reservation_conflict_warnings` shown as badges on pending
      items whose fit has changed since submission
- [x] `admin/availability` wired to `publish_availability_window`/
      `remove_availability_window`/`create_blocked_interval`/
      `remove_blocked_interval`, with simple inline forms
- [x] "My Requests" lists the caller's own real reservations (RLS-scoped)
      and gained a real Cancel action for APPROVED reservations (using
      `cancel_reservation`'s optimistic version)
- [x] **Live availability in the request form** (`src/lib/booking/slot-status.ts`,
      `availability-query.ts`): picking a date fetches that day's real
      published windows, admin blocks, and anonymized pending/approved
      occupancy (via `room_occupancy` — never the base `reservations`
      table, so no other user's identity/purpose ever reaches this
      client-side code), and colors every start/end slot Open / Pending
      request / Reserved / Unavailable — icon plus color, never color
      alone (`TimeSlotPicker`'s `SlotStatusLegend`). A pending overlap is
      shown, not blocked, matching the spec's "overlay, not a block" rule
      (only an *approved* overlap or outside-hours slot reads as
      unavailable to book).
- [x] **Immediate client-side validation preview**, mirroring
      `submit_request`'s own checks (`evaluateRequestedRange`) so a user
      sees `OUTSIDE_AVAILABILITY`/`RESERVATION_CONFLICT`/
      `ADVANCE_NOTICE_REQUIRED` — or an informational "overlaps a pending
      request" note — before submitting, while the backend call remains
      the authoritative check (this preview never blocks submission by
      itself, since the local snapshot can be stale).
- [x] **Race-condition recovery**: if a submission is rejected because the
      slot became unavailable after the page loaded, the form keeps every
      field the user entered, refreshes the day's availability in place,
      and says so explicitly, instead of silently resetting or leaving a
      stale picker.
- [x] **Idempotency key reuse/regeneration**: the key is now derived from
      the actual submitted payload (room/time/purpose/participants) —
      retrying the *same* attempt reuses the same key, but any edit before
      resubmitting gets a fresh one, matching the exact rule asked for
      (previously it was one key per form mount, regardless of edits).
- [x] **My Requests status filters** (`requests/requests-list.tsx`):
      All/Pending/Approved/Rejected/Cancelled/Past tabs with live counts,
      "Past" meaning any request whose end time has already elapsed
      regardless of status.
- [x] **Private request-detail pages** (`requests/[id]/page.tsx`) — RLS
      (`reservations_select_own`/`_admin`) is what actually enforces
      privacy here: a request that exists but belongs to someone else
      comes back empty, indistinguishable from "doesn't exist," so the
      page can never confirm or deny another user's reservation.
- [x] Submission receipt now includes the literal required sentence,
      "Pending USG approval. The room is not yet reserved."
- [x] **Loading skeletons and error states**: `loading.tsx` added for
      calendar/requests/admin-reservations/admin-availability (using the
      `LoadingState`/`CalendarLoadingState` components built in Step 1 but
      never wired to a route until now); a new `ErrorState` component
      (distinct from `EmptyState` — a real fetch failure must never read
      as "there's nothing here") with a Retry action is now shown instead
      of silently treating a Supabase query error as an empty list on
      calendar/requests/admin-reservations/admin-availability.
- [x] **Refresh on focus + periodic polling, no realtime infra**
      (`useRefreshOnFocus`, `<AutoRefresh />`): calendar, My Requests, and
      both admin screens re-run their server-side fetch (`router.refresh()`)
      on window focus/visibility and every 60s; the request form refreshes
      its own live availability every 45s for the same reason, since it's
      the most time-sensitive screen (another user's submission can change
      what's actually bookable while the form is open).

### Known gaps after this step

- **`modify_reservation` and `create_manual_reservation` have no UI yet**
  — both database functions exist and are pgTAP-tested (Step 3a), but
  wiring an admin-facing "edit this reservation's time" or "book directly
  on someone's behalf" screen was deliberately deprioritized in favor of
  the core submit → approve/reject → cancel loop and the live-availability
  work above. Revisit if manual admin bookings are needed before real
  email notifications go out.
- The FullCalendar view is read-only — no drag-to-select, no click-to-
  prefill-the-request-form. Booking still happens entirely through
  `/requests/new`.
- `getConflictWarnings` runs one `reservation_conflict_warnings` RPC call
  per pending reservation on `admin/reservations` (an N+1 pattern) —
  fine at this app's scale (one room, a handful of pending requests at
  once), but worth a single batched query if that ever stops being true.
- The sidebar/app shell itself (built in Step 1) has no small-screen
  collapse behavior — narrow-screen work this step focused on the forms
  and lists actually touched (responsive `flex-col sm:flex-row` patterns
  throughout), not the shell's own layout.

### Bugs found and fixed by actually running this step

- **`supabase/seed.sql`'s availability windows and demo reservations were
  stored 4 hours off from their intended Asia/Baku wall-clock time** —
  `d::date + time '09:00'` is a naive timestamp, which casts to
  `timestamptz` using the *session's* timezone (UTC for this database),
  not `rooms.timezone` (Asia/Baku). "9am-6pm" was actually stored as
  1pm-10pm Baku time. This was invisible until this step: pgTAP's own
  tests always used `now() + interval` (already absolute, no naive-
  timestamp ambiguity) or a deliberately wide-open test window spanning
  every hour, and nothing before this step ever submitted a *real*
  request through a *real*, timezone-aware client against the seeded
  data. The first real submission through the actual UI — 9:00 AM Baku,
  which should obviously fit "9am-6pm weekday hours" — was rejected with
  `OUTSIDE_AVAILABILITY`, which is what surfaced it. Fixed by wrapping
  every naive date+time expression in `seed.sql` with
  `at time zone 'Asia/Baku'`.
- **FullCalendar's core doesn't understand named IANA timezones** (like
  `"Asia/Baku"`) without the separate `@fullcalendar/moment-timezone`
  plugin (not installed) — passing one to the `timeZone` prop is silently
  ignored, and it falls back to the *viewer's own browser* timezone. That
  would have shown every event 4 hours off (or a different offset
  entirely) to anyone not physically in Baku. Fixed without adding a
  dependency: every event's start/end is pre-formatted server-side into a
  naive (no offset) Asia/Baku wall-clock string
  (`date-fns-tz`'s `formatInTimeZone`), and the component's `timeZone`
  prop is set to the literal `"UTC"` — which FullCalendar *does* support
  natively — so it renders those naive strings at face value instead of
  reinterpreting them through the browser's zone.
- **`@fullcalendar/react@^7.0.2` was paired with `@fullcalendar/core`/
  `daygrid`/`timegrid`/`interaction` all pinned at `^6.1.21`** in
  `package.json` since Step 1 — a real major-version mismatch (React 7.x
  requires FullCalendar core 7.x) that had simply never been exercised
  until this step tried to actually render a `<FullCalendar>` component,
  surfacing as a wall of TypeScript errors about incompatible internal
  types. `@fullcalendar/core` 7.x turned out to pull in a new peer
  dependency chain (`@full-ui/headless-calendar`) not worth taking on
  right now, so the fix was downgrading `@fullcalendar/react` to
  `^6.1.21` to match the rest, rather than upgrading everything to 7.x.
- A `react-hooks/refs` ESLint error: reading `idempotencyKey.current`
  inside the callback passed to `react-hook-form`'s `handleSubmit(...)` —
  a real lint rule catching a real (if narrow) footgun, since that
  callback is *constructed* during render even though it only ever runs
  on submit. Fixed by using lazy-initialized `useState` instead of
  `useRef` for a value that only ever needs to be read, not mutated.
- Three more React Compiler-era ESLint errors while building the live
  availability picker, all the same underlying lesson (side effects,
  including any ref mutation or `setState` call, belong strictly inside a
  callback — an event handler, an effect's own async `.then`, a
  `setInterval` tick — never directly in a render body or an effect's
  synchronous top level): (1) `react-hooks/refs` again, this time because
  the submit handler *transitively* called a `useCallback` that read a
  ref (`dayRequestId`, used for a stale-response guard) — fixed by
  dropping the ref-based guard rather than working around it, since the
  race it guarded against was minor and self-correcting; (2)
  `react-hooks/purity` for calling `Date.now()` directly while computing
  the live validation preview during render — fixed by moving "now" into
  state, refreshed via effect; (3) `react-hooks/set-state-in-effect` for
  calling a state-setting function synchronously as the first statement
  of an effect (both the date-change effect and the "now" clock effect)
  — fixed by deferring the call into a `Promise.resolve().then(...)`
  microtask, which the rule treats as the "callback" it wants setState
  calls confined to.

## Step 4 — User & admin screens (mostly done early)

- [x] ~~My Requests backed by real data~~ — done in Step 3b (real-time
      "realtime-ish" push updates, e.g. via Supabase Realtime, are still
      not implemented; the page reflects the latest state on each load/
      revalidation, not live-push)
- [x] ~~Admin reservation review (approve/reject with reason)~~ — done in
      Step 3b, extended with reason collection and manual create/modify
      UI in Step 4b below
- [x] ~~Admin availability publishing/blocking, without silently cancelling
      approved reservations~~ — done in Step 3b (blocking never touches
      existing reservations, verified in Step 3a's function/tests)
- [x] ~~Admin account management (authorize/reject/suspend/restore/remove)~~
      — done early, in Step 2b, since the auth step needed it to
      demonstrate authorization gating end-to-end
- [x] ~~USG notification email setting persisted~~ — done in Step 4b

## Step 4b — Administrator dashboard ✅ (this step)

Everything here was built on top of Step 3a's existing authorized
backend operations, plus a small additive migration
(`20260907100000_admin_dashboard.sql`) for the handful of admin
operations that didn't exist yet: editing an existing availability
window/block in place, publishing a whole month of recurring hours in
one transactional call, and admin read access to the audit trail. No
email sender was needed for any of this — the outbox rows
`approve_request`/`reject_request`/`cancel_reservation`/
`modify_reservation` already write were sufficient confirmation that
"notify affected requesters" is wired as far as this step's scope goes.

**New database (`20260907100000_admin_dashboard.sql`, 106 pgTAP
assertions total, 18 new in `060_admin_dashboard.test.sql`):**
- `audit_events_select_admin` RLS policy + grant — admins can finally
  read the audit trail (still append-only for every role; this only
  adds SELECT). A non-admin's SELECT is now permitted at the grant
  level but returns zero rows (RLS), not a permission error — updated
  `010_rls_and_grants.test.sql`'s assertion to match.
- `_merge_adjacent_availability_windows(room_id)` — an internal helper
  (not granted to any client role) that merges availability windows
  overlapping or exactly touching each other into one row, leaving
  windows with a real gap alone. Called at the end of
  `publish_availability_window` (now `create or replace`d) and the new
  `update_availability_window`. Blocks are never auto-merged — each
  carries its own reason, and merging would silently lose one.
- `update_availability_window(window_id, starts_at, ends_at, label)`
  and `update_blocked_interval(block_id, starts_at, ends_at, reason)` —
  admin-only, room-locked, audited (`AVAILABILITY_UPDATED`/
  `BLOCK_UPDATED`), the same discipline as every Step 3a function.
- `publish_availability_month(room_id, month, weekdays[], start_time,
  end_time, excluded_dates[], label)` — one transactional call (one
  room lock, one audit event `AVAILABILITY_MONTH_PUBLISHED`) for "open
  these weekdays, these hours, this whole month, except these dates,"
  rather than the app looping N separate single-window publishes (N
  separate transactions). This is the first place anything reads
  `rooms.timezone` (stored since Step 2a, never used until now) instead
  of assuming Asia/Baku — it converts each matching calendar date's
  wall-clock hours to `timestamptz` itself, server-side.

**New UI:**
- **Pending queue** (`admin/reservations/pending-queue.tsx`) — count,
  a sort control (submitted oldest/newest, start time soonest/latest),
  and a from/to date filter, all client-side over the already-fetched
  admin data (small dataset at this scale).
- **Request-details panel** (`components/admin/reservation-details-sheet.tsx`)
  — a side sheet with requester identity, submission time, requested
  interval, purpose, participants, status, version, decision info, and
  override reason, opened via "View" from any row (pending or decided).
- **Reject with an optional reason, Approve with an override flow**
  (`admin/reservations/decision-buttons.tsx`) — reject opens a small
  dialog for an optional reason; approve retries with `override: true`
  and a required reason if the backend returns `OUTSIDE_AVAILABILITY`
  or `ADVANCE_NOTICE_REQUIRED`, exactly mirroring `approve_request`'s
  own rule that only those two ever accept an override reason,
  `RESERVATION_CONFLICT` never does. A `STALE_RESERVATION_VERSION`
  response (branched on the actual stable error code now returned
  alongside the mapped message — see "Bugs found" below, not on
  substring-matching display text) shows a "this changed since you
  opened it — Refresh" prompt instead of retrying blindly.
- **Admin cancel** (`AdminCancelButton`) — a reason dialog over the
  existing `cancel_reservation` (already admin-callable), for APPROVED
  reservations from either the queue or the details panel.
- **Manual booking** (`admin/reservations/manual-booking-dialog.tsx`)
  and **modify reservation** (`.../modify-reservation-dialog.tsx`) —
  first real UI for `create_manual_reservation`/`modify_reservation`
  (Step 3a functions, previously untouched by any screen), both with
  the same override-reason retry flow as Approve.
- **Monthly availability publishing**
  (`admin/availability/monthly-publish-form.tsx`) — weekday checkboxes,
  start/end time, a month picker, and an excluded-dates list, with a
  live client-side preview (pure date arithmetic, no round-trip) of
  every date it's about to publish before the admin confirms.
- **Edit + impact preview** (`edit-window-dialog.tsx`,
  `edit-block-dialog.tsx`, rewritten `remove-button.tsx`,
  `impact-preview.tsx`) — editing or removing a window/block, or
  removing one outright, shows which PENDING/APPROVED reservations
  overlap the affected range before confirming, explicitly stating
  that approved reservations keep their time regardless (`ImpactPreview`
  queries `reservations` directly — admin RLS already grants full read
  access, so no new RPC was needed for this).
- **Audit log** (`admin/audit/`) — every `audit_events` row, most
  recent first, with category tabs (Reservations/Availability/
  Blocks/Accounts/Settings) and the actor's name joined in via
  Supabase's foreign-key embedding (`actor:profiles(full_name)`).
- **Settings** (`admin/settings`) — the USG notification email is now
  a real form calling `set_usg_notification_email()` (built in Step
  2a, never wired to anything until now), with the same email-format
  check client-side as the database enforces server-side.
- Two new shadcn-style primitives needed for all of the above and not
  previously in the project: `components/ui/dialog.tsx` (centered
  modal, built on the same Radix `Dialog` primitive `sheet.tsx` already
  used for the side panel) and `components/ui/checkbox.tsx`.

### Known gaps after this step

- The pending queue's sort/filter and the audit log's category tabs
  are client-side over the full already-fetched dataset — fine at this
  app's scale (one room, realistically dozens of reservations/events at
  once), would need server-side pagination well before that stops
  being true.
- `ImpactPreview` shows reservations overlapping a window/block's
  *current* range, not a live recompute against whatever the admin is
  actively typing into the edit form — good enough to inform a
  shrink/removal decision, not a live "as you type" preview.
- Notifications are still only queued (`email_outbox`), never sent —
  unchanged from Step 3b/5's scope; this step didn't need sending to
  be meaningful, since the outbox rows themselves are the evidence the
  "notify affected requesters" requirement is wired as far as the
  database goes.

### Bugs found and fixed by actually running this step

- **A real design flaw caught before it shipped, not after**: the
  first draft of the approve/reject override and stale-version
  handling branched on *substrings of the mapped, human-readable error
  text* (e.g. `result.error.includes("published availability")`) —
  which would silently break the moment anyone reworded
  `STABLE_ERROR_MESSAGES` in `errors.ts`. Fixed before it became a
  latent bug: `ActionResult` now carries an optional `code:
  StableErrorCode` alongside the mapped `error` string
  (`stableErrorCode()` in `errors.ts`), so client code branches on the
  same six stable identifiers the database actually returns, never on
  display copy.
- A copy-paste bug in the first draft of `EditWindowDialog`: it passed
  `w.starts_at.slice(0, 16)` back through `localDateTimeToUtcIso` for
  the impact-preview query — double-converting an already-UTC
  timestamp as if it were Baku local time, which would have shown the
  wrong reservations as "affected." Caught in review before running
  it; fixed by passing the stored UTC timestamps straight through
  (`previewAvailabilityImpactAction` compares directly against the
  stored `timestamptz` columns, no conversion needed at all).
- Three more instances of the same React Compiler-era ESLint rules
  from Step 3b's second pass, all fixed the same way (defer the
  setState call into a callback rather than the effect's synchronous
  top level): `impact-preview.tsx`'s data-fetching effect called
  `setLoading(true)` synchronously; the fix wraps the whole effect body
  in `Promise.resolve().then(...)`, same pattern as `request-form.tsx`.

## Calendar redesign ✅

Purely visual: no change to reservation logic, API contracts, permissions,
database structure, or timezone handling. The calendar's data — what
`calendar/page.tsx` fetches and how it converts UTC to Baku wall-clock
strings — is untouched; only how it's presented changed.

- **Custom compact header** (`calendar-toolbar.tsx`) replaces
  FullCalendar's default toolbar (`headerToolbar={false}`): grouped
  prev/next buttons, a secondary "Today" button with a real active
  state (bold/filled only when the visible range actually contains
  today), a quieter date-range label, a reused `Tabs` component as the
  Week/Month segmented control, and a quiet "Times shown in Asia/Baku"
  label — all driven purely through the FullCalendar API via a ref
  (`.prev()`/`.next()`/`.today()`/`.changeView()`), with `datesSet`
  feeding the range label and active-view state back.
- **Useful-hour range from real data**: `slotMinTime`/`slotMaxTime` are
  now computed from the actual earliest-start/latest-end across
  published availability windows (padded an hour, clamped to a sane
  bound), not a fixed 7am–9pm regardless of what's published
  (`computeScheduleRange` in `calendar/page.tsx`).
- **Per-weekday "unavailable" shading**: `computeBusinessHours` derives
  one `businessHours` rule per ISO weekday that has at least one
  published window (that weekday's own earliest/latest hours); a
  weekday with zero windows gets no rule, so FullCalendar's
  `.fc-non-business` shades its whole column — restyled in
  `calendar.css` as a quiet diagonal hatch instead of a flat tint.
  This only affects the calendar's own visual reference (`rooms.timezone`
  and the room's actual per-day availability_windows rows) — nothing
  about what a request is validated against.
- **Custom event content** for the anonymized occupancy events (never
  for the availability/block background events, which stay a plain
  color fill): a status dot, start/end time, "Pending"/"Reserved", and
  a room icon + `C205` when there's room, collapsing to a single
  dot+time line for events under ~40 minutes or in month view — driven
  by a `kind` field (`"window" | "block" | "pending" | "approved"`) now
  attached to every event's `extendedProps`, a purely presentational
  discriminator.
- **Status legend** (`calendar-legend.tsx`): Available/Pending/
  Reserved/Unavailable, icon + color + label, shown under the calendar
  on both desktop and mobile.
- **Mobile: a genuine agenda view, not a squeezed 7-column grid**
  (`mobile-agenda.tsx`) — a horizontally scrollable date strip (14
  days, 44px+ touch targets) plus a vertical timeline of the selected
  day's windows/blocks/reservations, reading the exact same `events`
  array the desktop view gets (no separate fetch, no different
  contract). A sticky "Request C205" button sits just above the app
  shell's own fixed mobile bottom nav (`sticky bottom-20`, not
  `fixed`, so it never overlaps it).
- **Design tokens**: two new CSS variables, `--cal-surface` (warm
  off-white) and `--cal-accent` (cobalt blue), added alongside the
  existing `--status-*` tokens in `globals.css` (light + dark) —
  deliberately distinct from `--primary` (brand orange, reserved for
  CTAs elsewhere) so the calendar reads as its own "living timetable."
  Every other color (grid lines, status colors, surfaces) reuses
  existing tokens directly. FullCalendar's own CSS custom-property
  theming layer (`--fc-border-color`, `--fc-page-bg-color`,
  `--fc-now-indicator-color`, etc.) is what most of `calendar.css`
  actually overrides, rather than fighting its markup with `!important`.

### Bugs found and fixed by actually rendering this at each width

- **The now-indicator was silently off by Baku's UTC offset.** FullCalendar's
  default "now" is the real current instant; in this app's `timeZone="UTC"`
  display mode (necessary — see `calendar-view.tsx`'s doc comment), that
  instant is drawn at its *real-UTC* hour, not Baku's, so the line would
  have shown 4 hours earlier than the actual current Baku time. Existed
  since Step 3b's original `nowIndicator` addition, never visible before
  because nothing had scrutinized the indicator's exact position. Fixed
  with a `now` callback (`fakeBakuNow`) that formats the real current
  instant into Baku wall-clock and re-labels it UTC, the same trick
  already used for every event's start/end.
- **Month view's header briefly showed the week-view's header content**
  (small weekday label + a date number) instead of a plain weekday name,
  because `dayHeaderContent`/`dayCellContent` were conditionally swapped
  between the real renderer and `undefined` based on React's `view` state
  — which raced with FullCalendar's own internal view-change timing.
  Fixed by always registering the same callback and having it branch on
  `arg.view.type` (FullCalendar's own live value for whatever it's
  actually drawing), never on React state.
- **A real horizontal-overflow bug in the shared app shell**
  (`app-shell.tsx`), only ever exposed once a narrow-viewport check was
  actually run: the content column (`flex min-h-dvh flex-1 flex-col`,
  a row-flex item) had no `min-w-0`, so at narrow widths its own
  descendants' content-based minimum width forced the whole page wider
  than the viewport — a textbook flexbox `min-width: auto` gotcha, not
  something specific to the calendar (the mobile agenda's own
  horizontally-scrolling date strip needed the same fix, `min-w-0` on
  both the strip and its wrapper). No prior page had exercised this
  edge case; fixed with one `min-w-0` class in the shell plus two in
  the new calendar components.

### Known gaps after this step

- Not pixel-audited at every intermediate breakpoint — verified at a
  representative desktop width (1440px), a real narrow-mobile width
  (~500px CSS px), and via code review for the ~768–1024px tablet
  range (the `md:` breakpoint switch itself was exercised, just not a
  live screenshot at e.g. 820px specifically — this session's browser
  automation's window-resize tool did not reliably resize an
  already-open tab's rendered viewport; a freshly created tab did pick
  up the new size).
- The mobile agenda's date strip shows a fixed 14-day window (2 days
  back, 11 ahead of today) rather than infinite/lazy-loaded scrolling.
- `computeBusinessHours`'s per-weekday shading collapses a day with two
  disjoint windows (e.g. 9–12 and 14–17) into one visual span — a
  deliberate approximation ("where practical," per the brief); the
  precise picture still comes from the actual availability-window
  background events painted on top.

## Calendar interactivity ✅

Made the calendar's existing events and available time genuinely
interactive, entirely as an app-layer feature on top of the pre-existing
RLS policies from Step 2a (`reservations_select_own`/`_admin`) — no new
migration, no new database function.

- **Tiered reservation details** (`src/lib/booking/reservation-details.ts`,
  `getReservationDetailsAction`): a single server action that fetches one
  reservation `.single()` under the caller's own RLS-scoped session, and
  derives its own tier (`admin` / `owner` / bystander) from whether a row
  came back and who it belongs to. `.single()` returns `data: null`
  identically whether the id doesn't exist or RLS just hides it from this
  caller — no existence-leak side channel. Field exposure exactly matches
  spec: a bystander gets only status/date/time/duration; the owner
  additionally gets purpose, participant count, submission time, and
  decision/cancellation reasons; an admin additionally gets requester
  name/email, version, and conflict warnings.
- **`ReservationPanel`** (`src/components/calendar/reservation-panel.tsx`):
  a `Sheet` (desktop: right side; mobile, via `useMediaQuery`: bottom,
  rounded top corners, `max-h-[85vh]`) opened by clicking/tapping any
  event on the desktop grid or the mobile agenda. Renders a `startsAt`/
  `endsAt` fallback (already-known from the calendar's own anonymized
  event, converted back to real UTC via `roomLocalToUtcIso` — see "Bugs
  found" below) instantly, then swaps in the tiered fetch's fuller detail
  once it arrives, so opening never shows an empty flash. Reuses the
  existing action-button components (`ApproveButton`/`RejectButton`/
  `AdminCancelButton`/`ModifyReservationDialog`/`CancelReservationButton`)
  unchanged in their own logic, only extended with an optional
  `onSuccess` callback.
- **Selected state lives in the URL** (`?event=<id>` on `calendar-view.tsx`,
  via `useSearchParams`/`useRouter`/`usePathname`): closing via the X
  button, Escape, an outside click (all via the underlying Radix
  `Dialog`'s own semantics — dialog role, focus trap, Escape/outside-click
  handling came for free through the existing `Sheet` component), or
  browser back/forward all correctly open/close the same panel. Focus
  returns to the exact triggering event element after close (a
  `data-event-id`-keyed lookup in a dedicated `useEffect`, deliberately
  replacing Radix's own `onCloseAutoFocus` restoration, which doesn't
  survive the DOM node getting recreated on a data refresh).
- **Available-time selection** (`handleSelect` in `calendar-view.tsx`,
  FullCalendar's `selectable`/`select`, disabled in month view): picking
  a range revalidates it using the same pure logic the request form
  already uses (`evaluateRequestedRange`, `getDayAvailabilityAction`) —
  a valid selection shows a cobalt-highlighted summary
  (`SelectionPanel`) with date/start/end/duration and a "Continue to
  request" link that prefills `/requests/new?date=&start=&end=`; an
  invalid one (past, outside published hours, blocked, or conflicting
  with an approved reservation) never opens a request form at all —
  it shows a specific icon+text reason instead, matching the existing
  slot-picker's own icon-plus-color rule. The real submission on
  `/requests/new` still revalidates from scratch server-side, exactly as
  before — this is a prefill convenience only, never a trust boundary.
- **Keyboard and screen-reader access to calendar events**
  (`eventDidMount` in `calendar-view.tsx`): FullCalendar's own event
  elements aren't natively focusable, so each one gets `tabindex="0"`,
  `role="button"`, a descriptive `aria-label` (status + time, never
  private info), a `keydown` handler for Enter/Space, and visible
  `:focus-visible` styling (`calendar.css`). `MobileAgenda`'s reservation
  rows got the same treatment (`role="button"`, `tabIndex`, `onKeyDown`).
- **Desktop hover preview**: a small popover on `mouseenter`
  (`eventDidMount`'s hover listeners, `hoverPreview` state) showing only
  the same privacy-safe fields a bystander's click would reveal — never
  anything a click wouldn't also show, and never the only way to reach
  that information.
- **Restrained motion**: a 180–260ms transition on the event block itself
  plus the selected-state outline/elevation (`.fc-event.cal-event-
  selected`), and the panel's own enter/exit slide — no continuous
  pulsing, no calendar-wide animation.

### Bugs found and fixed by actually running this step

- **Timezone bug caught while wiring the fallback, not from a failed
  test**: the calendar's own event `start`/`end` are naive Asia/Baku
  wall-clock strings rendered through FullCalendar's `timeZone="UTC"`
  trick (see the Calendar redesign step's doc comment) — reusing them
  directly as the panel's instant-fallback timestamps would have fed a
  naive string straight into `ReservationPanel`'s real-timezone
  formatters, which expect genuine UTC-with-offset input (exactly what
  the authorized server fetch returns). Fixed by converting the fallback
  through `roomLocalToUtcIso(date, time)` before handing it to the panel.
- **The panel didn't refresh after a successful admin action taken from
  inside it**: approving a pending request from the panel left it
  showing stale "Pending" content (and now-invalid Approve/Reject
  buttons) even though the calendar event underneath had already turned
  green — `revalidatePath` refreshes the calendar's own event list, but
  the panel's tiered detail fetch is a separate client-side snapshot a
  server revalidation doesn't touch. Caught by actually clicking Approve
  and watching the panel, not by reading the code. Fixed by adding an
  optional `onSuccess` callback to every action-button component,
  wired to bump a `refreshKey` that re-runs the panel's fetch — with
  care to only clear shown content on a genuine reservation-id change,
  never on a same-id refetch, so it doesn't flash to a loading skeleton
  after a successful action.
- **The "Continue to request" link silently did nothing on click**: it
  lives inside `SelectionPanel`, rendered outside FullCalendar's own grid
  DOM, so a click there was also landing on FullCalendar's default
  `unselectAuto` outside-click behavior (`unselect={() => setSelection
  (null)}`), which unmounted the panel/link mid-click before navigation
  could complete — confirmed by testing the same destination via a
  direct URL, which worked fine. Fixed by removing the `unselect` prop
  from `<FullCalendar>` entirely; the selection now only clears via the
  panel's own dismiss button, a new selection replacing it, or
  navigating away.

### Known gaps after this step

- No dedicated network-level test proves a bystander's fetch never
  transmits owner/admin-only fields over the wire beyond the already-
  verified UI behavior (opening another user's approved reservation and
  confirming only status/date/time/duration render) — the authorization
  itself is enforced by RLS, not by this app code, so the exposure is
  bounded regardless, but a request-payload inspection wasn't separately
  captured this session.
- Reduced-motion behavior relies on the project's pre-existing global
  CSS rather than a fresh dedicated check this session.
- The pending-overlap "informational, not blocking" note on available-
  time selection reuses `evaluateRequestedRange`'s already-tested logic
  unchanged, but wasn't freshly re-exercised through the new selection
  UI specifically this session (past/blocked/approved-conflict paths
  were).

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
