-- Booking-engine function tests: authentication, role/account-state
-- checks, status-transition rules, and the availability/overlap/
-- advance-notice guards inside submit_request / approve_request /
-- reject_request / cancel_reservation / archive_reservation /
-- unarchive_reservation / create_manual_reservation /
-- publish_availability_window / create_blocked_interval.
--
-- Deeper scenarios (exact time boundaries, idempotency, modify_reservation,
-- derived pending-request warnings, rollback-on-failure) live in
-- 050_booking_engine.test.sql. See 010_rls_and_grants.test.sql for the
-- role/JWT-claim simulation technique.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e1', 'authenticated', 'authenticated', 'admin@c205.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e2', 'authenticated', 'authenticated', 'requester@c205.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e3', 'authenticated', 'authenticated', 'bystander@c205.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e4', 'authenticated', 'authenticated', 'suspended@c205.test', 'x', now(), '{}', '{}', now(), now());

update public.profiles set role = 'ADMIN', account_status = 'ACTIVE' where id = '00000000-0000-0000-0000-0000000000e1';
update public.profiles set account_status = 'ACTIVE' where id = '00000000-0000-0000-0000-0000000000e2';
update public.profiles set account_status = 'ACTIVE' where id = '00000000-0000-0000-0000-0000000000e3';
update public.profiles set account_status = 'SUSPENDED', status_reason = 'test fixture' where id = '00000000-0000-0000-0000-0000000000e4';

-- A deliberately wide-open availability window, inserted directly (table
-- owner bypasses RLS, same convention as seed.sql), so this file's
-- assertions never depend on which real-world weekday they happen to run
-- on — unlike supabase/seed.sql's own published hours, which are
-- Mon-Fri-only and deliberately NOT relied on here.
insert into public.availability_windows (room_id, starts_at, ends_at, label, published_by)
select id, now() - interval '1 day', now() + interval '60 days', 'Test window', '00000000-0000-0000-0000-0000000000e1'
from public.rooms where code = 'C205';

-- ---- authenticated role with no JWT identity ---------------------------
set local role authenticated;

select throws_ok(
  $$ select public.approve_request(gen_random_uuid(), 1) $$,
  '28000'::char(5),
  NULL,
  'approve_request requires authentication'
);

reset role;

-- ---- suspended account cannot submit -----------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e4","role":"authenticated"}';

select throws_ok(
  $$ select public.submit_request(
       (select id from public.rooms where code = 'C205'),
       now() + interval '4 days', now() + interval '4 days 1 hour', 'suspended attempt', 2, null
     ) $$,
  '42501'::char(5),
  NULL,
  'a SUSPENDED account cannot submit a request'
);

reset role;

-- ---- ordinary active user submits a request ----------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}';

select lives_ok(
  $$ select public.submit_request(
       (select id from public.rooms where code = 'C205'),
       now() + interval '5 days', now() + interval '5 days 1 hour', 'team sync', 3, null
     ) $$,
  'an ACTIVE user can submit a request for themselves'
);

select throws_ok(
  $$ select public.submit_request(
       (select id from public.rooms where code = 'C205'),
       now() + interval '6 days 1 hour', now() + interval '6 days', 'bad interval', 2, null
     ) $$,
  '22023'::char(5),
  NULL,
  'submit_request rejects ends_at <= starts_at'
);

select throws_ok(
  $$ select public.submit_request(
       (select id from public.rooms where code = 'C205'),
       now() + interval '7 days', now() + interval '7 days 1 hour', 'bad headcount', 0, null
     ) $$,
  '22023'::char(5),
  NULL,
  'submit_request rejects a non-positive participant_count'
);

-- A non-admin cannot decide on their own request.
select throws_ok(
  $$ select public.approve_request(
       (select id from public.reservations where requester_id = '00000000-0000-0000-0000-0000000000e2' order by created_at desc limit 1),
       1
     ) $$,
  '42501'::char(5),
  NULL,
  'a non-admin cannot call approve_request, even on their own request'
);

-- The owner cannot cancel their own still-PENDING request — only APPROVED
-- -> CANCELLED is a valid transition now.
select throws_ok(
  format(
    $$ select public.cancel_reservation(%L::uuid, 1, 'changed my mind') $$,
    (select id from public.reservations where requester_id = '00000000-0000-0000-0000-0000000000e2' order by created_at desc limit 1)
  ),
  '22023'::char(5),
  NULL,
  'the owner cannot cancel their own PENDING request (only APPROVED -> CANCELLED is valid)'
);

