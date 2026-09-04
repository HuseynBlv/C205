# C205

A mobile-friendly room reservation and approval system for a university
student government (USG). The central workflow: an authorized user submits a
request for **C205** → it sits **Pending** → USG reviews it → **Approved** or
**Rejected** → the requester is emailed automatically. Submitting a request
never confirms a booking.

This repository is being built in steps. **This step delivers the project
foundation: the Next.js app, design system, responsive shell, navigation,
and reusable components.** No database, authentication, or booking logic
exists yet — see [`IMPLEMENTATION_CHECKLIST.md`](./IMPLEMENTATION_CHECKLIST.md)
for exactly what works today and what's next, and
[`ARCHITECTURE.md`](./ARCHITECTURE.md) for how it's put together.

## Stack

Next.js (App Router, TypeScript) · Tailwind CSS v4 + shadcn/ui (Radix) ·
React Hook Form + Zod · Supabase Postgres/Auth (not yet wired) ·
FullCalendar (installed, not yet wired) · one deployable app, no separate
backend.

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

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build (also type-checks)
- `npm run start` — run a production build locally
- `npm run lint` — ESLint

## Project docs

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — technical shape, kept current
- [`IMPLEMENTATION_CHECKLIST.md`](./IMPLEMENTATION_CHECKLIST.md) — what's
  done, what's deferred, and what configuration (if any) each step needs
