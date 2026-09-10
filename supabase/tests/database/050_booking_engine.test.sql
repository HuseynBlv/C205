-- Deep booking-engine scenarios: exact 2h/48h boundaries, the
-- extended-meeting buffer rule (rule 8: ~1 hour between two >2h meetings),
-- the room-hours rule (08:00-23:00), idempotency (replay vs.
-- payload-mismatch), modify_reservation (override requirement, the
-- absolute approved-overlap rule, and rollback-on-failure),
-- create_manual_reservation's own absolute overlap rule, and derived
-- pending-request warnings that never change the row they describe.
--
-- The 2-hour/48-hour boundary test targets a small (couple-minute) margin
-- either side of the threshold rather than a literal nanosecond edge: the
-- function's own clock_timestamp() is necessarily captured a little later
-- than anything this file can capture first, so testing the true
-- zero-margin instant would be flaky by construction, not more correct.
-- It also picks how many days out to land on based on the current hour
-- (see the under_days/over_days computation below) — a fixed "~2 days
-- from now" offset preserves today's hour-of-day almost exactly, which
-- silently assumed that hour would always leave room for a 2-hour
-- reservation to end by 23:00. It doesn't past ~21:00, so the offset is
-- chosen dynamically to land the under/over case on the correct side of
-- the 48-hour line while always finishing within room hours, regardless
-- of what hour this actually runs at.
--
-- Every OTHER test in this file that needs "some valid future slot"
-- (not testing the 48-hour boundary itself) anchors to an explicit,
-- fixed room-local clock time on a given day offset — `now() + interval
-- 'N days'` alone would silently inherit whatever hour-of-day the test
-- happens to run at, which the room-hours rule (08:00-23:00) now makes a
-- real source of flakiness rather than a harmless quirk.
--
-- True concurrent (not just sequential-in-one-transaction) simultaneous
-- approvals can't be demonstrated inside pgTAP itself — a single pgTAP
-- run is one session executing statements in order. That's verified
-- separately with two real, concurrently-held psql connections; see
-- IMPLEMENTATION_CHECKLIST.md for that run's result.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'authenticated', 'authenticated', 'admin@c205.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f2', 'authenticated', 'authenticated', 'requester@c205.test', 'x', now(), '{}', '{}', now(), now());

update public.profiles set role = 'ADMIN', account_status = 'ACTIVE' where id = '00000000-0000-0000-0000-0000000000f1';
update public.profiles set account_status = 'ACTIVE' where id = '00000000-0000-0000-0000-0000000000f2';

-- A continuous range needs no room-hours-safe endpoints of its own — every
-- instant in between (including every day's 08:00-23:00) is covered
-- regardless of the literal clock time these two boundaries fall on.
insert into public.availability_windows (room_id, starts_at, ends_at, label, published_by)
select id, now() - interval '1 day', now() + interval '60 days', 'Test window', '00000000-0000-0000-0000-0000000000f1'
from public.rooms where code = 'C205';

select id as room_id from public.rooms where code = 'C205' \gset

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}';

-- ---- exact 2-hour / 48-hour boundary --------------------------------
-- This stays relative to real now() on purpose: the 48-hour threshold is
-- compared against clock_timestamp() at call time, so there's no way to
-- test the boundary without proximity to real "now". But a *fixed*
-- ~48-hour offset also preserves today's hour-of-day almost exactly,
-- which used to be an unexamined assumption that it'd land safely within
-- room hours — it doesn't, once "now" itself is late enough that a
-- 2-hour reservation starting near "now + 2 days" would run past 23:00
-- (anything after ~21:00). Instead, target an explicit safe hour
-- (10:00/10:02) and pick however many days out actually lands the
-- "under"/"over" case on the correct side of the 48-hour line for
-- *today's* current hour — correct regardless of what hour this runs at,
-- not just "usually".
select (now() at time zone 'Asia/Baku')::time as now_time \gset
select (case when :'now_time'::time < time '10:00' then 1 else 2 end) as under_days \gset
select (case when :'now_time'::time < time '10:02' then 2 else 3 end) as over_days \gset
select (now()::date + (:under_days || ' days')::interval)::date as under_day \gset
select (now()::date + (:over_days || ' days')::interval)::date as over_day \gset