-- Capture the target id now, while still authenticated as its owner (e2)
-- and therefore able to see it under RLS.
select id::text as target_reservation_id
from public.reservations
where requester_id = '00000000-0000-0000-0000-0000000000e2'
order by created_at desc limit 1
\gset

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated"}';

select throws_ok(
  format($$ select public.cancel_reservation(%L::uuid, 1, 'not mine') $$, :'target_reservation_id'),
  '42501'::char(5),
  NULL,
  'a bystander cannot cancel another user''s reservation either'
);

reset role;

-- ---- admin approves, and version/status guards hold --------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';

select lives_ok(
  format($$ select public.approve_request(%L::uuid, 1) $$, :'target_reservation_id'),
  'an active admin can approve a pending request'
);

select throws_ok(
  format($$ select public.approve_request(%L::uuid, 2) $$, :'target_reservation_id'),
  '22023'::char(5),
  NULL,
  'approve_request refuses to re-decide a reservation that is no longer PENDING'
);

reset role;

-- A second, independent PENDING request to isolate STALE_RESERVATION_VERSION
-- from INVALID_STATUS_TRANSITION (still PENDING, but the caller's expected
-- version is wrong — e.g. they loaded the page before someone else acted).
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}';

select (public.submit_request(
  (select id from public.rooms where code = 'C205'),
  now() + interval '8 days', now() + interval '8 days 1 hour', 'stale version subject', 2, null
)).id::text as stale_target_id
\gset

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';

select throws_ok(
  format($$ select public.approve_request(%L::uuid, 999) $$, :'stale_target_id'),
  '40001'::char(5),
  NULL,
  'approve_request rejects a stale expected_version on a still-PENDING request'
);

reset role;

