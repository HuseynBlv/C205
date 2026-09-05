-- RLS + grant tests: unauthenticated access, inactive-account minimal
-- access, active-user own-data access, and the anonymized occupancy view.
--
-- Technique: PostgREST (and therefore Supabase) resolves auth.uid() from
-- the `request.jwt.claims` GUC set per request. To simulate a specific
-- signed-in user at the SQL level, this file does:
--   set local role authenticated;
--   set local request.jwt.claims to '{"sub":"<uuid>","role":"authenticated"}';
-- which is the standard documented way to exercise RLS policies from
-- pgTAP without a real HTTP request. `reset role;` returns to the
-- superuser connection (here, table-owner privileges) between personas so
-- setup inserts/updates can bypass RLS the way a migration would.
--
-- Run with `supabase start` then `supabase test db`. Not executed in this
-- environment (no local Docker/Supabase instance available) — verify the
-- plan count and each assertion's expected outcome against your own run.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- ---- fixtures -------------------------------------------------------
-- Minimal auth.users rows so the on_auth_user_created trigger provisions
-- matching profiles automatically, then promote each persona directly
-- (as table owner, bypassing RLS) to the account_status/role under test.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'pending@c205.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'active@c205.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a3', 'authenticated', 'authenticated', 'other-active@c205.test', 'x', now(), '{}', '{}', now(), now());

update public.profiles set account_status = 'PENDING' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set account_status = 'ACTIVE' where id = '00000000-0000-0000-0000-0000000000a2';
update public.profiles set account_status = 'ACTIVE' where id = '00000000-0000-0000-0000-0000000000a3';

-- A reservation belonging to the "other" active user, inserted directly as
-- table owner (this bypasses the no-direct-write rule deliberately, only
-- to set up fixture data — the point under test is what *other roles* can
-- read/write afterward, not this insert itself).
insert into public.reservations (room_id, requester_id, requester_name, requester_email, starts_at, ends_at, purpose, participant_count, status)
select id, '00000000-0000-0000-0000-0000000000a3', 'Other Active User', 'other-active@c205.test',
       now() + interval '1 day', now() + interval '1 day 1 hour', 'Fixture reservation', 4, 'PENDING'
from public.rooms where code = 'C205';

-- ---- unauthenticated visitors ----------------------------------------
set local role anon;

select throws_ok(
  $$ select * from public.profiles $$,
  '42501'::char(5),
  NULL,
  'anon cannot select profiles'
);

select throws_ok(
  $$ select * from public.rooms $$,
  '42501'::char(5),
  NULL,
  'anon cannot select rooms'
);

select throws_ok(
  $$ select * from public.reservations $$,
  '42501'::char(5),
  NULL,
  'anon cannot select reservations'
);

select throws_ok(
  $$ select * from public.room_occupancy $$,
  '42501'::char(5),
  NULL,
  'anon cannot select the occupancy view'
);

select throws_ok(
  $$ select public.submit_reservation(
       (select id from public.rooms where code = 'C205'),
       now() + interval '2 days', now() + interval '2 days 1 hour',
       'anon attempt', 2, null
     ) $$,
  '42501'::char(5),
  NULL,
  'anon cannot execute submit_reservation'
);

reset role;

-- ---- inactive (PENDING) account: minimal account info only -----------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select is(
  (select account_status::text from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'),
  'PENDING',
  'pending user can read their own profile to see why they are blocked'
);

select is(
  (select count(*) from public.reservations)::int, 0,
  'pending user sees zero reservations (RLS requires an ACTIVE account)'
);

select is(
  (select count(*) from public.rooms)::int, 0,
  'pending user sees zero rooms (RLS requires an ACTIVE account)'
);

select throws_ok(
  $$ update public.profiles set role = 'ADMIN' where id = '00000000-0000-0000-0000-0000000000a1' $$,
  '42501'::char(5),
  NULL,
  'pending user cannot set their own role directly, even on their own row'
);

select throws_ok(
  $$ update public.profiles set account_status = 'ACTIVE' where id = '00000000-0000-0000-0000-0000000000a1' $$,
  '42501'::char(5),
  NULL,
  'pending user cannot self-activate their own account_status directly'
);

reset role;

-- ---- active account -----------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select ok(
  (select count(*) from public.rooms) >= 1,
  'active user can read room reference data'
);

select lives_ok(
  $$ update public.profiles set full_name = 'Updated Name' where id = '00000000-0000-0000-0000-0000000000a2' $$,
  'active user can update their own display name'
);

select is(
  (select count(*) from public.reservations where requester_id = '00000000-0000-0000-0000-0000000000a3')::int, 0,
  'active user cannot see another user''s reservation via the base table'
);

select ok(
  (select count(*) from public.room_occupancy) >= 1,
  'active user can see the anonymized occupancy projection'
);

select throws_ok(
  $$ select requester_id from public.room_occupancy $$,
  '42703'::char(5),
  NULL,
  'room_occupancy has no requester_id column at all (structural anonymity, not just a filtered row)'
);

select throws_ok(
  $$ select * from public.audit_events $$,
  '42501'::char(5),
  NULL,
  'active (non-admin) user cannot select audit_events'
);

select throws_ok(
  $$ select * from public.email_outbox $$,
  '42501'::char(5),
  NULL,
  'active (non-admin) user cannot select email_outbox'
);

select throws_ok(
  $$ insert into public.audit_events (action, entity_table, entity_id) values ('X', 'profiles', '1') $$,
  '42501'::char(5),
  NULL,
  'active user cannot write audit_events directly'
);

select throws_ok(
  $$ insert into public.reservations (room_id, requester_id, requester_name, requester_email, starts_at, ends_at, purpose, participant_count)
     select id, auth.uid(), 'Me', 'active@c205.test', now() + interval '3 days', now() + interval '3 days 1 hour', 'direct insert attempt', 2
     from public.rooms where code = 'C205' $$,
  '42501'::char(5),
  NULL,
  'active user cannot insert a reservation directly, only via submit_reservation()'
);

reset role;

select * from finish();
rollback;
