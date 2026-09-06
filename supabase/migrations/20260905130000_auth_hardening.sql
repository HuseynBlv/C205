-- Auth hardening for Step 2b: email-verification gating and last-admin
-- protection. This migration only ever CREATE OR REPLACEs functions defined
-- in earlier migrations (never edits those files in place) and adds one new
-- column/trigger/function — the normal way to evolve an already-applied
-- schema.

-- ---------------------------------------------------------------------
-- Email verification, mirrored onto profiles
-- ---------------------------------------------------------------------
-- RLS policies run as the querying role (`authenticated`), which has no
-- grant on the `auth` schema, so they can't reference auth.users directly.
-- Mirroring auth.users.email_confirmed_at onto profiles lets is_active_user
-- / is_active_admin (and every RLS policy that calls them) gate on email
-- verification cheaply, from a table they already have SELECT on.
alter table public.profiles add column email_verified_at timestamptz;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role, account_status, email_verified_at)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), new.email),
    'USER',
    'PENDING',
    new.email_confirmed_at
  );
  return new;
end;
$$;

-- Fires when a user clicks the confirmation link (or an admin/API confirms
-- them directly) — auth.users.email_confirmed_at flips from null to a
-- timestamp on an UPDATE, never on the original INSERT.
create function public.handle_auth_user_email_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is distinct from old.email_confirmed_at then
    update public.profiles set email_verified_at = new.email_confirmed_at where id = new.id;
  end if;
  return new;
end;
$$;

revoke execute on function public.handle_auth_user_email_confirmed() from public, anon, authenticated;

create trigger on_auth_user_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  execute function public.handle_auth_user_email_confirmed();

-- Both helpers now also require a verified email. SECURITY DEFINER is load
-- bearing here (see the profiles migration's comment on these two
-- functions) — replacing them still must not drop that.
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.account_status = 'ACTIVE'
      and p.email_verified_at is not null
  );
$$;

create or replace function public.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'ADMIN'
      and p.account_status = 'ACTIVE'
      and p.email_verified_at is not null
  );
$$;

-- ---------------------------------------------------------------------
-- Same requirement inside the SECURITY DEFINER functions, which check
-- profile fields directly rather than calling is_active_user/is_active_admin.
-- ---------------------------------------------------------------------
create or replace function public.submit_reservation(
  p_room_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_purpose text,
  p_participant_count integer,
  p_idempotency_key text default null
)
returns public.reservations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_reservation public.reservations;
  v_cached jsonb;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if v_profile is null or v_profile.account_status <> 'ACTIVE' or v_profile.email_verified_at is null then
    raise exception 'account is not active' using errcode = '42501';
  end if;

  if p_ends_at <= p_starts_at then
    raise exception 'ends_at must be after starts_at' using errcode = '22023';
  end if;
  if p_participant_count <= 0 then
    raise exception 'participant_count must be positive' using errcode = '22023';
  end if;
  if btrim(coalesce(p_purpose, '')) = '' then
    raise exception 'purpose is required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.rooms where id = p_room_id) then
    raise exception 'room not found' using errcode = '22023';
  end if;

  if p_idempotency_key is not null then
    select response into v_cached
    from public.idempotency_keys
    where scope = 'submit_reservation' and key = p_idempotency_key;
    if found then
      return jsonb_populate_record(null::public.reservations, v_cached);
    end if;
  end if;

  insert into public.reservations (
    room_id, requester_id, requester_name, requester_email,
    starts_at, ends_at, purpose, participant_count, status
  ) values (
    p_room_id, v_uid, v_profile.full_name, v_profile.email,
    p_starts_at, p_ends_at, p_purpose, p_participant_count, 'PENDING'
  )
  returning * into v_reservation;

  insert into public.audit_events (
    actor_id, actor_role, action, entity_table, entity_id, after_value
  ) values (
    v_uid, v_profile.role, 'RESERVATION_SUBMITTED', 'reservations',
    v_reservation.id::text, to_jsonb(v_reservation)
  );

  if p_idempotency_key is not null then
    insert into public.idempotency_keys (scope, key, requester_id, response)
    values ('submit_reservation', p_idempotency_key, v_uid, to_jsonb(v_reservation));
  end if;

  return v_reservation;
end;
$$;