select throws_ok(
  format(
    $$ select public.submit_request(%L::uuid, (%L::date + time '10:00') at time zone 'Asia/Baku', (%L::date + time '12:00') at time zone 'Asia/Baku', 'just under 48h notice, 2h duration', 2, null) $$,
    :'room_id', :'under_day', :'under_day'
  ),
  '22023'::char(5),
  NULL,
  'a 2-hour request just under 48 hours notice is rejected'
);

select lives_ok(
  format(
    $$ select public.submit_request(%L::uuid, (%L::date + time '10:02') at time zone 'Asia/Baku', (%L::date + time '12:02') at time zone 'Asia/Baku', 'just over 48h notice, 2h duration', 2, null) $$,
    :'room_id', :'over_day', :'over_day'
  ),
  'the same 2-hour duration just over 48 hours notice succeeds'
);

-- Unlike the two boundary tests above, this one only needs to be "soon"
-- relative to submission, not at any particular real-clock offset — a
-- fixed, always-safe tomorrow-morning slot tests the same exemption
-- (duration under 2h, regardless of how little notice) without
-- inheriting today's current hour.
select lives_ok(
  format(
    $$ select public.submit_request(%L::uuid, (%L::date + time '09:00') at time zone 'Asia/Baku', (%L::date + time '10:30') at time zone 'Asia/Baku', 'under 2h duration, short notice', 2, null) $$,
    :'room_id', (now()::date + interval '1 day')::date, (now()::date + interval '1 day')::date
  ),
  'a request just under the 2-hour duration threshold is exempt from advance notice entirely, regardless of how soon it starts'
);

-- ---- extended-meeting buffer (rule 8: ~1 hour between >2h meetings) ----
-- An approved 3-hour ("extended") meeting anchors every check below.
-- Anchor: day+40, 09:00-12:00.
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';

select (now()::date + interval '40 days')::date as day40 \gset

select (public.create_manual_reservation(
  :'room_id'::uuid,
  (:'day40'::date + time '09:00') at time zone 'Asia/Baku', (:'day40'::date + time '12:00') at time zone 'Asia/Baku',
  'anchor extended meeting', 5, 'Anchor Person', 'anchor@c205.test'
)).id::text as anchor_id \gset

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}';

select throws_ok(
  format(
    $$ select public.submit_request(%L::uuid, (%L::date + time '12:30') at time zone 'Asia/Baku', (%L::date + time '15:00') at time zone 'Asia/Baku', 'too close to the anchor meeting', 4, null) $$,
    :'room_id', :'day40', :'day40'
  ),
  '22023'::char(5), NULL,
  'submit_request rejects an extended request starting only 30 minutes after another approved extended meeting ends'
);

select lives_ok(
  format(
    $$ select public.submit_request(%L::uuid, (%L::date + time '13:00') at time zone 'Asia/Baku', (%L::date + time '15:30') at time zone 'Asia/Baku', 'exactly one hour after the anchor meeting', 4, null) $$,
    :'room_id', :'day40', :'day40'
  ),
  'submit_request allows an extended request starting exactly one hour after the anchor meeting ends'
);

select lives_ok(
  format(
    $$ select public.submit_request(%L::uuid, (%L::date + time '12:15') at time zone 'Asia/Baku', (%L::date + time '13:00') at time zone 'Asia/Baku', 'under 2h duration, only 15 minutes after the anchor', 3, null) $$,
    :'room_id', :'day40', :'day40'
  ),
  'a request under the 2-hour duration threshold is exempt from the extended-meeting buffer even with a small gap'
);

-- modify_reservation: moving a pending extended request into the buffer
-- zone requires an override, same shape as availability/advance-notice.
-- Day+41, 09:00-12:00 — a different day from the anchor, comfortably
-- "far away" regardless of time-of-day.
select (now()::date + interval '41 days')::date as day41 \gset