-- ---- RESERVATION_CONFLICT: an overlapping PENDING request was allowed to
-- exist (submission never checks against other PENDING rows), but cannot
-- itself be approved once the OTHER one already holds the slot as
-- APPROVED. Both submissions below happen while both are still PENDING —
-- submitting a request that overlaps something already-APPROVED is a
-- separate, always-rejected-at-submission case (covered further down by
-- "far outside published availability"'s sibling scenario is not this one;
-- see RESERVATION_CONFLICT-at-submission if that's ever added).
select (public.submit_request(
  (select id from public.rooms where code = 'C205'),
  now() + interval '12 days', now() + interval '12 days 1 hour', 'overlap pair A', 2, null
)).id::text as overlap_a_id
\gset

select lives_ok(
  format($$ select public.submit_request(%L::uuid, now() + interval '12 days 30 minutes', now() + interval '12 days 1 hour 30 minutes', 'overlap pair B', 2, null) $$, (select id from public.rooms where code = 'C205')),
  'a second PENDING request overlapping the first PENDING one is still allowed to be submitted'
);

select id::text as overlap_b_id
from public.reservations
where purpose = 'overlap pair B'
\gset

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';

select lives_ok(
  format($$ select public.approve_request(%L::uuid, 1) $$, :'overlap_a_id'),
  'the first of two overlapping PENDING requests can be approved'
);

select throws_ok(
  format($$ select public.approve_request(%L::uuid, 1) $$, :'overlap_b_id'),
  '23P01'::char(5),
  NULL,
  'approve_request refuses to create an overlapping APPROVED reservation once the other one is already approved'
);

-- ---- OUTSIDE_AVAILABILITY -----------------------------------------------
select throws_ok(
  format($$ select public.submit_request(%L::uuid, now() + interval '90 days', now() + interval '90 days 1 hour', 'far outside published availability', 2, null) $$, (select id from public.rooms where code = 'C205')),
  '22023'::char(5),
  NULL,
  'submit_request rejects a time outside the published availability window'
);

-- ---- ADVANCE_NOTICE_REQUIRED --------------------------------------------
select throws_ok(
  format($$ select public.submit_request(%L::uuid, now() + interval '1 day', now() + interval '1 day 3 hours', 'too soon for a 3-hour booking', 2, null) $$, (select id from public.rooms where code = 'C205')),
  '22023'::char(5),
  NULL,
  'submit_request enforces 48-hour advance notice for a 2+ hour request'
);

reset role;

-- ---- admin cancels the approved reservation -----------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';

select lives_ok(
  format($$ select public.cancel_reservation(%L::uuid, 2, 'room needed for something else') $$, :'target_reservation_id'),
  'an admin can cancel an APPROVED reservation'
);

-- ---- archive_reservation / unarchive_reservation ------------------------
-- target_reservation_id is now CANCELLED at version 3 (1 -> approve -> 2
-- -> cancel -> 3).
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated"}';

select throws_ok(
  format($$ select public.archive_reservation(%L::uuid, 3) $$, :'target_reservation_id'),
  '42501'::char(5), NULL,
  'a non-admin cannot archive a decision-history entry'
);

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';

select throws_ok(
  format($$ select public.archive_reservation(%L::uuid, 999) $$, :'target_reservation_id'),
  '40001'::char(5), NULL,
  'archive_reservation rejects a stale expected_version'
);

select throws_ok(
  format($$ select public.archive_reservation(%L::uuid, 1) $$, :'stale_target_id'),
  '22023'::char(5), NULL,
  'archive_reservation refuses a reservation still awaiting a decision'
);

select lives_ok(
  format($$ select public.archive_reservation(%L::uuid, 3) $$, :'target_reservation_id'),
  'an admin can archive a decided (CANCELLED) reservation'
);

select ok(
  (select archived_at is not null and archived_by = '00000000-0000-0000-0000-0000000000e1'
   from public.reservations where id = :'target_reservation_id'::uuid),
  'archiving records who archived it and when'
);

select throws_ok(
  format($$ select public.archive_reservation(%L::uuid, 4) $$, :'target_reservation_id'),
  '22023'::char(5), NULL,
  'archive_reservation refuses to re-archive an already-archived reservation'
);

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated"}';

select throws_ok(
  format($$ select public.unarchive_reservation(%L::uuid, 4) $$, :'target_reservation_id'),
  '42501'::char(5), NULL,
  'a non-admin cannot unarchive either'
);

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';

select lives_ok(
  format($$ select public.unarchive_reservation(%L::uuid, 4) $$, :'target_reservation_id'),
  'an admin can unarchive a reservation'
);

select ok(
  (select archived_at is null and archived_by is null
   from public.reservations where id = :'target_reservation_id'::uuid),
  'unarchiving clears both archived fields'
);

select throws_ok(
  format($$ select public.unarchive_reservation(%L::uuid, 5) $$, :'target_reservation_id'),
  '22023'::char(5), NULL,
  'unarchive_reservation refuses a reservation that is not currently archived'
);

-- ---- create_manual_reservation: admin-only, atomic create+approve ------
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated"}';

select throws_ok(
  format($$ select public.create_manual_reservation(%L::uuid, now() + interval '9 days', now() + interval '9 days 1 hour', 'manual by non-admin', 2, 'Someone', 'someone@c205.test') $$, (select id from public.rooms where code = 'C205')),
  '42501'::char(5),
  NULL,
  'a non-admin cannot call create_manual_reservation'
);

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';

select is(
  (select status::text from public.create_manual_reservation(
    (select id from public.rooms where code = 'C205'),
    now() + interval '9 days', now() + interval '9 days 1 hour',
    'manual booking', 2, 'Someone Else', 'someone@c205.test'
  )),
  'APPROVED',
  'create_manual_reservation records creation and approval atomically'
);

-- ---- availability mutations: admin-only, same lock discipline ----------
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated"}';

select throws_ok(
  format($$ select public.publish_availability_window(%L::uuid, now() + interval '10 days', now() + interval '10 days 4 hours', 'extra hours') $$, (select id from public.rooms where code = 'C205')),
  '42501'::char(5),
  NULL,
  'a non-admin cannot publish availability'
);

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';

select lives_ok(
  format($$ select public.publish_availability_window(%L::uuid, now() + interval '10 days', now() + interval '10 days 4 hours', 'extra hours') $$, (select id from public.rooms where code = 'C205')),
  'an admin can publish an availability window'
);

select lives_ok(
  format($$ select public.create_blocked_interval(%L::uuid, now() + interval '11 days', now() + interval '11 days 1 hour', 'facilities work') $$, (select id from public.rooms where code = 'C205')),
  'an admin can create a blocked interval'
);

reset role;

select * from finish();
rollback;
