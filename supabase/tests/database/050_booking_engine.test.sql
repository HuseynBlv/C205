-- Deep booking-engine scenarios: exact 2h/48h boundaries, the
-- extended-meeting buffer rule (rule 8: ~1 hour between two >2h meetings),
-- idempotency (replay vs. payload-mismatch), modify_reservation (override
-- requirement, the absolute approved-overlap rule, and
-- rollback-on-failure), create_manual_reservation's own absolute overlap
-- rule, and derived pending-request warnings that never change the row
-- they describe.
--
-- Boundary tests use a small (1-minute) margin either side of the exact
-- 2-hour/48-hour threshold rather than a literal nanosecond edge: the
-- function's own clock_timestamp() is necessarily captured a little later
-- than anything this file can capture first, so testing the true
-- zero-margin instant would be flaky by construction, not more correct.
-- The margin is what actually exercises the >=/< comparison directions
-- without depending on sub-second scheduling luck.
--
-- True concurrent (not just sequential-in-one-transaction) simultaneous
-- approvals can't be demonstrated inside pgTAP itself — a single pgTAP
-- run is one session executing statements in order. That's verified
-- separately with two real, concurrently-held psql connections; see
-- IMPLEMENTATION_CHECKLIST.md for that run's result.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'authenticated', 'authenticated', 'admin@c205.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f2', 'authenticated', 'authenticated', 'requester@c205.test', 'x', now(), '{}', '{}', now(), now());

update public.profiles set role = 'ADMIN', account_status = 'ACTIVE' where id = '00000000-0000-0000-0000-0000000000f1';
update public.profiles set account_status = 'ACTIVE' where id = '00000000-0000-0000-0000-0000000000f2';

insert into public.availability_windows (room_id, starts_at, ends_at, label, published_by)
select id, now() - interval '1 day', now() + interval '60 days', 'Test window', '00000000-0000-0000-0000-0000000000f1'
from public.rooms where code = 'C205';

select id as room_id from public.rooms where code = 'C205' \gset

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}';

-- ---- exact 2-hour / 48-hour boundary --------------------------------
select throws_ok(
  format($$ select public.submit_request(%L::uuid, now() + interval '47 hours 59 minutes', now() + interval '49 hours 59 minutes', 'just under 48h notice, 2h duration', 2, null) $$, :'room_id'),
  '22023'::char(5),
  NULL,
  'a 2-hour request just under 48 hours notice is rejected'
);

select lives_ok(
  format($$ select public.submit_request(%L::uuid, now() + interval '48 hours 1 minute', now() + interval '50 hours 1 minute', 'just over 48h notice, 2h duration', 2, null) $$, :'room_id'),
  'the same 2-hour duration just over 48 hours notice succeeds'
);

select lives_ok(
  format($$ select public.submit_request(%L::uuid, now() + interval '1 hour', now() + interval '2 hours 59 minutes', 'under 2h duration, short notice', 2, null) $$, :'room_id'),
  'a request just under the 2-hour duration threshold is exempt from advance notice entirely, regardless of how soon it starts'
);

-- ---- extended-meeting buffer (rule 8: ~1 hour between >2h meetings) ----
-- An approved 3-hour ("extended") meeting anchors every check below.
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';

select (public.create_manual_reservation(
  :'room_id'::uuid, now() + interval '40 days', now() + interval '40 days 3 hours',
  'anchor extended meeting', 5, 'Anchor Person', 'anchor@c205.test'
)).id::text as anchor_id \gset

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}';

select throws_ok(
  format($$ select public.submit_request(%L::uuid, now() + interval '40 days 3 hours 30 minutes', now() + interval '40 days 6 hours', 'too close to the anchor meeting', 4, null) $$, :'room_id'),
  '22023'::char(5), NULL,
  'submit_request rejects an extended request starting only 30 minutes after another approved extended meeting ends'
);

select lives_ok(
  format($$ select public.submit_request(%L::uuid, now() + interval '40 days 4 hours', now() + interval '40 days 6 hours 30 minutes', 'exactly one hour after the anchor meeting', 4, null) $$, :'room_id'),
  'submit_request allows an extended request starting exactly one hour after the anchor meeting ends'
);

select lives_ok(
  format($$ select public.submit_request(%L::uuid, now() + interval '40 days 3 hours 15 minutes', now() + interval '40 days 4 hours', 'under 2h duration, only 15 minutes after the anchor', 3, null) $$, :'room_id'),
  'a request under the 2-hour duration threshold is exempt from the extended-meeting buffer even with a small gap'
);

