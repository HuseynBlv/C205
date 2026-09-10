-- The background email-sending worker's authorization: a shared secret
-- (set_email_worker_secret, admin-only) gates claim_pending_emails /
-- mark_email_sent / mark_email_failed — the only path to public.email_outbox,
-- which grants nothing to anon/authenticated directly. Exercised as the
-- `anon` role with no JWT at all, matching how the real cron worker
-- actually connects (there is no signed-in user for a scheduled job) —
-- every raw SELECT against email_outbox itself runs back on the default
-- (superuser) role, since anon has no grant on the table at all, only on
-- the three functions.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'admin@c205h.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c2', 'authenticated', 'authenticated', 'bystander@c205h.test', 'x', now(), '{}', '{}', now(), now());

update public.profiles set role = 'ADMIN', account_status = 'ACTIVE' where id = '00000000-0000-0000-0000-0000000000c1';
update public.profiles set account_status = 'ACTIVE' where id = '00000000-0000-0000-0000-0000000000c2';

-- ---- set_email_worker_secret: admin-only, minimum length ------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}';

select throws_ok(
  $$ select public.set_email_worker_secret('a-perfectly-long-enough-secret') $$,
  '42501'::char(5), NULL,
  'a non-admin cannot set the email worker secret'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';

select throws_ok(
  $$ select public.set_email_worker_secret('too-short') $$,
  '22023'::char(5), NULL,
  'a secret shorter than 20 characters is rejected'
);

select lives_ok(
  $$ select public.set_email_worker_secret('correct-horse-battery-staple-9000') $$,
  'an admin can set the email worker secret'
);

reset role;

select ok(
  (select count(*) from public.audit_events where action = 'EMAIL_WORKER_SECRET_ROTATED') = 1,
  'rotating the secret is audited'
);

select is(
  (select count(*) from public.audit_events where action = 'EMAIL_WORKER_SECRET_ROTATED' and (before_value is not null or after_value is not null)),
  0::bigint,
  'the audit row never records the secret''s own value'
);

-- ---- seed a couple of outbox rows to drain (as postgres, bypassing RLS) --
insert into public.email_outbox (to_email, subject, body, template, metadata)
values
  ('one@example.test', 'Subject one', 'Body one', 'test_template', '{}'::jsonb),
  ('two@example.test', 'Subject two', 'Body two', 'test_template', '{}'::jsonb);

select id as first_id from public.email_outbox where subject = 'Subject one' \gset
select id as second_id from public.email_outbox where subject = 'Subject two' \gset

-- ---- every function requires the correct secret, even unauthenticated ----
set local role anon;

select throws_ok(
  $$ select public.claim_pending_emails('wrong-secret', 5) $$,
  '28000'::char(5), NULL,
  'claim_pending_emails rejects the wrong secret'
);

select throws_ok(
  $$ select public.mark_email_sent('wrong-secret', gen_random_uuid()) $$,
  '28000'::char(5), NULL,
  'mark_email_sent rejects the wrong secret'
);

select throws_ok(
  $$ select public.mark_email_failed('wrong-secret', gen_random_uuid(), 'x') $$,
  '28000'::char(5), NULL,
  'mark_email_failed rejects the wrong secret'
);

-- ---- claim_pending_emails: correct secret, as the anon role --------------
select is(
  (select count(*)::int from public.claim_pending_emails('correct-horse-battery-staple-9000', 1)),
  1,
  'claim_pending_emails with the correct secret returns up to the requested limit'
);

-- ---- mark_email_sent --------------------------------------------------
select public.mark_email_sent('correct-horse-battery-staple-9000', :'second_id'::uuid);

reset role;

select is(
  (select count(*)::int from public.email_outbox where status = 'PENDING' and attempts = 1),
  1,
  'the claimed row had its attempts counter incremented, but stayed PENDING'
);

select is(
  (select status::text from public.email_outbox where id = :'second_id'::uuid),
  'SENT',
  'mark_email_sent transitions the row to SENT'
);

select ok(
  (select sent_at from public.email_outbox where id = :'second_id'::uuid) is not null,
  'mark_email_sent records sent_at'
);

-- ---- mark_email_failed: only reaches FAILED once attempts is exhausted --
update public.email_outbox set attempts = 4, status = 'PENDING' where id = :'first_id'::uuid;

set local role anon;
select public.mark_email_failed('correct-horse-battery-staple-9000', :'first_id'::uuid, 'still under 5 attempts');
reset role;

select is(
  (select status::text from public.email_outbox where id = :'first_id'::uuid),
  'PENDING',
  'mark_email_failed keeps the row PENDING while attempts stays below the threshold'
);

update public.email_outbox set attempts = 5 where id = :'first_id'::uuid;

set local role anon;
select public.mark_email_failed('correct-horse-battery-staple-9000', :'first_id'::uuid, 'fifth attempt failed');
reset role;

select is(
  (select status::text from public.email_outbox where id = :'first_id'::uuid),
  'FAILED',
  'mark_email_failed transitions to FAILED once attempts reaches the threshold'
);

select is(
  (select last_error from public.email_outbox where id = :'first_id'::uuid),
  'fifth attempt failed',
  'mark_email_failed records the last error message'
);

-- ---- get_reservation_for_notification: same secret, full row ------------
insert into public.availability_windows (room_id, starts_at, ends_at, label, published_by)
select id, now() + interval '199 days', now() + interval '201 days', 'Test window', '00000000-0000-0000-0000-0000000000c1'
from public.rooms where code = 'C205';

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}';

select (now() + interval '200 days')::date as day200 \gset

select (public.submit_request(
  (select id from public.rooms where code = 'C205'),
  (:'day200'::date + time '09:00') at time zone 'Asia/Baku', (:'day200'::date + time '10:00') at time zone 'Asia/Baku',
  'notification lookup test', 3, null
)).id as notif_reservation_id \gset

reset role;
set local role anon;

select throws_ok(
  format($$ select public.get_reservation_for_notification('wrong-secret', %L::uuid) $$, :'notif_reservation_id'),
  '28000'::char(5), NULL,
  'get_reservation_for_notification rejects the wrong secret'
);

select is(
  (select (public.get_reservation_for_notification('correct-horse-battery-staple-9000', :'notif_reservation_id'::uuid)).purpose),
  'notification lookup test',
  'get_reservation_for_notification returns the full reservation row with the correct secret'
);

select is(
  (select (public.get_reservation_for_notification('correct-horse-battery-staple-9000', gen_random_uuid())).id),
  null::uuid,
  'get_reservation_for_notification returns null for a nonexistent id, not an error'
);

reset role;

select * from finish();
rollback;
