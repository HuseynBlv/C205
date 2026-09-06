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
administrator authorization); this step (3a) implements the authoritative
scheduling operations — submit/approve/reject/cancel/modify a reservation,
create one manually, and manage availability — as locked, transactional
Postgres functions, verified against a real database including genuine
concurrent approvals. No app code calls them yet — that's Step 3b. See
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
   `ADMIN_BOOTSTRAP_SECRET` in your deployment's environment variables
   (see `.env.example`) — never commit them. `SUPABASE_SERVICE_ROLE_KEY`
   isn't currently used by any app code, but keep it out of any
   client-reachable file if you do add a use for it later.
7. Use `/admin-setup` (see above) to create the first administrator, then
   `set_usg_notification_email()` to replace the seeded placeholder
   address.
8. Consider enabling a CAPTCHA (hCaptcha/Turnstile) on the auth forms and
   reviewing `auth.rate_limit` for your expected traffic — this step relies
   on Supabase Auth's default abuse protection, not anything custom.

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