create or replace function public.decide_reservation(
  p_reservation_id uuid,
  p_decision public.reservation_status,
  p_reason text default null
)
returns public.reservations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_admin public.profiles;
  v_before public.reservations;
  v_after public.reservations;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_admin from public.profiles where id = v_uid;
  if v_admin is null or v_admin.role <> 'ADMIN' or v_admin.account_status <> 'ACTIVE' or v_admin.email_verified_at is null then
    raise exception 'admin privileges required' using errcode = '42501';
  end if;

  if p_decision not in ('APPROVED', 'REJECTED') then
    raise exception 'decision must be APPROVED or REJECTED, got %', p_decision
      using errcode = '22023';
  end if;

  select * into v_before from public.reservations where id = p_reservation_id for update;
  if v_before is null then
    raise exception 'reservation % not found', p_reservation_id using errcode = 'P0002';
  end if;
  if v_before.status <> 'PENDING' then
    raise exception 'reservation % is %, not PENDING', p_reservation_id, v_before.status
      using errcode = '55000';
  end if;

  update public.reservations
  set status = p_decision,
      decided_at = now(),
      decided_by = v_uid,
      decision_reason = p_reason
  where id = p_reservation_id
  returning * into v_after;

  insert into public.audit_events (
    actor_id, actor_role, action, entity_table, entity_id, reason,
    before_value, after_value
  ) values (
    v_uid, v_admin.role, 'RESERVATION_DECIDED', 'reservations',
    p_reservation_id::text, p_reason, to_jsonb(v_before), to_jsonb(v_after)
  );

  insert into public.email_outbox (to_email, subject, body, template, metadata, related_reservation_id)
  values (
    v_after.requester_email,
    format('Your C205 request has been %s', lower(p_decision::text)),
    coalesce(p_reason, ''),
    'reservation_decision',
    jsonb_build_object('status', v_after.status, 'reservation_id', v_after.id),
    v_after.id
  );

  return v_after;
end;
$$;

create or replace function public.cancel_reservation(
  p_reservation_id uuid,
  p_reason text default null
)
returns public.reservations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_before public.reservations;
  v_after public.reservations;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if v_profile is null or v_profile.account_status <> 'ACTIVE' or v_profile.email_verified_at is null then
    raise exception 'account is not active' using errcode = '42501';
  end if;

  select * into v_before from public.reservations where id = p_reservation_id for update;
  if v_before is null then
    raise exception 'reservation % not found', p_reservation_id using errcode = 'P0002';
  end if;

  if v_profile.role <> 'ADMIN' and v_before.requester_id is distinct from v_uid then
    raise exception 'not authorized to cancel this reservation' using errcode = '42501';
  end if;
  if v_before.status not in ('PENDING', 'APPROVED') then
    raise exception 'reservation % is %, cannot be cancelled', p_reservation_id, v_before.status
      using errcode = '55000';
  end if;

  update public.reservations
  set status = 'CANCELLED',
      cancelled_at = now(),
      cancelled_by = v_uid,
      cancellation_reason = p_reason
  where id = p_reservation_id
  returning * into v_after;

  insert into public.audit_events (
    actor_id, actor_role, action, entity_table, entity_id, reason,
    before_value, after_value
  ) values (
    v_uid, v_profile.role, 'RESERVATION_CANCELLED', 'reservations',
    p_reservation_id::text, p_reason, to_jsonb(v_before), to_jsonb(v_after)
  );

  insert into public.email_outbox (to_email, subject, body, template, metadata, related_reservation_id)
  values (
    v_after.requester_email,
    'Your C205 request has been cancelled',
    coalesce(p_reason, ''),
    'reservation_cancelled',
    jsonb_build_object('reservation_id', v_after.id),
    v_after.id
  );

  return v_after;
end;
$$;