-- modify_reservation: moving a pending extended request into the buffer
-- zone requires an override, same shape as availability/advance-notice.
select (public.submit_request(
  :'room_id'::uuid, now() + interval '41 days 20 hours', now() + interval '41 days 23 hours',
  'to be moved next to the anchor meeting', 4, null
)).id::text as buffer_move_id \gset

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';

select throws_ok(
  format($$ select public.modify_reservation(%L::uuid, 1, p_starts_at := now() + interval '40 days 3 hours 20 minutes', p_ends_at := now() + interval '40 days 6 hours 20 minutes') $$, :'buffer_move_id'),
  '22023'::char(5), NULL,
  'modify_reservation refuses to move a request into the buffer zone without an override'
);

select lives_ok(
  format($$ select public.modify_reservation(%L::uuid, 1, p_starts_at := now() + interval '40 days 3 hours 20 minutes', p_ends_at := now() + interval '40 days 6 hours 20 minutes', p_override := true, p_override_reason := 'USG approved back-to-back scheduling') $$, :'buffer_move_id'),
  'modify_reservation succeeds once an override and reason are given'
);

select ok(
  (select admin_override from public.reservations where id = :'buffer_move_id'::uuid),
  'the buffer-zone modification is recorded as an admin override'
);

-- derived warning: a plain pending extended request has none, then gains
-- EXTENDED_MEETING_BUFFER_REQUIRED once an admin approves another extended
-- meeting nearby — without ever touching the pending request itself.
select (public.submit_request(
  :'room_id'::uuid, now() + interval '42 days 10 hours', now() + interval '42 days 13 hours',
  'will gain a buffer warning, never touched', 4, null
)).id::text as buffer_warn_id \gset

select is(
  public.reservation_conflict_warnings(:'buffer_warn_id'::uuid),
  '{}'::text[],
  'a plain, well-spaced pending extended request has no warnings'
);

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';

select lives_ok(
  format($$ select public.create_manual_reservation(%L::uuid, now() + interval '42 days 13 hours 20 minutes', now() + interval '42 days 16 hours 20 minutes', 'a second extended meeting, right next door', 4, 'Someone Else', 'else@c205.test') $$, :'room_id'),
  'an admin books another extended meeting only 20 minutes after the pending request above'
);

select is(
  public.reservation_conflict_warnings(:'buffer_warn_id'::uuid),
  array['EXTENDED_MEETING_BUFFER_REQUIRED'],
  'the pending request now carries a derived buffer warning'
);

select is(
  (select status::text from public.reservations where id = :'buffer_warn_id'::uuid),
  'PENDING',
  'and yet the pending request itself is untouched'
);

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}';

-- ---- idempotency: replay vs. payload mismatch -------------------------
select (public.submit_request(
  :'room_id'::uuid, now() + interval '20 days', now() + interval '20 days 1 hour', 'idempotent request', 2, 'demo-key-1'
)).id::text as idempotent_id
\gset

select is(
  (public.submit_request(:'room_id'::uuid, now() + interval '20 days', now() + interval '20 days 1 hour', 'idempotent request', 2, 'demo-key-1')).id::text,
  :'idempotent_id',
  'replaying the same idempotency key with the identical payload returns the original result'
);

select is(
  (select count(*) from public.reservations where purpose = 'idempotent request')::int,
  1,
  'the replay above did not create a second row'
);

select throws_ok(
  format($$ select public.submit_request(%L::uuid, now() + interval '20 days', now() + interval '20 days 1 hour', 'idempotent request but changed', 3, 'demo-key-1') $$, :'room_id'),
  '23505'::char(5),
  NULL,
  'reusing the same idempotency key with a changed payload is rejected'
);

select is(
  (select count(*) from public.reservations where purpose ilike 'idempotent request%')::int,
  1,
  'the rejected mismatched replay did not create a row either'
);

-- ---- duplicate submission WITHOUT an idempotency key creates two rows -
-- (idempotency is opt-in via the key; nothing else deduplicates)
select (public.submit_request(:'room_id'::uuid, now() + interval '21 days', now() + interval '21 days 1 hour', 'no idempotency key', 2, null)).id::text as dup_a_id \gset
select (public.submit_request(:'room_id'::uuid, now() + interval '21 days', now() + interval '21 days 1 hour', 'no idempotency key', 2, null)).id::text as dup_b_id \gset

select isnt(
  :'dup_a_id'::text, :'dup_b_id'::text,
  'two identical submissions without an idempotency key are two independent requests, not deduplicated'
);

-- ---- modify_reservation: pending, requires override ---------------------
select (public.submit_request(:'room_id'::uuid, now() + interval '22 days', now() + interval '22 days 1 hour', 'to be modified', 2, null)).id::text as modify_id \gset

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';

