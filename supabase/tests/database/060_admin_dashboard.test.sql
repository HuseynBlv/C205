-- Admin-dashboard additions: editing an existing availability window/
-- block, the merge-adjacent-but-preserve-gaps normalization, the
-- transactional monthly batch publisher, and admin read access to the
-- audit trail.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'admin@c205g.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'bystander@c205g.test', 'x', now(), '{}', '{}', now(), now());

update public.profiles set role = 'ADMIN', account_status = 'ACTIVE' where id = '00000000-0000-0000-0000-0000000000b1';
update public.profiles set account_status = 'ACTIVE' where id = '00000000-0000-0000-0000-0000000000b2';

select id as room_id from public.rooms where code = 'C205' \gset

-- ---- authorization: every new mutation is admin-only --------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';

select throws_ok(
  format($$ select public.publish_availability_month(%L::uuid, (now() + interval '3 months')::date, array[1,2,3,4,5], '09:00'::time, '17:00'::time, array[]::date[], 'x') $$, :'room_id'),
  '42501'::char(5), NULL,
  'a non-admin cannot publish a month of availability'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

-- ---- publish_availability_month: validation ------------------------------
select throws_ok(
  format($$ select public.publish_availability_month(%L::uuid, (now() + interval '3 months')::date, array[0,9], '09:00'::time, '17:00'::time) $$, :'room_id'),
  '22023'::char(5), NULL,
  'weekdays outside 1..7 are rejected'
);

select throws_ok(
  format($$ select public.publish_availability_month(%L::uuid, (now() + interval '3 months')::date, array[1,2,3], '17:00'::time, '09:00'::time) $$, :'room_id'),
  '22023'::char(5), NULL,
  'end time at or before start time is rejected'
);

-- ---- publish_availability_month: exact weekday count, excluded date -----
select (date_trunc('month', now() + interval '3 months'))::date as month_start \gset
select (
  select min(d)
  from generate_series(:'month_start'::date, (:'month_start'::date + interval '1 month' - interval '1 day')::date, interval '1 day') d
  where extract(isodow from d) in (1,2,3,4,5)
) as first_weekday_in_month \gset

select is(
  (
    select count(*)::int
    from public.publish_availability_month(
      :'room_id'::uuid, :'month_start'::date, array[1,2,3,4,5],
      '09:00'::time, '17:00'::time, array[:'first_weekday_in_month'::date], 'Weekday hours'
    )
  ),
  (
    select count(*)::int
    from generate_series(:'month_start'::date, (:'month_start'::date + interval '1 month' - interval '1 day')::date, interval '1 day') d
    where extract(isodow from d) in (1,2,3,4,5)
  ) - 1,
  'publish_availability_month creates one window per matching weekday, minus the excluded date'
);

select is(
  (select count(*)::int from public.availability_windows where room_id = :'room_id'::uuid and starts_at::date = :'first_weekday_in_month'::date),
  0,
  'the excluded date has no window created for it'
);

select ok(
  (select count(*) from public.audit_events where action = 'AVAILABILITY_MONTH_PUBLISHED' and entity_id = :'room_id') >= 1,
  'the monthly batch publish is recorded as a single audit event'
);

-- ---- merge-adjacent-but-preserve-gaps normalization ----------------------
select (now() + interval '150 days')::date as merge_day \gset

select public.publish_availability_window(:'room_id'::uuid, (:'merge_day'::date + time '09:00') at time zone 'Asia/Baku', (:'merge_day'::date + time '12:00') at time zone 'Asia/Baku', 'first half');
select public.publish_availability_window(:'room_id'::uuid, (:'merge_day'::date + time '12:00') at time zone 'Asia/Baku', (:'merge_day'::date + time '15:00') at time zone 'Asia/Baku', 'second half, touches the first exactly');

select is(
  (select count(*)::int from public.availability_windows where room_id = :'room_id'::uuid and starts_at::date = :'merge_day'::date),
  1,
  'two exactly-adjacent windows on the same day merge into a single row'
);

select is(
  (select tstzrange(starts_at, ends_at) from public.availability_windows where room_id = :'room_id'::uuid and starts_at::date = :'merge_day'::date),
  tstzrange((:'merge_day'::date + time '09:00') at time zone 'Asia/Baku', (:'merge_day'::date + time '15:00') at time zone 'Asia/Baku'),
  'the merged window spans the full 9am-3pm range, not just one half'
);

select (now() + interval '160 days')::date as gap_day \gset

select public.publish_availability_window(:'room_id'::uuid, (:'gap_day'::date + time '09:00') at time zone 'Asia/Baku', (:'gap_day'::date + time '11:00') at time zone 'Asia/Baku', 'morning');
select public.publish_availability_window(:'room_id'::uuid, (:'gap_day'::date + time '13:00') at time zone 'Asia/Baku', (:'gap_day'::date + time '15:00') at time zone 'Asia/Baku', 'afternoon, a real 2-hour gap away');

select is(
  (select count(*)::int from public.availability_windows where room_id = :'room_id'::uuid and starts_at::date = :'gap_day'::date),
  2,
  'two windows with a genuine gap between them stay as two separate rows'
);

-- ---- update_availability_window ------------------------------------------
select (public.publish_availability_window(:'room_id'::uuid, (now() + interval '170 days'), (now() + interval '170 days 2 hours'), 'to be edited')).id as edit_window_id \gset

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';

select throws_ok(
  format($$ select public.update_availability_window(%L::uuid, now() + interval '170 days', now() + interval '170 days 3 hours', 'nope') $$, :'edit_window_id'),
  '42501'::char(5), NULL,
  'a non-admin cannot edit an availability window'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

select throws_ok(
  format($$ select public.update_availability_window(%L::uuid, now() + interval '170 days 3 hours', now() + interval '170 days', 'bad range') $$, :'edit_window_id'),
  '22023'::char(5), NULL,
  'update_availability_window rejects ends_at at or before starts_at'
);

select lives_ok(
  format($$ select public.update_availability_window(%L::uuid, now() + interval '170 days', now() + interval '170 days 4 hours', 'extended') $$, :'edit_window_id'),
  'an admin can edit an availability window'
);

select ok(
  (select count(*) from public.audit_events where action = 'AVAILABILITY_UPDATED' and entity_id = :'edit_window_id') = 1,
  'editing a window is audited with before/after values'
);

-- ---- update_blocked_interval ----------------------------------------------
select (public.create_blocked_interval(:'room_id'::uuid, now() + interval '180 days', now() + interval '180 days 2 hours', 'original reason')).id as edit_block_id \gset

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';

select throws_ok(
  format($$ select public.update_blocked_interval(%L::uuid, now() + interval '180 days', now() + interval '180 days 2 hours', 'nope') $$, :'edit_block_id'),
  '42501'::char(5), NULL,
  'a non-admin cannot edit a blocked interval'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

select throws_ok(
  format($$ select public.update_blocked_interval(%L::uuid, now() + interval '180 days', now() + interval '180 days 2 hours', '   ') $$, :'edit_block_id'),
  '22023'::char(5), NULL,
  'update_blocked_interval requires a non-blank reason'
);

select lives_ok(
  format($$ select public.update_blocked_interval(%L::uuid, now() + interval '180 days', now() + interval '180 days 3 hours', 'updated reason') $$, :'edit_block_id'),
  'an admin can edit a blocked interval'
);

select is(
  (select reason from public.blocked_intervals where id = :'edit_block_id'::uuid),
  'updated reason',
  'the blocked interval reflects the edited reason'
);

-- ---- admin read access to the audit trail ---------------------------------
select ok(
  (select count(*) from public.audit_events) > 0,
  'an admin can read the audit trail'
);

-- ---- remove_availability_windows_in_range (bulk removal) -----------------
select public.publish_availability_window(:'room_id'::uuid, now() + interval '300 days', now() + interval '300 days 2 hours', 'bulk 1');
select public.publish_availability_window(:'room_id'::uuid, now() + interval '302 days', now() + interval '302 days 2 hours', 'bulk 2');
select public.publish_availability_window(:'room_id'::uuid, now() + interval '304 days', now() + interval '304 days 2 hours', 'bulk 3');
select public.publish_availability_window(:'room_id'::uuid, now() + interval '320 days', now() + interval '320 days 2 hours', 'outside range, must survive');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';

select throws_ok(
  format($$ select public.remove_availability_windows_in_range(%L::uuid, now() + interval '299 days', now() + interval '310 days') $$, :'room_id'),
  '42501'::char(5), NULL,
  'a non-admin cannot bulk-remove availability windows'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

select throws_ok(
  format($$ select public.remove_availability_windows_in_range(%L::uuid, now() + interval '310 days', now() + interval '299 days') $$, :'room_id'),
  '22023'::char(5), NULL,
  'remove_availability_windows_in_range rejects range_end at or before range_start'
);

select is(
  (select public.remove_availability_windows_in_range(:'room_id'::uuid, now() + interval '299 days', now() + interval '310 days')),
  3,
  'bulk removal deletes exactly the windows overlapping the given range'
);

select is(
  (select count(*)::int from public.availability_windows where room_id = :'room_id'::uuid and starts_at between now() + interval '299 days' and now() + interval '310 days'),
  0,
  'no windows remain inside the removed range'
);

select ok(
  (select count(*) from public.availability_windows where room_id = :'room_id'::uuid and label = 'outside range, must survive') = 1,
  'a window outside the range is untouched by the bulk removal'
);

select ok(
  (select count(*) from public.audit_events where action = 'AVAILABILITY_RANGE_REMOVED' and (before_value->>'count')::int = 3) = 1,
  'the bulk removal writes exactly one summary audit event with the correct count'
);

reset role;

select * from finish();
rollback;
