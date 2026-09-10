# C205

A mobile-friendly room reservation and approval system for a university
student government (USG). The central workflow: an authorized user submits a
request for **C205** → it sits **Pending** → USG reviews it → **Approved** or
**Rejected** → the requester is emailed automatically. Submitting a request
never confirms a booking.

This repository is being built in steps. The foundation step delivered the
Next.js app, design system, shell, and navigation; Step 2a added the
Supabase database foundation; Step 2b wired real Supabase Auth end to end
(registration, login, logout, email verification, password reset,
administrator authorization); Step 3a implemented the authoritative
scheduling operations — submit/approve/reject/cancel/modify a reservation,
create one manually, and manage availability — as locked, transactional
Postgres functions, verified against a real database including genuine
concurrent approvals; Step 3b wired the requester-facing app UI to those
functions — submitting and cancelling a request, a live availability
picker, status filters, and a timezone-accurate read-only calendar; this
step (4b) builds the full administrator dashboard on top of the same
functions — a sortable/filterable pending queue with conflict warnings, a
request-details panel, approve/reject with reasons and policy overrides,
manual booking and modification, monthly availability publishing with an
affected-reservations preview, and reservation/administrative audit
history — all verified end to end against a real local Supabase instance.
See
[`IMPLEMENTATION_CHECKLIST.md`](./IMPLEMENTATION_CHECKLIST.md) for exactly
what works today and what's next, and
[`ARCHITECTURE.md`](./ARCHITECTURE.md) for how it's put together.

## Stack

Next.js (App Router, TypeScript) · Tailwind CSS v4 + shadcn/ui (Radix) ·
React Hook Form + Zod · Supabase Postgres + Auth (`@supabase/ssr`, fully
wired) · FullCalendar (installed, not yet wired) · one deployable app, no
separate backend.

## Getting started

Requires [Docker](https://www.docker.com/) running (for the local Supabase
stack).

```bash
npm install                 # also installs the Supabase CLI as a dev dependency
npm run db:start             # supabase start — pulls images, applies migrations, seeds
cp .env.example .env.local   # then fill in the values db:start printed (see below)
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) — use `127.0.0.1`, not
`localhost`: that's what `supabase/config.toml`'s `site_url` is set to, and
email confirmation/recovery links are only valid against that exact origin
locally.

Without a `.env.local`, every screen still renders fixture data in
development and an honest "not configured" state in production — auth
itself needs real Supabase, though. Set `NEXT_PUBLIC_USE_FIXTURES=false`
in `.env.local` once Supabase is running to see the real thing instead of
fixtures.

While developing, a flask-icon button in the bottom-right corner lets you
switch between `USER`/`ADMIN` roles and every account status (`PENDING`,
`ACTIVE`, `SUSPENDED`, `REJECTED`, `REMOVED`) to preview the corresponding
screens without a backend. There's also a component/state gallery at
`/dev/states` (only reachable in development).

## Database and Auth (Supabase)

The schema lives in `supabase/migrations/`, dev seed data in
`supabase/seed.sql`, pgTAP tests in `supabase/tests/database/`, and the
custom email templates auth needs in `supabase/templates/`. All of it is
wired into the app now — registration, login, logout, email verification,
password reset, and admin account authorization are real.

### Local (for development)

Requires [Docker](https://www.docker.com/) running.

```bash
npm install                # installs the Supabase CLI as a dev dependency
npm run db:start            # supabase start — pulls images, applies
                             #   migrations, seeds, loads email templates