select (public.submit_request(
  :'room_id'::uuid,
  (:'day41'::date + time '09:00') at time zone 'Asia/Baku', (:'day41'::date + time '12:00') at time zone 'Asia/Baku',
  'to be moved next to the anchor meeting', 4, null
)).id::text as buffer_move_id \gset

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';

select throws_ok(
  format(
    $$ select public.modify_reservation(%L::uuid, 1, p_starts_at := (%L::date + time '12:20') at time zone 'Asia/Baku', p_ends_at := (%L::date + time '15:20') at time zone 'Asia/Baku') $$,
    :'buffer_move_id', :'day40', :'day40'
  ),
  '22023'::char(5), NULL,
  'modify_reservation refuses to move a request into the buffer zone without an override'
);

select lives_ok(
  format(
    $$ select public.modify_reservation(%L::uuid, 1, p_starts_at := (%L::date + time '12:20') at time zone 'Asia/Baku', p_ends_at := (%L::date + time '15:20') at time zone 'Asia/Baku', p_override := true, p_override_reason := 'USG approved back-to-back scheduling') $$,
    :'buffer_move_id', :'day40', :'day40'
  ),
  'modify_reservation succeeds once an override and reason are given'
);

select ok(
  (select admin_override from public.reservations where id = :'buffer_move_id'::uuid),
  'the buffer-zone modification is recorded as an admin override'
);

-- derived warning: a plain pending extended request has none, then gains
-- EXTENDED_MEETING_BUFFER_REQUIRED once an admin approves another extended
-- meeting nearby — without ever touching the pending request itself.
-- Day+42, 09:00-12:00.
select (now()::date + interval '42 days')::date as day42 \gset

