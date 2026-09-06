-- LOCAL DEVELOPMENT SEED DATA ONLY.
--
-- This file is applied by `supabase db reset` / `supabase start` against
-- your LOCAL Postgres instance only. Supabase does not run seed.sql
-- against a linked hosted/production project. Nothing in this file is a
-- real credential — every account uses an obviously fake @c205.local
-- email and the literal placeholder password below, and none of it is
-- reachable outside your own machine.
--
-- These auth.users rows are inserted directly (bypassing Supabase Auth's
-- normal signup flow), which is a common local-only convenience: it lets
-- `on_auth_user_created` (see the profiles migration) provision matching
-- profiles rows automatically, without needing a running email server.
-- Do not use this technique against a hosted project — always use real
-- sign-up / the Auth admin API there.

-- pgcrypto's crypt()/gen_salt() are used only here, for local dev login
-- convenience, so no production migration depends on the extension.
create extension if not exists pgcrypto with schema public;

-- confirmation_token/recovery_token/email_change_token_new/email_change have
-- no column default in auth.users (unlike phone_change and friends, which
-- default to ''). GoTrue's Go code scans every one of these as a plain
-- string, so leaving them NULL (as a naive column list here would) makes
-- its very first query for the row fail with "converting NULL to string is
-- unsupported" — a real, previously-undiscovered bug this step's actual
-- sign-in testing (not just pgTAP) surfaced. Real signups never hit this:
-- GoTrue's own INSERT always sets these to ''.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-00000000d001',
    'authenticated', 'authenticated', 'admin@c205.local',
    crypt('devpassword123', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Aysel Admin"}',
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-00000000d002',
    'authenticated', 'authenticated', 'active@c205.local',
    crypt('devpassword123', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Kamran Active"}',
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-00000000d003',
    'authenticated', 'authenticated', 'pending@c205.local',
    crypt('devpassword123', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Nigar Pending"}',
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-00000000d004',
    'authenticated', 'authenticated', 'suspended@c205.local',
    crypt('devpassword123', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Elvin Suspended"}',
    now(), now(), '', '', '', ''
  );

-- Promote demo accounts out of the default USER/PENDING the trigger gives
-- every new identity. This direct UPDATE is fine in a seed script (it runs
-- as the Postgres superuser, same as any other local-only setup step) —
-- it is exactly the write path production must never allow a client to
-- reach directly, which is what the RLS/grant tests in
-- supabase/tests/database prove.
update public.profiles set role = 'ADMIN', account_status = 'ACTIVE'
  where id = '00000000-0000-0000-0000-00000000d001';
update public.profiles set account_status = 'ACTIVE'
  where id = '00000000-0000-0000-0000-00000000d002';
-- d003 stays USER/PENDING (the default) to demonstrate the
-- pending-authorization screen.
update public.profiles set account_status = 'SUSPENDED', status_reason = 'Demo: suspended for the storyboard review'
  where id = '00000000-0000-0000-0000-00000000d004';

-- Published availability: weekday business hours for the next two weeks.
--
-- `d::date + time '09:00'` alone produces a naive timestamp, which casts
-- to timestamptz using the *session's* timezone — UTC for this database,
-- not C205's own Asia/Baku (`rooms.timezone`). Without the explicit
-- `at time zone 'Asia/Baku'` conversion below, "09:00-18:00" would
-- actually be stored as 13:00-22:00 Baku time: internally consistent (every
-- other naive timestamp in this file had the same bug, so nothing here
-- ever conflicted with itself) but wrong versus what a real, timezone-
-- aware client — like the actual request form, once Step 3b wired it up —
-- means by "9am". That mismatch was real and user-visible, not
-- theoretical: it's exactly what surfaced this bug.
insert into public.availability_windows (room_id, starts_at, ends_at, label, published_by)
select
  r.id,
  (d::date + time '09:00') at time zone 'Asia/Baku',
  (d::date + time '18:00') at time zone 'Asia/Baku',
  'Weekday hours',
  '00000000-0000-0000-0000-00000000d001'
from public.rooms r
cross join generate_series(current_date, current_date + interval '13 days', interval '1 day') as d
where r.code = 'C205'
  and extract(isodow from d) between 1 and 5;

-- A blocked interval: a maintenance window this week.
insert into public.blocked_intervals (room_id, starts_at, ends_at, reason, blocked_by)
select r.id,
       (current_date + interval '2 days 08:00') at time zone 'Asia/Baku',
       (current_date + interval '2 days 09:00') at time zone 'Asia/Baku',
       'Facilities maintenance', '00000000-0000-0000-0000-00000000d001'
from public.rooms r where r.code = 'C205';

-- Sample reservations spanning every status, via the real functions (not
-- direct inserts) so this seed also doubles as a smoke test that the
-- functions work end-to-end against a fresh database.
--
-- submit_request() now actually enforces "fits published availability",
-- and only weekdays get a published window (see above) — so demo dates
-- are anchored to the next few real weekdays rather than a fixed
-- day-count offset, which would land on a weekend (and fail with
-- OUTSIDE_AVAILABILITY) roughly two-sevenths of the time depending on
-- which day `supabase db reset` happens to run.
do $$
declare
  v_room_id uuid;
  v_weekday_dates date[] := '{}';
  v_candidate date := current_date + 1;
  v_approved_id uuid;
  v_approved_version integer;
  v_rejected_id uuid;
  v_cancel_demo_id uuid;
  v_cancel_demo_version integer;
begin
  select id into v_room_id from public.rooms where code = 'C205';

  while array_length(v_weekday_dates, 1) is null or array_length(v_weekday_dates, 1) < 3 loop
    if extract(isodow from v_candidate) between 1 and 5 then
      v_weekday_dates := array_append(v_weekday_dates, v_candidate);
    end if;
    v_candidate := v_candidate + 1;
  end loop;

  set local role authenticated;
  set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000d002","role":"authenticated"}';

  -- Stays PENDING: nothing further happens to it. Same `at time zone
  -- 'Asia/Baku'` conversion as the availability windows above, and for
  -- the same reason — these must land inside those windows' *actual*
  -- Baku hours, not whatever the session timezone happens to be.
  perform public.submit_request(
    v_room_id,
    (v_weekday_dates[1] + time '10:00') at time zone 'Asia/Baku',
    (v_weekday_dates[1] + time '11:00') at time zone 'Asia/Baku',
    'USG budget review', 6, null
  );

  v_approved_id := (public.submit_request(
    v_room_id,
    (v_weekday_dates[2] + time '14:00') at time zone 'Asia/Baku',
    (v_weekday_dates[2] + time '15:30') at time zone 'Asia/Baku',
    'Club fair planning', 10, null
  )).id;
  v_approved_version := 1;

  v_rejected_id := (public.submit_request(
    v_room_id,
    (v_weekday_dates[2] + time '14:30') at time zone 'Asia/Baku',
    (v_weekday_dates[2] + time '15:00') at time zone 'Asia/Baku',
    'Overlaps the club fair planning slot above', 3, null
  )).id;

  v_cancel_demo_id := (public.submit_request(
    v_room_id,
    (v_weekday_dates[3] + time '09:00') at time zone 'Asia/Baku',
    (v_weekday_dates[3] + time '10:00') at time zone 'Asia/Baku',
    'Study group', 4, null
  )).id;

  reset role;
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000d001","role":"authenticated"}';

  perform public.approve_request(v_approved_id, v_approved_version, false, 'Approved for planning purposes');
  perform public.reject_request(v_rejected_id, 1, 'Conflicts with an already-approved booking');

  -- Demonstrate APPROVED -> CANCELLED (cancel_reservation only accepts an
  -- already-approved reservation, matching the real state machine).
  v_cancel_demo_version := (public.approve_request(v_cancel_demo_id, 1, false, 'Approved, then cancelled below for the demo')).version;

  reset role;
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000d002","role":"authenticated"}';

  perform public.cancel_reservation(v_cancel_demo_id, v_cancel_demo_version, 'Scheduling conflict, will resubmit');

  reset role;
end;
$$;