-- ---------------------------------------------------------------------
-- Last-active-admin protection.
--
-- A single well-known advisory-lock key serializes every code path that
-- either reads or changes "how many active admins currently exist":
-- set_account_status, set_user_role, and bootstrap_first_admin all take it
-- before counting. Two concurrent requests that both touch the active-admin
-- count (e.g. two admins each trying to suspend a different one of the last
-- two admins, or two racing bootstrap attempts) queue up on this lock
-- instead of both reading a stale count — the second one always sees the
-- first one's committed change before deciding. pg_advisory_xact_lock is
-- released automatically at transaction end (commit or rollback), so a
-- failed attempt never leaves the lock held.
-- ---------------------------------------------------------------------
create or replace function public.set_account_status(
  p_profile_id uuid,
  p_status public.account_status,
  p_reason text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_admin public.profiles;
  v_before public.profiles;
  v_after public.profiles;
  v_active_admin_count integer;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_admin from public.profiles where id = v_uid;
  if v_admin is null or v_admin.role <> 'ADMIN' or v_admin.account_status <> 'ACTIVE' or v_admin.email_verified_at is null then
    raise exception 'admin privileges required' using errcode = '42501';
  end if;

  select * into v_before from public.profiles where id = p_profile_id for update;
  if v_before is null then
    raise exception 'profile % not found', p_profile_id using errcode = 'P0002';
  end if;

  if v_before.role = 'ADMIN' and v_before.account_status = 'ACTIVE' and p_status <> 'ACTIVE' then
    perform pg_advisory_xact_lock(hashtext('c205_active_admin_guard'));
    select count(*) into v_active_admin_count
    from public.profiles where role = 'ADMIN' and account_status = 'ACTIVE';
    if v_active_admin_count <= 1 then
      raise exception 'cannot change status: this is the last active administrator' using errcode = '42501';
    end if;
  end if;

  update public.profiles
  set account_status = p_status,
      status_reason = p_reason
  where id = p_profile_id
  returning * into v_after;

  insert into public.audit_events (
    actor_id, actor_role, action, entity_table, entity_id, reason,
    before_value, after_value
  ) values (
    v_uid, v_admin.role, 'ACCOUNT_STATUS_CHANGED', 'profiles',
    p_profile_id::text, p_reason, to_jsonb(v_before), to_jsonb(v_after)
  );

  return v_after;
end;
$$;

create or replace function public.set_user_role(
  p_profile_id uuid,
  p_role public.account_role
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_admin public.profiles;
  v_before public.profiles;
  v_after public.profiles;
  v_active_admin_count integer;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_admin from public.profiles where id = v_uid;
  if v_admin is null or v_admin.role <> 'ADMIN' or v_admin.account_status <> 'ACTIVE' or v_admin.email_verified_at is null then
    raise exception 'admin privileges required' using errcode = '42501';
  end if;

  select * into v_before from public.profiles where id = p_profile_id for update;
  if v_before is null then
    raise exception 'profile % not found', p_profile_id using errcode = 'P0002';
  end if;

  if v_before.role = 'ADMIN' and v_before.account_status = 'ACTIVE' and p_role <> 'ADMIN' then
    perform pg_advisory_xact_lock(hashtext('c205_active_admin_guard'));
    select count(*) into v_active_admin_count
    from public.profiles where role = 'ADMIN' and account_status = 'ACTIVE';
    if v_active_admin_count <= 1 then
      raise exception 'cannot change role: this is the last active administrator' using errcode = '42501';
    end if;
  end if;

  update public.profiles
  set role = p_role
  where id = p_profile_id
  returning * into v_after;

  insert into public.audit_events (
    actor_id, actor_role, action, entity_table, entity_id,
    before_value, after_value
  ) values (
    v_uid, v_admin.role, 'ROLE_CHANGED', 'profiles',
    p_profile_id::text, to_jsonb(v_before), to_jsonb(v_after)
  );

  return v_after;
end;
$$;

-- ---------------------------------------------------------------------
-- Controlled, idempotent first-administrator bootstrap.
--
-- No public administrator registration exists anywhere: this function only
-- ever promotes the CALLER's own account (auth.uid()), never an arbitrary
-- target, and only succeeds while zero active admins exist. The app layer
-- adds a second gate on top (a server-only bootstrap secret env var — see
-- src/app/(setup)/admin-setup), but the database refuses to create a second
-- "first" admin even if that app-layer gate were ever misconfigured or
-- bypassed, and even under a concurrent double-submit (both would race on
-- the same advisory lock key used by every other admin-count-changing path
-- above; only the first to commit sees count = 0).
-- ---------------------------------------------------------------------
create function public.bootstrap_first_admin()
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_active_admin_count integer;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_profile from public.profiles where id = v_uid for update;
  if v_profile is null then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  if v_profile.email_verified_at is null then
    raise exception 'verify your email before requesting administrator setup' using errcode = '42501';
  end if;
  if v_profile.account_status = 'REMOVED' then
    raise exception 'this account cannot be authorized' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('c205_active_admin_guard'));
  select count(*) into v_active_admin_count
  from public.profiles where role = 'ADMIN' and account_status = 'ACTIVE';
  if v_active_admin_count > 0 then
    raise exception 'an administrator already exists' using errcode = '42501';
  end if;

  update public.profiles
  set role = 'ADMIN', account_status = 'ACTIVE', status_reason = null
  where id = v_uid
  returning * into v_profile;

  insert into public.audit_events (
    actor_id, actor_role, action, entity_table, entity_id, reason, after_value
  ) values (
    v_uid, 'ADMIN', 'ADMIN_BOOTSTRAPPED', 'profiles',
    v_uid::text, 'First-administrator setup', to_jsonb(v_profile)
  );

  return v_profile;
end;
$$;

revoke execute on function public.bootstrap_first_admin() from public, anon;
grant execute on function public.bootstrap_first_admin() to authenticated;
