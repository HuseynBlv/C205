-- Extensions, schema-wide default privileges, and enum types.
--
-- Supabase grants broad default privileges on new tables/functions to the
-- `anon` and `authenticated` roles out of the box (relying on RLS alone to
-- lock things down). This project takes least-privilege seriously: default
-- privileges are revoked up front, and every later migration grants back
-- only what a role specifically needs.

-- btree_gist is required for the exclusion constraint on reservations
-- (equality on room_id + overlap on a tstzrange in the same GiST index).
-- Installed in `public` (not the `extensions` schema) so its operator
-- classes are resolvable without depending on a non-default search_path.
create extension if not exists btree_gist with schema public;

-- gen_random_uuid() is a Postgres core builtin since v13 — no pgcrypto
-- extension is needed for it on Supabase's Postgres 15.

revoke all on schema public from anon;
grant usage on schema public to anon, authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

create type public.account_role as enum ('USER', 'ADMIN');

create type public.account_status as enum (
  'PENDING',
  'ACTIVE',
  'REJECTED',
  'SUSPENDED',
  'REMOVED'
);

create type public.reservation_status as enum (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED'
);

create type public.email_outbox_status as enum ('PENDING', 'SENT', 'FAILED');

-- Generic "touch updated_at" trigger, reused by every mutable table.
-- SECURITY INVOKER is sufficient: it only ever reads/writes the row already
-- being written by the invoking statement, nothing sensitive.
create function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public, anon, authenticated;
