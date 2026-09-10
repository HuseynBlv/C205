-- Auth hardening tests: signup metadata cannot grant privilege, email
-- verification gates access independently of account_status, the last
-- active administrator can't be demoted/suspended (even by themselves),
-- bootstrap_first_admin is properly one-time and self-only, and a status
-- change takes effect immediately against an already-authenticated
-- session (no new token needed).
--
-- See 010_rls_and_grants.test.sql for the role/JWT-claim simulation
-- technique.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

-- ---- fixtures ---------------------------------------------------------
-- c1, c2: will become admins (one at a time) to test last-admin protection.
-- c3: created unverified, to test the email-verification gate directly.
-- c4: a plain ACTIVE, verified, non-admin user (privilege-escalation +
--     suspend-with-existing-session subject).
-- c5: verified but PENDING, used as the one who successfully bootstraps.
-- c7: unverified, used to prove bootstrap refuses an unverified caller.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'c1@c205.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c2', 'authenticated', 'authenticated', 'c2@c205.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c3', 'authenticated', 'authenticated', 'c3@c205.test', 'x', null, '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c4', 'authenticated', 'authenticated', 'c4@c205.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c5', 'authenticated', 'authenticated', 'c5@c205.test', 'x', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c7', 'authenticated', 'authenticated', 'c7@c205.test', 'x', null, '{}', '{}', now(), now());

-- supabase/seed.sql's demo admin (admin@c205.local) is ACTIVE/ADMIN in any
-- freshly reset database. Clear it so this file's "last active
-- administrator" scenarios start from a known, controlled baseline of
-- exactly the admins this file creates itself.
update public.profiles set role = 'USER' where role = 'ADMIN';

update public.profiles set role = 'ADMIN', account_status = 'ACTIVE' where id = '00000000-0000-0000-0000-0000000000c1';
update public.profiles set account_status = 'ACTIVE' where id = '00000000-0000-0000-0000-0000000000c3';
update public.profiles set account_status = 'ACTIVE' where id = '00000000-0000-0000-0000-0000000000c4';

-- ---- signup metadata can never grant privilege -------------------------
-- Simulates a signup where the client-supplied metadata tries to claim
-- role/account_status directly. The trigger must ignore both fields.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values (
  '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c6',
  'authenticated', 'authenticated', 'c6@c205.test', 'x', now(), '{}',
  '{"full_name":"Attempted Admin","role":"ADMIN","account_status":"ACTIVE"}', now(), now()
);

select is(
  (select role::text from public.profiles where id = '00000000-0000-0000-0000-0000000000c6'),
  'USER',
  'signup metadata claiming role=ADMIN is ignored; new account is always USER'
);
select is(
  (select account_status::text from public.profiles where id = '00000000-0000-0000-0000-0000000000c6'),
  'PENDING',
  'signup metadata claiming account_status=ACTIVE is ignored; new account is always PENDING'
);

-- ---- email verification gates access independently of account_status --
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}';

select is(
  (select public.is_active_user()),
  false,
  'an ACTIVE but unverified account is not treated as active'
);

reset role;
-- Simulate clicking the confirmation link.
update auth.users set email_confirmed_at = now() where id = '00000000-0000-0000-0000-0000000000c3';

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}';

select is(
  (select public.is_active_user()),
  true,
  'once verified, the same ACTIVE account is now treated as active'
);

reset role;

-- ---- verifying an email queues an admin notification -------------------
select ok(
  exists (
    select 1 from public.email_outbox
    where template = 'account_registered_admin'
      and to_email = (select usg_notification_email from public.app_settings where id = true)
      and body like '%c3@c205.test%'
  ),
  'confirming an email queues an admin notification naming the new account'
);

select is(
  (
    select count(*)::int from public.email_outbox
    where template = 'account_registered_admin' and body like '%c3@c205.test%'
  ),
  1,
  'exactly one admin notification is queued per email confirmation, not a duplicate'
);

-- ---- last active administrator cannot be demoted or suspended ---------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';

select throws_ok(
  $$ select public.set_account_status('00000000-0000-0000-0000-0000000000c1', 'SUSPENDED', 'self-suspend attempt') $$,
  '42501'::char(5),
  NULL,
  'the sole active administrator cannot suspend even themselves'
);

select throws_ok(
  $$ select public.set_user_role('00000000-0000-0000-0000-0000000000c1', 'USER') $$,
  '42501'::char(5),
  NULL,
  'the sole active administrator cannot demote even themselves'
);

