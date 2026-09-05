-- Function-level authorization tests: authentication, role, and
-- account-state checks inside the SECURITY DEFINER functions.
--
-- See 010_rls_and_grants.test.sql for the role/JWT-claim simulation
-- technique. Not executed in this environment (no local Docker/Supabase
-- instance available) — run via `supabase test db` and verify.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'admin@c205.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'requester@c205.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b3', 'authenticated', 'authenticated', 'bystander@c205.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b4', 'authenticated', 'authenticated', 'suspended@c205.test', 'x', now(), '{}', '{}', now(), now());

update public.profiles set role = 'ADMIN', account_status = 'ACTIVE' where id = '00000000-0000-0000-0000-0000000000b1';
update public.profiles set account_status = 'ACTIVE' where id = '00000000-0000-0000-0000-0000000000b2';
update public.profiles set account_status = 'ACTIVE' where id = '00000000-0000-0000-0000-0000000000b3';
update public.profiles set account_status = 'SUSPENDED', status_reason = 'test fixture' where id = '00000000-0000-0000-0000-0000000000b4';

-- ---- authenticated role with no JWT identity (no `sub` claim) ---------
-- EXECUTE is revoked from anon/public, so an anon call never reaches the
-- function body at all (blocked at 42501 by the grant, not this check) —
-- this exercises the internal auth.uid() IS NULL branch directly instead.
set local role authenticated;

select throws_ok(
  $$ select public.decide_reservation(gen_random_uuid(), 'APPROVED', null) $$,
  '28000'::char(5),
  NULL,
  'decide_reservation requires authentication'
);

reset role;

-- ---- suspended account cannot submit -------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b4","role":"authenticated"}';

select throws_ok(
  $$ select public.submit_reservation(
       (select id from public.rooms where code = 'C205'),
       now() + interval '4 days', now() + interval '4 days 1 hour', 'suspended attempt', 2, null
     ) $$,
  '42501'::char(5),
  NULL,
  'a SUSPENDED account cannot submit a reservation'
);

reset role;

-- ---- ordinary active user submits a reservation ---------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';

select lives_ok(
  $$ select public.submit_reservation(
       (select id from public.rooms where code = 'C205'),
       now() + interval '5 days', now() + interval '5 days 1 hour', 'team sync', 3, null
     ) $$,
  'an ACTIVE user can submit a reservation for themselves'
);

select throws_ok(
  $$ select public.submit_reservation(
       (select id from public.rooms where code = 'C205'),
       now() + interval '6 days 1 hour', now() + interval '6 days', 'bad interval', 2, null
     ) $$,
  '22023'::char(5),
  NULL,
  'submit_reservation rejects ends_at <= starts_at'
);

select throws_ok(
  $$ select public.submit_reservation(
       (select id from public.rooms where code = 'C205'),
       now() + interval '7 days', now() + interval '7 days 1 hour', 'bad headcount', 0, null
     ) $$,
  '22023'::char(5),
  NULL,
  'submit_reservation rejects a non-positive participant_count'
);

-- A non-admin cannot decide on their own request.
select throws_ok(
  $$ select public.decide_reservation(
       (select id from public.reservations where requester_id = '00000000-0000-0000-0000-0000000000b2' order by created_at desc limit 1),
       'APPROVED', null
     ) $$,
  '42501'::char(5),
  NULL,
  'a non-admin cannot call decide_reservation, even on their own request'
);

-- A bystander cannot cancel someone else's request. Capture the target
-- reservation's id now, while still authenticated as its owner (b2) and
-- therefore able to see it under RLS — once we switch to b3 below, b3's
-- own SELECT on reservations can't see this row at all, so the inline
-- subquery style used elsewhere in this file would just resolve to NULL.
select id::text as target_reservation_id
from public.reservations
where requester_id = '00000000-0000-0000-0000-0000000000b2'
order by created_at desc limit 1
\gset

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}';

select throws_ok(
  format($$ select public.cancel_reservation(%L::uuid, 'not mine') $$, :'target_reservation_id'),
  '42501'::char(5),
  NULL,
  'a bystander cannot cancel another user''s reservation'
);

reset role;

-- ---- admin decides and re-decides ------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

select lives_ok(
  $$ select public.decide_reservation(
       (select id from public.reservations where requester_id = '00000000-0000-0000-0000-0000000000b2' order by created_at desc limit 1),
       'APPROVED', 'looks good'
     ) $$,
  'an active admin can approve a pending reservation'
);

select throws_ok(
  $$ select public.decide_reservation(
       (select id from public.reservations where requester_id = '00000000-0000-0000-0000-0000000000b2' order by created_at desc limit 1),
       'APPROVED', 'again'
     ) $$,
  '55000'::char(5),
  NULL,
  'decide_reservation refuses to re-decide a reservation that is no longer PENDING'
);

-- A non-admin cannot change another user's account status.
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}';

select throws_ok(
  $$ select public.set_account_status('00000000-0000-0000-0000-0000000000b2', 'SUSPENDED', 'not an admin') $$,
  '42501'::char(5),
  NULL,
  'a non-admin cannot call set_account_status on another user'
);

reset role;

select * from finish();
rollback;
