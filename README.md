# C205

A mobile-friendly room reservation and approval system for a university
student government (USG). The central workflow: an authorized user submits a
request for **C205** → it sits **Pending** → USG reviews it → **Approved** or
**Rejected** → the requester is emailed automatically. Submitting a request
never confirms a booking.

This repository is being built in steps. The foundation step delivered the
Next.js app, design system, shell, and navigation; this step delivers the
**Supabase database foundation** — version-controlled migrations, RLS,
privileged functions, and tests — with no app code wired to it yet. See
[`IMPLEMENTATION_CHECKLIST.md`](./IMPLEMENTATION_CHECKLIST.md) for exactly
what works today and what's next, and
[`ARCHITECTURE.md`](./ARCHITECTURE.md) for how it's put together.

## Stack

Next.js (App Router, TypeScript) · Tailwind CSS v4 + shadcn/ui (Radix) ·
React Hook Form + Zod · Supabase Postgres/Auth (schema exists, app not yet
wired to it) · FullCalendar (installed, not yet wired) · one deployable
app, no separate backend.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No environment
variables are required for this step — every screen renders fixture data in
development and an honest "not configured" state in production. Copy
[`.env.example`](./.env.example) to `.env.local` if you want to preview
turning fixtures off locally.

While developing, a flask-icon button in the bottom-right corner lets you
switch between `USER`/`ADMIN` roles and every account status (`PENDING`,
`ACTIVE`, `SUSPENDED`, `REJECTED`, `REMOVED`) to preview the corresponding
screens without a backend. There's also a component/state gallery at
`/dev/states` (only reachable in development).

## Database (Supabase)

The schema lives in `supabase/migrations/`, dev seed data in
`supabase/seed.sql`, and pgTAP tests in `supabase/tests/database/`. This
step created them and verified them against a local Supabase/Postgres
instance (all 36 pgTAP assertions pass), but no app code is wired to them
yet — see the walkthrough below.

### Local database (for development)

Requires [Docker](https://www.docker.com/) running.

```bash
npm install                # installs the Supabase CLI as a dev dependency
npm run db:start            # supabase start — pulls images, applies
                             #   migrations, runs seed.sql
npm run db:test              # supabase test db — runs the pgTAP tests
```

`db:start` prints a local API URL, anon key, and service role key — put
those in `.env.local` (copy from `.env.example`) to eventually point the
app at it. Demo accounts from `seed.sql` (password `devpassword123`,
local-only, never used in production): `admin@c205.local` (ADMIN/ACTIVE),
`active@c205.local` (ACTIVE), `pending@c205.local` (PENDING),
`suspended@c205.local` (SUSPENDED).

Changed a migration? `npm run db:reset` re-applies every migration plus
the seed from scratch. Changed the schema? `npm run db:types` regenerates
`src/lib/supabase/database.types.ts` from the running local database.

### Hosted project (for staging/production)

1. Create a project at [supabase.com](https://supabase.com/dashboard).
2. `npx supabase login`, then `npx supabase link --project-ref <ref>`.
3. `npx supabase db push` to apply `supabase/migrations/` to it. **Never
   run `supabase/seed.sql` against this project** — it contains
   development-only demo accounts and is not part of `db push`.
4. Once an admin account exists for real (sign up normally, then run
   `select public.set_user_role('<their-id>', 'ADMIN');` once from the
   SQL editor as the project owner — this is the one time a direct write
   is appropriate, since no admin exists yet to call the function through
   the app), use `set_usg_notification_email()` to replace the seeded
   placeholder address.
5. Put that project's URL/anon key/service role key in your deployment's
   environment variables (see `.env.example`) — never commit them.

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