reset role;
-- Promote a second admin directly (table owner) so the guard's "more than
-- one" branch can be exercised through the real function next.
update public.profiles set role = 'ADMIN', account_status = 'ACTIVE' where id = '00000000-0000-0000-0000-0000000000c2';

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';

select lives_ok(
  $$ select public.set_account_status('00000000-0000-0000-0000-0000000000c1', 'SUSPENDED', 'now safe: a second admin exists') $$,
  'with a second active admin present, suspending the first now succeeds'
);

reset role;
-- c2 is now the only active admin left (c1 was just suspended above).
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}';

select throws_ok(
  $$ select public.set_account_status('00000000-0000-0000-0000-0000000000c2', 'SUSPENDED', 'self-suspend attempt') $$,
  '42501'::char(5),
  NULL,
  'the guard re-applies to whichever admin is currently the last one, not just the original'
);

reset role;

-- ---- privilege escalation attempts -------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c4","role":"authenticated"}';

select throws_ok(
  $$ select public.set_user_role('00000000-0000-0000-0000-0000000000c4', 'ADMIN') $$,
  '42501'::char(5),
  NULL,
  'a non-admin cannot call set_user_role to promote themselves'
);

select throws_ok(
  $$ select public.bootstrap_first_admin() $$,
  '42501'::char(5),
  NULL,
  'bootstrap_first_admin refuses to run while an administrator already exists'
);

reset role;

-- ---- bootstrap_first_admin: controlled, one-time, self-only -----------
-- Clear every admin (table owner bypass, same convention as seed.sql) to
-- reach a genuine zero-admin state for the success path below.
update public.profiles set role = 'USER' where role = 'ADMIN';

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c7","role":"authenticated"}';

select throws_ok(
  $$ select public.bootstrap_first_admin() $$,
  '42501'::char(5),
  NULL,
  'bootstrap_first_admin refuses an unverified caller even with zero admins'
);

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c5","role":"authenticated"}';

select lives_ok(
  $$ select public.bootstrap_first_admin() $$,
  'a verified caller successfully bootstraps when zero admins exist'
);

select is(
  (select role::text from public.profiles where id = '00000000-0000-0000-0000-0000000000c5'),
  'ADMIN',
  'bootstrap_first_admin promotes exactly the caller (auth.uid()), never an arbitrary target'
);
select is(
  (select account_status::text from public.profiles where id = '00000000-0000-0000-0000-0000000000c5'),
  'ACTIVE',
  'bootstrap_first_admin also activates the account, not just the role'
);

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c4","role":"authenticated"}';

select throws_ok(
  $$ select public.bootstrap_first_admin() $$,
  '42501'::char(5),
  NULL,
  'bootstrap_first_admin is not re-runnable once an administrator exists (idempotent, not repeatable)'
);

reset role;

-- ---- suspension takes effect against an already-authenticated session -
-- c4's simulated JWT claims never change across these three checks — only
-- the underlying profiles row does. This is the same mechanism (RLS/
-- functions re-check profiles on every call) that makes "no new token
-- needed" true in the real app, not a special case added for the test.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c4","role":"authenticated"}';

select is(
  (select public.is_active_user()),
  true,
  'c4 has reservation access before being suspended'
);

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c5","role":"authenticated"}';

select lives_ok(
  $$ select public.set_account_status('00000000-0000-0000-0000-0000000000c4', 'SUSPENDED', 'existing-session test') $$,
  'the (real) admin can suspend c4'
);

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c4","role":"authenticated"}';

select is(
  (select public.is_active_user()),
  false,
  'the same unchanged session immediately loses access once suspended — no new token was issued or needed'
);

reset role;

-- ---- a non-admin cannot change a DIFFERENT user's account status ------
-- c2's role was cleared back to USER by the "clear every admin" step
-- above, while its account_status stayed ACTIVE (only role was ever
-- touched on c2) — a genuine active-but-non-admin persona, distinct from
-- c4's story above (attempting on themselves).
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}';

select throws_ok(
  $$ select public.set_account_status('00000000-0000-0000-0000-0000000000c1', 'ACTIVE', 'not an admin') $$,
  '42501'::char(5),
  NULL,
  'a non-admin cannot call set_account_status on a different user'
);

reset role;

select * from finish();
rollback;
