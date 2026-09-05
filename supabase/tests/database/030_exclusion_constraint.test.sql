-- Exclusion constraint tests: adjacent APPROVED bookings are allowed,
-- overlapping PENDING requests are allowed, overlapping APPROVED bookings
-- are impossible — scoped per room.
--
-- These run as the connecting (table-owner) role directly against the
-- table, deliberately bypassing RLS/functions, to isolate the constraint
-- itself from the authorization layer already covered by the other two
-- test files. Not executed in this environment (no local Docker/Supabase
-- instance available) — run via `supabase test db` and verify.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into public.rooms (code, name, timezone) values ('TEST-ROOM', 'Test Room', 'Asia/Baku');

select lives_ok(
  $$ insert into public.reservations (room_id, requester_name, requester_email, starts_at, ends_at, purpose, participant_count, status)
     select id, 'Fixture', 'fixture@c205.test', '2027-01-01 10:00+04', '2027-01-01 11:00+04', 'A', 2, 'APPROVED'
     from public.rooms where code = 'C205' $$,
  'first APPROVED booking succeeds'
);

select lives_ok(
  $$ insert into public.reservations (room_id, requester_name, requester_email, starts_at, ends_at, purpose, participant_count, status)
     select id, 'Fixture', 'fixture@c205.test', '2027-01-01 11:00+04', '2027-01-01 12:00+04', 'B (adjacent)', 2, 'APPROVED'
     from public.rooms where code = 'C205' $$,
  'an adjacent APPROVED booking (starts exactly when the previous one ends) is allowed'
);

select throws_ok(
  $$ insert into public.reservations (room_id, requester_name, requester_email, starts_at, ends_at, purpose, participant_count, status)
     select id, 'Fixture', 'fixture@c205.test', '2027-01-01 10:30+04', '2027-01-01 11:30+04', 'C (overlaps A)', 2, 'APPROVED'
     from public.rooms where code = 'C205' $$,
  '23P01'::char(5),
  NULL,
  'an overlapping APPROVED booking for the same room is impossible'
);

select lives_ok(
  $$ insert into public.reservations (room_id, requester_name, requester_email, starts_at, ends_at, purpose, participant_count, status)
     select id, 'Fixture', 'fixture@c205.test', '2027-01-01 10:00+04', '2027-01-01 11:00+04', 'D (pending, same slot as A)', 2, 'PENDING'
     from public.rooms where code = 'C205' $$,
  'a PENDING request overlapping an already-APPROVED booking is allowed'
);

select lives_ok(
  $$ insert into public.reservations (room_id, requester_name, requester_email, starts_at, ends_at, purpose, participant_count, status)
     select id, 'Fixture', 'fixture@c205.test', '2027-01-01 10:15+04', '2027-01-01 10:45+04', 'E (another overlapping pending)', 2, 'PENDING'
     from public.rooms where code = 'C205' $$,
  'a second, differently-timed PENDING request overlapping the same window is also allowed'
);

select throws_ok(
  format(
    $$ update public.reservations set status = 'APPROVED' where purpose = 'D (pending, same slot as A)' and room_id = %L $$,
    (select id from public.rooms where code = 'C205')
  ),
  '23P01'::char(5),
  NULL,
  'approving a PENDING request that overlaps an existing APPROVED booking is impossible'
);

select lives_ok(
  $$ insert into public.reservations (room_id, requester_name, requester_email, starts_at, ends_at, purpose, participant_count, status)
     select id, 'Fixture', 'fixture@c205.test', '2027-01-01 10:00+04', '2027-01-01 11:00+04', 'F (same time, different room)', 2, 'APPROVED'
     from public.rooms where code = 'TEST-ROOM' $$,
  'an APPROVED booking at the same time in a different room does not conflict'
);

select * from finish();
rollback;