npm run db:test              # supabase test db — runs the pgTAP tests
```

`db:start` prints a local API URL and anon key — put those in
`.env.local` (copy from `.env.example`) along with an `ADMIN_BOOTSTRAP_SECRET`
of your choosing. Demo accounts from `seed.sql` (password
`devpassword123`, local-only, never used in production):
`admin@c205.local` (ADMIN/ACTIVE), `active@c205.local` (ACTIVE),
`pending@c205.local` (PENDING), `suspended@c205.local` (SUSPENDED).

Confirmation and password-reset emails don't go anywhere real locally —
open [Mailpit](http://127.0.0.1:54324) to read them and click the link.

Changed a migration? `npm run db:reset` re-applies every migration plus
the seed from scratch. Changed the schema? `npm run db:types` regenerates
`src/lib/supabase/database.types.ts` from the running local database.
Changed `supabase/config.toml` (including the email templates)? Restart
the stack (`npx supabase stop && npm run db:start`) — `supabase start`
alone won't pick up config changes on containers that are already running.

### Becoming an administrator

No administrator can register themselves through `/register` — every new
account is `USER`/`PENDING` regardless of what it claims. To get the
first admin:

1. Register normally and verify your email.
2. Visit `/admin-setup` (not linked from anywhere in the UI) and enter the
   `ADMIN_BOOTSTRAP_SECRET` from your environment.

This only works once — `bootstrap_first_admin()` refuses to run again
once any active administrator exists, even under a concurrent double
submit. After that, authorize further admins from `/admin/accounts` like
any other account (Authorize, then use `set_user_role` from the SQL
editor if you need ADMIN specifically — there's no UI for role changes
yet, only status changes).

### Hosted project (for staging/production)

Two separate platforms, two separate jobs: Supabase hosts the database
and auth backend (steps 1–5 below configure it); it never runs the
Next.js app itself. The app — pages, server actions, and
`/api/cron/send-emails` — is deployed to **Vercel** (steps 6–9 assume
this; `vercel.json` in this repo is Vercel-specific). Environment
variables in steps 6 and 9 go into Vercel's project settings, not
Supabase's dashboard.

1. Create a project at [supabase.com](https://supabase.com/dashboard).
2. `npx supabase login`, then `npx supabase link --project-ref <ref>`.
3. `npx supabase db push` to apply `supabase/migrations/` to it. **Never
   run `supabase/seed.sql` against this project** — it contains
   development-only demo accounts and is not part of `db push`.
4. **Configure custom email templates** (Authentication → Email Templates
   in the dashboard) matching `supabase/templates/confirmation.html` and
   `recovery.html`. This is not optional: without it, confirmation/
   recovery links use Supabase's legacy `/verify` endpoint and an
   implicit-flow URL fragment that this app's `/auth/confirm` route never
   sees, so verification would appear to silently fail.
5. Set `site_url` and the redirect URL allow-list to your real domain, and
   configure SMTP for production-volume sending (the built-in sender is
   for development only).
6. Put that project's URL/anon key and a real, random
   `ADMIN_BOOTSTRAP_SECRET` in **Vercel**'s environment variables
   (Project Settings → Environment Variables; see `.env.example`) — never
   commit them. `SUPABASE_SERVICE_ROLE_KEY` isn't currently used by any
   app code, but keep it out of any client-reachable file if you do add a
   use for it later.
7. Use `/admin-setup` (see above) to create the first administrator, then
   the "Notification emails" card on `/admin/settings` to replace the
   seeded placeholder address — add every inbox that should receive
   submission/account-authorization alerts, then remove the placeholder.
8. Consider enabling a CAPTCHA (hCaptcha/Turnstile) on the auth forms and
   reviewing `auth.rate_limit` for your expected traffic — this step relies
   on Supabase Auth's default abuse protection, not anything custom.
9. **Turn on the email-sending worker** (see `.env.example`'s comments for
   the full detail on each of these):
   - Create a [Resend](https://resend.com) account and API key —
     `EMAIL_PROVIDER_API_KEY`. Free tier is fine for launch: the shared
     `onboarding@resend.dev` sender (`EMAIL_FROM_ADDRESS`) can only
     deliver to your own verified address until a real sending domain is
     verified in Resend's dashboard.
   - Generate `CRON_SECRET` and a separate `EMAIL_WORKER_SECRET`
     (`openssl rand -hex 32` each — never reuse one for the other) and
     set both in **Vercel**'s environment variables.
   - As a signed-in admin, run
     `select set_email_worker_secret('<the same EMAIL_WORKER_SECRET value>');`
     against the **hosted Supabase project** once (SQL editor, or `psql`)
     — a different value from whatever your local `.env.local` uses.
   - **Trigger source, in order of how reliably each actually fires (all
     of these — including the immediate one below — claim rows from the
     same table with `FOR UPDATE SKIP LOCKED`, so running more than one
     at the same moment is harmless, never a double send):**
     0. **Immediate, in-process (the one that actually matters day to
        day)** — every server action that enqueues an email
        (`src/lib/booking/actions.ts`) and the signup-confirmation route
        (`src/app/auth/confirm/route.ts`) fire `drainEmailOutbox()`
        (`src/lib/email/worker.ts`) via `next/server`'s `after()` right
        after the mutation succeeds, so mail goes out within the same
        request instead of waiting for the next scheduled tick below.
        Never awaited by the user-facing action, and never lets a
        delivery hiccup turn a successful submission/decision into a
        failed one — the scheduled triggers below are what actually
        guarantee delivery if this doesn't get to run for any reason
        (an interrupted request, a transient Resend failure, etc.).
     1. **pg_cron, inside Supabase itself (the reliable fallback)** — the most reliable
        option, since it's a real Postgres-native scheduler rather than a
        side feature of some other platform. Enabled by
        `supabase/migrations/20260910130000_email_cron_extensions.sql`
        (just `pg_cron`/`pg_net`, safe to commit); the actual scheduled
        job is registered with a one-time manual command (kept out of
        version control since it embeds `CRON_SECRET` directly — see
        that migration's own comment for the exact command), run once via
        `supabase db query --linked` against the hosted project.
     2. **GitHub Actions** (`.github/workflows/send-emails-cron.yml`,
        every 5 minutes) — free and unlimited on a public repo, but
        GitHub explicitly documents scheduled workflows as best-effort,
        not guaranteed; a live test on this project once went 40 minutes
        without firing at all on a brand-new schedule. Left in place as
        a free secondary layer, not the primary mechanism.
     3. **`vercel.json`'s own cron** — capped at once daily on Vercel's
        Hobby plan (`0 8 * * *`); Vercel Pro ($20/mo) would allow the
        original every-5-minutes schedule directly, if pg_cron/GitHub
        Actions ever need replacing. Left as a final guaranteed-daily
        fallback regardless.
   - Deploying anywhere other than Vercel needs its own scheduler (or
     just rely on the pg_cron job above, which doesn't care what's
     hosting the app) sending `Authorization: Bearer <CRON_SECRET>` to
     `/api/cron/send-emails`.

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build (also type-checks)
- `npm run start` — run a production build locally
- `npm run lint` — ESLint
- `npm run db:start` / `db:stop` — start/stop the local Supabase stack
- `npm run db:reset` — re-apply all migrations + seed data locally
- `npm run db:test` — run the pgTAP tests under `supabase/tests/database/`
- `npm run db:diff` — diff local schema changes into a new migration file
- `npm run db:types` — regenerate `database.types.ts` from the local database

## Project docs

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — technical shape, kept current
- [`IMPLEMENTATION_CHECKLIST.md`](./IMPLEMENTATION_CHECKLIST.md) — what's
  done, what's deferred, and what configuration (if any) each step needs