select throws_ok(
  format($$ select public.modify_reservation(%L::uuid, 1, p_starts_at := now() + interval '90 days', p_ends_at := now() + interval '90 days 1 hour') $$, :'modify_id'),
  '22023'::char(5),
  NULL,
  'modify_reservation refuses a new time outside availability without an override'
);

select throws_ok(
  format($$ select public.modify_reservation(%L::uuid, 1, p_starts_at := now() + interval '90 days', p_ends_at := now() + interval '90 days 1 hour', p_override := true) $$, :'modify_id'),
  '22023'::char(5),
  NULL,
  'modify_reservation refuses an override with no reason'
);

select lives_ok(
  format($$ select public.modify_reservation(%L::uuid, 1, p_starts_at := now() + interval '90 days', p_ends_at := now() + interval '90 days 1 hour', p_override := true, p_override_reason := 'special one-off approval') $$, :'modify_id'),
  'modify_reservation succeeds with an override and a reason'
);

select is(
  (select admin_override from public.reservations where id = :'modify_id'::uuid),
  true,
  'the modification is recorded as an admin override'
);

-- ---- modify_reservation: failed modification preserves the original ---
select (public.submit_request(:'room_id'::uuid, now() + interval '23 days', now() + interval '23 days 1 hour', 'untouched by a failed modification', 2, null)).id::text as untouched_id \gset

select throws_ok(
  format($$ select public.modify_reservation(%L::uuid, 1, p_participant_count := 0) $$, :'untouched_id'),
  '22023'::char(5),
  NULL,
  'modify_reservation rejects a non-positive participant_count'
);

select results_eq(
  format($$ select starts_at, ends_at, participant_count, version from public.reservations where id = %L::uuid $$, :'untouched_id'),
  $$ values (now()::timestamptz + interval '23 days', now()::timestamptz + interval '23 days 1 hour', 2, 1) $$,
  'a failed modification changed nothing at all — same times, headcount, and version as originally submitted'
);

-- ---- modify_reservation: approved-overlap is absolute, no override ----
select (public.submit_request(:'room_id'::uuid, now() + interval '24 days', now() + interval '24 days 1 hour', 'approved slot A', 2, null)).id::text as slot_a_id \gset
select (public.submit_request(:'room_id'::uuid, now() + interval '25 days', now() + interval '25 days 1 hour', 'to be moved onto slot A', 2, null)).id::text as slot_b_id \gset

select lives_ok(
  format($$ select public.approve_request(%L::uuid, 1) $$, :'slot_a_id'),
  'slot A is approved, to become the fixed obstacle for the next check'
);

select throws_ok(
  format($$ select public.modify_reservation(%L::uuid, 1, p_starts_at := now() + interval '24 days', p_ends_at := now() + interval '24 days 1 hour', p_override := true, p_override_reason := 'try to force it anyway') $$, :'slot_b_id'),
  '23P01'::char(5),
  NULL,
  'modify_reservation refuses to move a request onto an approved slot, even with override requested'
);

-- ---- create_manual_reservation: same absolute overlap rule -------------
select throws_ok(
  format($$ select public.create_manual_reservation(%L::uuid, now() + interval '24 days', now() + interval '24 days 1 hour', 'manual double-book attempt', 2, 'Someone', 'someone@c205.test', true, 'admin insists') $$, :'room_id'),
  '23P01'::char(5),
  NULL,
  'create_manual_reservation refuses to double-book an approved slot, even with override'
);

-- ---- derived warnings never change the row they describe ---------------
select (public.submit_request(:'room_id'::uuid, now() + interval '30 days', now() + interval '30 days 1 hour', 'will be warned about, never touched', 2, null)).id::text as warn_id \gset

select is(
  public.reservation_conflict_warnings(:'warn_id'::uuid),
  '{}'::text[],
  'a plain, fitting, non-conflicting PENDING request has no warnings'
);

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';

select lives_ok(
  format($$ select public.create_blocked_interval(%L::uuid, now() + interval '30 days', now() + interval '30 days 1 hour', 'surprise maintenance') $$, :'room_id'),
  'an admin blocks the exact window the pending request above occupies'
);

select is(
  public.reservation_conflict_warnings(:'warn_id'::uuid),
  array['OUTSIDE_AVAILABILITY'],
  'the same PENDING request now carries a derived OUTSIDE_AVAILABILITY warning'
);

select is(
  (select status::text from public.reservations where id = :'warn_id'::uuid),
  'PENDING',
  'and yet the request itself is untouched — still exactly PENDING, never auto-rejected'
);

reset role;

select * from finish();
rollback;
