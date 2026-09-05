-- Narrow, authorized functions for every sensitive write.
--
-- Every function here is SECURITY DEFINER because it needs to write to a
-- table the calling role has no grant on (reservations, audit_events,
-- email_outbox, or protected columns of profiles/app_settings). Each one:
--   1. requires auth.uid() to be non-null (authentication check),
--   2. loads the caller's own profile and checks role/account_status
--      (role + account-state checks),
--   3. validates its inputs before writing anything (input checks),
--   4. sets `search_path = ''` and schema-qualifies every reference, so it
--      cannot be hijacked by a malicious search_path,
--   5. has EXECUTE revoked from PUBLIC/anon and granted only to
--      `authenticated` — Postgres grants EXECUTE on new functions to
--      PUBLIC by default, which is exactly the "unintended default
--      execution permission" the brief calls out.
-- Authorization itself is enforced by the runtime checks inside the
-- function body, not by which Postgres role can call it — every
-- authenticated user can call decide_reservation, for instance, but only
-- one whose own profile is an active ADMIN gets past the first check.

create function public.submit_reservation(
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
  if v_profile is null or v_profile.account_status <> 'ACTIVE' then
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

revoke execute on function public.submit_reservation(uuid, timestamptz, timestamptz, text, integer, text) from public, anon;
grant execute on function public.submit_reservation(uuid, timestamptz, timestamptz, text, integer, text) to authenticated;

create function public.decide_reservation(
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
  if v_admin is null or v_admin.role <> 'ADMIN' or v_admin.account_status <> 'ACTIVE' then
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

  -- If this APPROVED decision overlaps an already-approved reservation for
  -- the same room, reservations_no_overlapping_approved raises here
  -- (SQLSTATE 23P01) and the whole function rolls back.
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

revoke execute on function public.decide_reservation(uuid, public.reservation_status, text) from public, anon;
grant execute on function public.decide_reservation(uuid, public.reservation_status, text) to authenticated;

create function public.cancel_reservation(
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
  if v_profile is null or v_profile.account_status <> 'ACTIVE' then
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

revoke execute on function public.cancel_reservation(uuid, text) from public, anon;
grant execute on function public.cancel_reservation(uuid, text) to authenticated;

create function public.set_account_status(
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
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_admin from public.profiles where id = v_uid;
  if v_admin is null or v_admin.role <> 'ADMIN' or v_admin.account_status <> 'ACTIVE' then
    raise exception 'admin privileges required' using errcode = '42501';
  end if;

  select * into v_before from public.profiles where id = p_profile_id for update;
  if v_before is null then
    raise exception 'profile % not found', p_profile_id using errcode = 'P0002';
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

revoke execute on function public.set_account_status(uuid, public.account_status, text) from public, anon;
grant execute on function public.set_account_status(uuid, public.account_status, text) to authenticated;

create function public.set_user_role(
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
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_admin from public.profiles where id = v_uid;
  if v_admin is null or v_admin.role <> 'ADMIN' or v_admin.account_status <> 'ACTIVE' then
    raise exception 'admin privileges required' using errcode = '42501';
  end if;

  select * into v_before from public.profiles where id = p_profile_id for update;
  if v_before is null then
    raise exception 'profile % not found', p_profile_id using errcode = 'P0002';
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

revoke execute on function public.set_user_role(uuid, public.account_role) from public, anon;
grant execute on function public.set_user_role(uuid, public.account_role) to authenticated;

create function public.set_usg_notification_email(p_email text)
returns public.app_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_admin public.profiles;
  v_before public.app_settings;
  v_after public.app_settings;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_admin from public.profiles where id = v_uid;
  if v_admin is null or v_admin.role <> 'ADMIN' or v_admin.account_status <> 'ACTIVE' then
    raise exception 'admin privileges required' using errcode = '42501';
  end if;

  if p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid email address' using errcode = '22023';
  end if;

  select * into v_before from public.app_settings where id = true for update;

  update public.app_settings
  set usg_notification_email = p_email
  where id = true
  returning * into v_after;

  insert into public.audit_events (
    actor_id, actor_role, action, entity_table, entity_id,
    before_value, after_value
  ) values (
    v_uid, v_admin.role, 'SETTINGS_UPDATED', 'app_settings', 'true',
    to_jsonb(v_before), to_jsonb(v_after)
  );

  return v_after;
end;
$$;

revoke execute on function public.set_usg_notification_email(text) from public, anon;
grant execute on function public.set_usg_notification_email(text) to authenticated;