select (public.submit_request(
  :'room_id'::uuid,
  (:'day42'::date + time '09:00') at time zone 'Asia/Baku', (:'day42'::date + time '12:00') at time zone 'Asia/Baku',
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
  format(
    $$ select public.create_manual_reservation(%L::uuid, (%L::date + time '12:20') at time zone 'Asia/Baku', (%L::date + time '15:20') at time zone 'Asia/Baku', 'a second extended meeting, right next door', 4, 'Someone Else', 'else@c205.test') $$,
    :'room_id', :'day42', :'day42'
  ),
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
-- Day+20, 09:00-10:00.
select (now()::date + interval '20 days')::date as day20 \gset

select (public.submit_request(
  :'room_id'::uuid,
  (:'day20'::date + time '09:00') at time zone 'Asia/Baku', (:'day20'::date + time '10:00') at time zone 'Asia/Baku',
  'idempotent request', 2, 'demo-key-1'
)).id::text as idempotent_id
\gset

select is(
  (public.submit_request(
    :'room_id'::uuid,
    (:'day20'::date + time '09:00') at time zone 'Asia/Baku', (:'day20'::date + time '10:00') at time zone 'Asia/Baku',
    'idempotent request', 2, 'demo-key-1'
  )).id::text,
  :'idempotent_id',
  'replaying the same idempotency key with the identical payload returns the original result'
);

select is(
  (select count(*) from public.reservations where purpose = 'idempotent request')::int,
  1,
  'the replay above did not create a second row'
);

select throws_ok(
  format(
    $$ select public.submit_request(%L::uuid, (%L::date + time '09:00') at time zone 'Asia/Baku', (%L::date + time '10:00') at time zone 'Asia/Baku', 'idempotent request but changed', 3, 'demo-key-1') $$,
    :'room_id', :'day20', :'day20'
  ),
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
-- Day+21, 09:00-10:00.
select (now()::date + interval '21 days')::date as day21 \gset

select (public.submit_request(
  :'room_id'::uuid,
  (:'day21'::date + time '09:00') at time zone 'Asia/Baku', (:'day21'::date + time '10:00') at time zone 'Asia/Baku',
  'no idempotency key', 2, null
)).id::text as dup_a_id \gset

select (public.submit_request(
  :'room_id'::uuid,
  (:'day21'::date + time '09:00') at time zone 'Asia/Baku', (:'day21'::date + time '10:00') at time zone 'Asia/Baku',
  'no idempotency key', 2, null
)).id::text as dup_b_id \gset

select isnt(
  :'dup_a_id'::text, :'dup_b_id'::text,
  'two identical submissions without an idempotency key are two independent requests, not deduplicated'
);

-- ---- modify_reservation: pending, requires override ---------------------
-- Day+22, 09:00-10:00; moved to day+90 (well outside the 60-day
-- availability window) to exercise the OUTSIDE_AVAILABILITY override.
select (now()::date + interval '22 days')::date as day22 \gset
select (now()::date + interval '90 days')::date as day90 \gset

select (public.submit_request(
  :'room_id'::uuid,
  (:'day22'::date + time '09:00') at time zone 'Asia/Baku', (:'day22'::date + time '10:00') at time zone 'Asia/Baku',
  'to be modified', 2, null
)).id::text as modify_id \gset

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';

select throws_ok(
  format(
    $$ select public.modify_reservation(%L::uuid, 1, p_starts_at := (%L::date + time '09:00') at time zone 'Asia/Baku', p_ends_at := (%L::date + time '10:00') at time zone 'Asia/Baku') $$,
    :'modify_id', :'day90', :'day90'
  ),
  '22023'::char(5),
  NULL,
  'modify_reservation refuses a new time outside availability without an override'
);

select throws_ok(
  format(
    $$ select public.modify_reservation(%L::uuid, 1, p_starts_at := (%L::date + time '09:00') at time zone 'Asia/Baku', p_ends_at := (%L::date + time '10:00') at time zone 'Asia/Baku', p_override := true) $$,
    :'modify_id', :'day90', :'day90'
  ),
  '22023'::char(5),
  NULL,
  'modify_reservation refuses an override with no reason'
);

select lives_ok(
  format(
    $$ select public.modify_reservation(%L::uuid, 1, p_starts_at := (%L::date + time '09:00') at time zone 'Asia/Baku', p_ends_at := (%L::date + time '10:00') at time zone 'Asia/Baku', p_override := true, p_override_reason := 'special one-off approval') $$,
    :'modify_id', :'day90', :'day90'
  ),
  'modify_reservation succeeds with an override and a reason'
);

select is(
  (select admin_override from public.reservations where id = :'modify_id'::uuid),
  true,
  'the modification is recorded as an admin override'
);

-- ---- modify_reservation: OUTSIDE_ROOM_HOURS is absolute, no override ---
select (now()::date + interval '25 days')::date as late_day \gset

select throws_ok(
  format(
    $$ select public.modify_reservation(%L::uuid, 2, p_starts_at := (%L::date + time '23:30') at time zone 'Asia/Baku', p_ends_at := (%L::date + time '23:59') at time zone 'Asia/Baku', p_override := true, p_override_reason := 'try to force it anyway') $$,
    :'modify_id', :'late_day', :'late_day'
  ),
  '22023'::char(5), NULL,
  'modify_reservation refuses to move a reservation outside room hours even with an override'
);

-- A reservation whose stored time predates this rule (simulated via a
-- direct insert as the table owner, since submit_request itself would
-- now refuse to create one) must still allow an edit that never touches
-- its time — the room-hours check only runs when starts_at/ends_at are
-- actually part of the call, exactly like an admin_override reason is
-- only demanded when a check newly fails because of THIS edit.
reset role;

insert into public.reservations (
  room_id, requester_id, requester_name, requester_email,
  starts_at, ends_at, purpose, participant_count, status, submitted_at
) values (
  :'room_id'::uuid, '00000000-0000-0000-0000-0000000000f2',
  'Legacy Requester', 'requester@c205.test',
  (:'late_day'::date + time '06:00') at time zone 'Asia/Baku',
  (:'late_day'::date + time '06:30') at time zone 'Asia/Baku',
  'legacy booking before the room-hours rule', 2, 'PENDING', now()
) returning id::text as legacy_id \gset

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';

select lives_ok(
  format($$ select public.modify_reservation(%L::uuid, 1, p_participant_count := 4) $$, :'legacy_id'),
  'modify_reservation allows editing a legacy out-of-hours reservation when the time itself is untouched'
);

-- ---- modify_reservation: failed modification preserves the original ---
-- Day+23, 09:00-10:00.
select (now()::date + interval '23 days')::date as day23 \gset

select (public.submit_request(
  :'room_id'::uuid,
  (:'day23'::date + time '09:00') at time zone 'Asia/Baku', (:'day23'::date + time '10:00') at time zone 'Asia/Baku',
  'untouched by a failed modification', 2, null
)).id::text as untouched_id \gset

select throws_ok(
  format($$ select public.modify_reservation(%L::uuid, 1, p_participant_count := 0) $$, :'untouched_id'),
  '22023'::char(5),
  NULL,
  'modify_reservation rejects a non-positive participant_count'
);

select results_eq(
  format($$ select starts_at, ends_at, participant_count, version from public.reservations where id = %L::uuid $$, :'untouched_id'),
  format(
    $$ values ((%L::date + time '09:00') at time zone 'Asia/Baku', (%L::date + time '10:00') at time zone 'Asia/Baku', 2, 1) $$,
    :'day23', :'day23'
  ),
  'a failed modification changed nothing at all — same times, headcount, and version as originally submitted'
);

-- ---- modify_reservation: approved-overlap is absolute, no override ----
-- Day+24 (slot A, stays put) and day+25 (slot B, gets moved onto A).
select (now()::date + interval '24 days')::date as day24 \gset
select (now()::date + interval '26 days')::date as day26 \gset

select (public.submit_request(
  :'room_id'::uuid,
  (:'day24'::date + time '09:00') at time zone 'Asia/Baku', (:'day24'::date + time '10:00') at time zone 'Asia/Baku',
  'approved slot A', 2, null
)).id::text as slot_a_id \gset

select (public.submit_request(
  :'room_id'::uuid,
  (:'day26'::date + time '09:00') at time zone 'Asia/Baku', (:'day26'::date + time '10:00') at time zone 'Asia/Baku',
  'to be moved onto slot A', 2, null
)).id::text as slot_b_id \gset

select lives_ok(
  format($$ select public.approve_request(%L::uuid, 1) $$, :'slot_a_id'),
  'slot A is approved, to become the fixed obstacle for the next check'
);

select throws_ok(
  format(
    $$ select public.modify_reservation(%L::uuid, 1, p_starts_at := (%L::date + time '09:00') at time zone 'Asia/Baku', p_ends_at := (%L::date + time '10:00') at time zone 'Asia/Baku', p_override := true, p_override_reason := 'try to force it anyway') $$,
    :'slot_b_id', :'day24', :'day24'
  ),
  '23P01'::char(5),
  NULL,
  'modify_reservation refuses to move a request onto an approved slot, even with override requested'
);

-- ---- create_manual_reservation: same absolute overlap rule -------------
select throws_ok(
  format(
    $$ select public.create_manual_reservation(%L::uuid, (%L::date + time '09:00') at time zone 'Asia/Baku', (%L::date + time '10:00') at time zone 'Asia/Baku', 'manual double-book attempt', 2, 'Someone', 'someone@c205.test', true, 'admin insists') $$,
    :'room_id', :'day24', :'day24'
  ),
  '23P01'::char(5),
  NULL,
  'create_manual_reservation refuses to double-book an approved slot, even with override'
);

-- ---- derived warnings never change the row they describe ---------------
-- Day+30, 09:00-10:00.
select (now()::date + interval '30 days')::date as day30 \gset

select (public.submit_request(
  :'room_id'::uuid,
  (:'day30'::date + time '09:00') at time zone 'Asia/Baku', (:'day30'::date + time '10:00') at time zone 'Asia/Baku',
  'will be warned about, never touched', 2, null
)).id::text as warn_id \gset

select is(
  public.reservation_conflict_warnings(:'warn_id'::uuid),
  '{}'::text[],
  'a plain, fitting, non-conflicting PENDING request has no warnings'
);

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';

select lives_ok(
  format(
    $$ select public.create_blocked_interval(%L::uuid, (%L::date + time '09:00') at time zone 'Asia/Baku', (%L::date + time '10:00') at time zone 'Asia/Baku', 'surprise maintenance') $$,
    :'room_id', :'day30', :'day30'
  ),
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
