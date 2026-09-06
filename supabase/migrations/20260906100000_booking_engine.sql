-- Booking engine: the authoritative C205 scheduling operations.
--
-- Every scheduling mutation in this file (submit_request, approve_request,
-- reject_request, cancel_reservation, modify_reservation,
-- create_manual_reservation, and the availability/block mutations) locks
-- the SAME row first — the room's own row in public.rooms — before reading
-- any scheduling state, and always in the same order (room, then the
-- specific reservation row when one is already known). With one room this
-- fully serializes every scheduling write; with more rooms it would
-- serialize per-room without blocking unrelated rooms. This is the primary
-- correctness guarantee against concurrent approvals/modifications/
-- availability changes racing each other. The exclusion constraint added
-- in the reservations migration (reservations_no_overlapping_approved) is
-- kept as-is and remains the final guarantee below the lock — if anything
-- ever bypassed these functions (it shouldn't be able to: there is no
-- other grant path to the reservations table), the constraint still holds.
--
-- Stable, machine-checkable error identifiers are returned as the
-- exception MESSAGE text itself (not something separate), so client code
-- can safely match on error.message: ACCOUNT_NOT_AUTHORIZED,
-- ADVANCE_NOTICE_REQUIRED, OUTSIDE_AVAILABILITY, RESERVATION_CONFLICT,
-- INVALID_STATUS_TRANSITION, STALE_RESERVATION_VERSION. Other, more
-- situational validation errors (bad input shape, not-found) keep the
-- codebase's existing free-text-message convention since they aren't part
-- of this contract.

-- ---------------------------------------------------------------------
-- Idempotency: scope by actor too, and store the original payload so a
-- replay with a *different* payload under the same key can be rejected
-- instead of silently returning a mismatched cached result.
-- ---------------------------------------------------------------------
alter table public.idempotency_keys add column payload jsonb not null default '{}'::jsonb;
alter table public.idempotency_keys drop constraint idempotency_keys_pkey;
alter table public.idempotency_keys add constraint idempotency_keys_pkey primary key (scope, requester_id, key);

-- ---------------------------------------------------------------------
-- Availability mutations now go through locked functions, same as
-- reservations — direct client writes are revoked. This is what makes the
-- room-row lock actually mean something: without this, an admin's plain
-- UPDATE from a REST call could change availability out from under a
-- concurrent submit_request/approve_request mid-check, bypassing the lock
-- entirely. Read access (the existing *_select_active policies) is
-- unaffected.
-- ---------------------------------------------------------------------
revoke insert, update, delete on public.availability_windows from authenticated;
revoke insert, update, delete on public.blocked_intervals from authenticated;

-- ---------------------------------------------------------------------
-- Helpers. SECURITY DEFINER (not INVOKER): these are called from inside
-- other SECURITY DEFINER functions where that makes no difference, but
-- also need to see the *complete* picture of availability/blocks/approved
-- reservations regardless of which room-scoped RLS policy the original
-- caller would otherwise be limited by — e.g. reservations RLS only lets a
-- regular user see their own rows, which would silently under-count
-- conflicts if these ran as invoker.
-- ---------------------------------------------------------------------

-- Does [p_starts_at, p_ends_at) fit entirely inside the union of published
-- availability windows for the room, minus any blocked interval that
-- overlaps it at all? range_agg/multirange containment (<@) computes "is
-- this range fully covered by the union of these ranges" directly, so
-- back-to-back availability windows (9-12 and 12-15) correctly cover a
-- request spanning both (10-14) without extra gap-stitching logic.
create function public.reservation_fits_availability(
  p_room_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(
      (
        select tstzrange(p_starts_at, p_ends_at, '[)') <@ range_agg(tstzrange(starts_at, ends_at, '[)'))
        from public.availability_windows
        where room_id = p_room_id
      ),
      false
    )
    and not exists (
      select 1
      from public.blocked_intervals b
      where b.room_id = p_room_id
        and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
    );
$$;

revoke execute on function public.reservation_fits_availability(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.reservation_fits_availability(uuid, timestamptz, timestamptz) to authenticated;

-- Does [p_starts_at, p_ends_at) overlap any currently APPROVED reservation
-- for the room, other than p_exclude_id (used when re-checking a
-- reservation against itself during approval/modification)?
create function public.reservation_overlaps_approved(
  p_room_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_exclude_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.reservations r
    where r.room_id = p_room_id
      and r.status = 'APPROVED'
      and (p_exclude_id is null or r.id <> p_exclude_id)
      and tstzrange(r.starts_at, r.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
  );
$$;

revoke execute on function public.reservation_overlaps_approved(uuid, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.reservation_overlaps_approved(uuid, timestamptz, timestamptz, uuid) to authenticated;

-- Derived, read-time-only warnings for a PENDING reservation: never
-- changes anything, never auto-cancels or auto-rejects the row it looks
-- at. A pending request that no longer fits published availability (a
-- block or availability change since it was submitted) or now overlaps a
-- since-approved reservation stays exactly PENDING — this just tells a
-- viewer why approving it as-is would fail.
create function public.reservation_conflict_warnings(p_reservation_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_r public.reservations;
  v_caller public.profiles;
begin
  if v_uid is null then
    raise exception 'ACCOUNT_NOT_AUTHORIZED' using errcode = '28000';
  end if;

  select * into v_r from public.reservations where id = p_reservation_id;
  if v_r is null then
    raise exception 'reservation % not found', p_reservation_id using errcode = 'P0002';
  end if;

  select * into v_caller from public.profiles where id = v_uid;
  if v_caller is null or (v_caller.role <> 'ADMIN' and v_r.requester_id is distinct from v_uid) then
    raise exception 'ACCOUNT_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  return array_remove(array[
    case when not public.reservation_fits_availability(v_r.room_id, v_r.starts_at, v_r.ends_at)
      then 'OUTSIDE_AVAILABILITY' end,
    case when public.reservation_overlaps_approved(v_r.room_id, v_r.starts_at, v_r.ends_at, v_r.id)
      then 'RESERVATION_CONFLICT' end
  ], null);
end;
$$;

revoke execute on function public.reservation_conflict_warnings(uuid) from public, anon;
grant execute on function public.reservation_conflict_warnings(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Replaced by the functions below: submit_reservation, decide_reservation,
-- and the old two-argument cancel_reservation. A DROP (not just REPLACE)
-- is required because the new versions have different parameter lists.
-- ---------------------------------------------------------------------
drop function if exists public.submit_reservation(uuid, timestamptz, timestamptz, text, integer, text);
drop function if exists public.decide_reservation(uuid, public.reservation_status, text);
drop function if exists public.cancel_reservation(uuid, text);

-- ---------------------------------------------------------------------
-- submit_request
-- ---------------------------------------------------------------------
create function public.submit_request(
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
  v_submitted_at timestamptz;
  v_payload jsonb;
  v_cached record;
  v_reservation public.reservations;
begin
  if v_uid is null then
    raise exception 'ACCOUNT_NOT_AUTHORIZED' using errcode = '28000';
  end if;

  -- Identity/permission is checked before the room lock is even attempted
  -- — it isn't scheduling state, and a caller who fails this should never
  -- cause lock contention on the room at all. Also load-bearing for a
  -- subtler reason: p_room_id is itself usually supplied via a client-side
  -- subquery on `rooms`, which is RLS-gated to active users — a suspended
  -- caller's own subquery would already resolve to NULL, so this ordering
  -- is what makes the failure reason reported back ACCOUNT_NOT_AUTHORIZED
  -- rather than a confusing "room <NULL> not found".
  select * into v_profile from public.profiles where id = v_uid;
  if v_profile is null or v_profile.account_status <> 'ACTIVE' or v_profile.email_verified_at is null then
    raise exception 'ACCOUNT_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  -- Lock the room before reading or deciding anything about scheduling
  -- state. Every other scheduling mutation in this file takes this same
  -- lock first, which is what actually prevents two concurrent
  -- submissions/approvals/modifications from ever interleaving.
  perform 1 from public.rooms where id = p_room_id for update;
  if not found then
    raise exception 'room % not found', p_room_id using errcode = '22023';
  end if;

  v_payload := jsonb_build_object(
    'room_id', p_room_id, 'starts_at', p_starts_at, 'ends_at', p_ends_at,
    'purpose', p_purpose, 'participant_count', p_participant_count
  );

  -- Idempotency: a replay with the same key while holding the same room
  -- lock can only ever be strictly sequential with the original call (not
  -- concurrent — the lock above serializes it), so this read is safe
  -- without an extra lock of its own.
  if p_idempotency_key is not null then
    select payload, response into v_cached
    from public.idempotency_keys
    where scope = 'submit_request' and requester_id = v_uid and key = p_idempotency_key;
    if found then
      if v_cached.payload is distinct from v_payload then
        raise exception 'idempotency key already used with a different payload' using errcode = '23505';
      end if;
      return jsonb_populate_record(null::public.reservations, v_cached.response);
    end if;
  end if;

  -- Captured after acquiring the room lock (clock_timestamp(), not now() —
  -- now() is frozen at transaction start, which could predate however long
  -- this call waited on the lock).
  v_submitted_at := clock_timestamp();

  if p_starts_at <= v_submitted_at then
    raise exception 'starts_at must be in the future' using errcode = '22023';
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

  if not public.reservation_fits_availability(p_room_id, p_starts_at, p_ends_at) then
    raise exception 'OUTSIDE_AVAILABILITY' using errcode = '22023';
  end if;

  if public.reservation_overlaps_approved(p_room_id, p_starts_at, p_ends_at) then
    raise exception 'RESERVATION_CONFLICT' using errcode = '23P01';
  end if;

  if (p_ends_at - p_starts_at) >= interval '2 hours'
     and p_starts_at < v_submitted_at + interval '72 hours' then
    raise exception 'ADVANCE_NOTICE_REQUIRED' using errcode = '22023';
  end if;

  insert into public.reservations (
    room_id, requester_id, requester_name, requester_email,
    starts_at, ends_at, purpose, participant_count, status, submitted_at
  ) values (
    p_room_id, v_uid, v_profile.full_name, v_profile.email,
    p_starts_at, p_ends_at, p_purpose, p_participant_count, 'PENDING', v_submitted_at
  )
  returning * into v_reservation;

  insert into public.audit_events (
    actor_id, actor_role, action, entity_table, entity_id, after_value
  ) values (
    v_uid, v_profile.role, 'RESERVATION_SUBMITTED', 'reservations',
    v_reservation.id::text, to_jsonb(v_reservation)
  );

  insert into public.email_outbox (to_email, subject, body, template, metadata, related_reservation_id)
  select s.usg_notification_email,
         format('New C205 request from %s', v_profile.full_name),
         format('%s requested C205 for %s to %s.', v_profile.full_name, p_starts_at, p_ends_at),
         'reservation_submitted_admin',
         jsonb_build_object('reservation_id', v_reservation.id),
         v_reservation.id
  from public.app_settings s;

  insert into public.email_outbox (to_email, subject, body, template, metadata, related_reservation_id)
  values (
    v_profile.email,
    'Your C205 request has been received',
    'Your request is pending review. You will be emailed as soon as a decision is made. Submitting a request never confirms a booking.',
    'reservation_submitted_receipt',
    jsonb_build_object('reservation_id', v_reservation.id),
    v_reservation.id
  );

  if p_idempotency_key is not null then
    insert into public.idempotency_keys (scope, requester_id, key, payload, response)
    values ('submit_request', v_uid, p_idempotency_key, v_payload, to_jsonb(v_reservation));
  end if;

  return v_reservation;
end;
$$;

revoke execute on function public.submit_request(uuid, timestamptz, timestamptz, text, integer, text) from public, anon;
grant execute on function public.submit_request(uuid, timestamptz, timestamptz, text, integer, text) to authenticated;

-- ---------------------------------------------------------------------
-- approve_request
-- ---------------------------------------------------------------------
create function public.approve_request(
  p_reservation_id uuid,
  p_expected_version integer,
  p_override boolean default false,
  p_override_reason text default null
)
returns public.reservations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_admin public.profiles;
  v_room_id uuid;
  v_before public.reservations;
  v_after public.reservations;
begin
  if v_uid is null then
    raise exception 'ACCOUNT_NOT_AUTHORIZED' using errcode = '28000';
  end if;

  select * into v_admin from public.profiles where id = v_uid;
  if v_admin is null or v_admin.role <> 'ADMIN' or v_admin.account_status <> 'ACTIVE' or v_admin.email_verified_at is null then
    raise exception 'ACCOUNT_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select room_id into v_room_id from public.reservations where id = p_reservation_id;
  if v_room_id is null then
    raise exception 'reservation % not found', p_reservation_id using errcode = 'P0002';
  end if;

  -- Consistent lock ordering everywhere: room first, then the reservation.
  perform 1 from public.rooms where id = v_room_id for update;
  select * into v_before from public.reservations where id = p_reservation_id for update;

  if v_before.status <> 'PENDING' then
    raise exception 'INVALID_STATUS_TRANSITION' using errcode = '22023';
  end if;
  if v_before.version <> p_expected_version then
    raise exception 'STALE_RESERVATION_VERSION' using errcode = '40001';
  end if;

  -- Approved-overlap is the one rule even an explicit override can never
  -- bypass — it's a physical impossibility, not a policy choice, and the
  -- exclusion constraint would refuse the UPDATE below anyway.
  if public.reservation_overlaps_approved(v_before.room_id, v_before.starts_at, v_before.ends_at, v_before.id) then
    raise exception 'RESERVATION_CONFLICT' using errcode = '23P01';
  end if;

  if not public.reservation_fits_availability(v_before.room_id, v_before.starts_at, v_before.ends_at) then
    if not p_override then
      raise exception 'OUTSIDE_AVAILABILITY' using errcode = '22023';
    end if;
    if btrim(coalesce(p_override_reason, '')) = '' then
      raise exception 'an override reason is required to approve outside published availability' using errcode = '22023';
    end if;
  end if;

  -- Re-evaluated against the ORIGINAL submission time, never the moment of
  -- approval — an admin sitting on a request for a week must not turn a
  -- compliant request into a violation just by being slow to decide.
  if (v_before.ends_at - v_before.starts_at) >= interval '2 hours'
     and v_before.starts_at < v_before.submitted_at + interval '72 hours' then
    if not p_override then
      raise exception 'ADVANCE_NOTICE_REQUIRED' using errcode = '22023';
    end if;
    if btrim(coalesce(p_override_reason, '')) = '' then
      raise exception 'an override reason is required to approve inside the 72-hour advance-notice window' using errcode = '22023';
    end if;
  end if;

  update public.reservations
  set status = 'APPROVED',
      decided_at = clock_timestamp(),
      decided_by = v_uid,
      decision_reason = p_override_reason,
      admin_override = p_override,
      override_reason = p_override_reason
  where id = p_reservation_id
  returning * into v_after;

  insert into public.audit_events (
    actor_id, actor_role, action, entity_table, entity_id, reason,
    before_value, after_value
  ) values (
    v_uid, v_admin.role, 'RESERVATION_APPROVED', 'reservations',
    p_reservation_id::text, p_override_reason, to_jsonb(v_before), to_jsonb(v_after)
  );

  insert into public.email_outbox (to_email, subject, body, template, metadata, related_reservation_id)
  values (
    v_after.requester_email,
    'Your C205 request has been approved',
    coalesce(p_override_reason, ''),
    'reservation_approved',
    jsonb_build_object('reservation_id', v_after.id),
    v_after.id
  );

  return v_after;
end;
$$;

revoke execute on function public.approve_request(uuid, integer, boolean, text) from public, anon;
grant execute on function public.approve_request(uuid, integer, boolean, text) to authenticated;

-- ---------------------------------------------------------------------
-- reject_request
-- ---------------------------------------------------------------------
create function public.reject_request(
  p_reservation_id uuid,
  p_expected_version integer,
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
  v_room_id uuid;
  v_before public.reservations;
  v_after public.reservations;
begin
  if v_uid is null then
    raise exception 'ACCOUNT_NOT_AUTHORIZED' using errcode = '28000';
  end if;

  select * into v_admin from public.profiles where id = v_uid;
  if v_admin is null or v_admin.role <> 'ADMIN' or v_admin.account_status <> 'ACTIVE' or v_admin.email_verified_at is null then
    raise exception 'ACCOUNT_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select room_id into v_room_id from public.reservations where id = p_reservation_id;
  if v_room_id is null then
    raise exception 'reservation % not found', p_reservation_id using errcode = 'P0002';
  end if;

  perform 1 from public.rooms where id = v_room_id for update;
  select * into v_before from public.reservations where id = p_reservation_id for update;

  if v_before.status <> 'PENDING' then
    raise exception 'INVALID_STATUS_TRANSITION' using errcode = '22023';
  end if;
  if v_before.version <> p_expected_version then
    raise exception 'STALE_RESERVATION_VERSION' using errcode = '40001';
  end if;

  update public.reservations
  set status = 'REJECTED',
      decided_at = clock_timestamp(),
      decided_by = v_uid,
      decision_reason = p_reason
  where id = p_reservation_id
  returning * into v_after;

  insert into public.audit_events (
    actor_id, actor_role, action, entity_table, entity_id, reason,
    before_value, after_value
  ) values (
    v_uid, v_admin.role, 'RESERVATION_REJECTED', 'reservations',
    p_reservation_id::text, p_reason, to_jsonb(v_before), to_jsonb(v_after)
  );

  insert into public.email_outbox (to_email, subject, body, template, metadata, related_reservation_id)
  values (
    v_after.requester_email,
    'Your C205 request has been rejected',
    coalesce(p_reason, ''),
    'reservation_rejected',
    jsonb_build_object('reservation_id', v_after.id),
    v_after.id
  );

  return v_after;
end;
$$;

revoke execute on function public.reject_request(uuid, integer, text) from public, anon;
grant execute on function public.reject_request(uuid, integer, text) to authenticated;

-- ---------------------------------------------------------------------
-- cancel_reservation — only APPROVED -> CANCELLED. A still-PENDING request
-- has made no commitment for USG to honor yet, so it's rejected by an
-- admin rather than cancelled by anyone; this matches the state machine
-- exactly as specified (PENDING -> APPROVED|REJECTED, APPROVED ->
-- CANCELLED — no PENDING -> CANCELLED edge).
-- ---------------------------------------------------------------------
create function public.cancel_reservation(
  p_reservation_id uuid,
  p_expected_version integer,
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
  v_room_id uuid;
  v_before public.reservations;
  v_after public.reservations;
begin
  if v_uid is null then
    raise exception 'ACCOUNT_NOT_AUTHORIZED' using errcode = '28000';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if v_profile is null or v_profile.account_status <> 'ACTIVE' or v_profile.email_verified_at is null then
    raise exception 'ACCOUNT_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select room_id into v_room_id from public.reservations where id = p_reservation_id;
  if v_room_id is null then
    raise exception 'reservation % not found', p_reservation_id using errcode = 'P0002';
  end if;

  perform 1 from public.rooms where id = v_room_id for update;
  select * into v_before from public.reservations where id = p_reservation_id for update;

  if v_profile.role <> 'ADMIN' and v_before.requester_id is distinct from v_uid then
    raise exception 'ACCOUNT_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if v_before.status <> 'APPROVED' then
    raise exception 'INVALID_STATUS_TRANSITION' using errcode = '22023';
  end if;
  if v_before.version <> p_expected_version then
    raise exception 'STALE_RESERVATION_VERSION' using errcode = '40001';
  end if;

  update public.reservations
  set status = 'CANCELLED',
      cancelled_at = clock_timestamp(),
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

revoke execute on function public.cancel_reservation(uuid, integer, text) from public, anon;
grant execute on function public.cancel_reservation(uuid, integer, text) to authenticated;

-- ---------------------------------------------------------------------
-- modify_reservation — admin-only. Changing an approved commitment's
-- shape/time is an administrative act (it can require overriding policy on
-- the requester's behalf), not something a requester does to their own
-- pending request. Applies to PENDING or APPROVED reservations only.
--
-- Every check below runs against the NEW values before anything is
-- written, and any raised exception rolls back the whole function — a
-- failed modification changes nothing, exactly as if it had never been
-- called.
-- ---------------------------------------------------------------------
create function public.modify_reservation(
  p_reservation_id uuid,
  p_expected_version integer,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_purpose text default null,
  p_participant_count integer default null,
  p_override boolean default false,
  p_override_reason text default null
)
returns public.reservations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_admin public.profiles;
  v_room_id uuid;
  v_before public.reservations;
  v_after public.reservations;
  v_new_starts timestamptz;
  v_new_ends timestamptz;
  v_new_purpose text;
  v_new_count integer;
  v_override_applied boolean := false;
begin
  if v_uid is null then
    raise exception 'ACCOUNT_NOT_AUTHORIZED' using errcode = '28000';
  end if;

  select * into v_admin from public.profiles where id = v_uid;
  if v_admin is null or v_admin.role <> 'ADMIN' or v_admin.account_status <> 'ACTIVE' or v_admin.email_verified_at is null then
    raise exception 'ACCOUNT_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select room_id into v_room_id from public.reservations where id = p_reservation_id;
  if v_room_id is null then
    raise exception 'reservation % not found', p_reservation_id using errcode = 'P0002';
  end if;

  perform 1 from public.rooms where id = v_room_id for update;
  select * into v_before from public.reservations where id = p_reservation_id for update;

  if v_before.status not in ('PENDING', 'APPROVED') then
    raise exception 'INVALID_STATUS_TRANSITION' using errcode = '22023';
  end if;
  if v_before.version <> p_expected_version then
    raise exception 'STALE_RESERVATION_VERSION' using errcode = '40001';
  end if;

  v_new_starts := coalesce(p_starts_at, v_before.starts_at);
  v_new_ends := coalesce(p_ends_at, v_before.ends_at);
  v_new_purpose := coalesce(p_purpose, v_before.purpose);
  v_new_count := coalesce(p_participant_count, v_before.participant_count);

  if v_new_ends <= v_new_starts then
    raise exception 'ends_at must be after starts_at' using errcode = '22023';
  end if;
  if v_new_count <= 0 then
    raise exception 'participant_count must be positive' using errcode = '22023';
  end if;
  if btrim(v_new_purpose) = '' then
    raise exception 'purpose is required' using errcode = '22023';
  end if;

  -- Absolute regardless of current status or override: two APPROVED
  -- reservations still can never overlap. A PENDING row never matches this
  -- query's own status filter, so this is a no-op check for that branch —
  -- no separate branching needed.
  if public.reservation_overlaps_approved(v_before.room_id, v_new_starts, v_new_ends, v_before.id) then
    raise exception 'RESERVATION_CONFLICT' using errcode = '23P01';
  end if;

  if not public.reservation_fits_availability(v_before.room_id, v_new_starts, v_new_ends) then
    if not p_override then
      raise exception 'OUTSIDE_AVAILABILITY' using errcode = '22023';
    end if;
    v_override_applied := true;
  end if;

  -- Always anchored to the ORIGINAL submission time, unaffected by this
  -- modification or how long it's been pending.
  if (v_new_ends - v_new_starts) >= interval '2 hours'
     and v_new_starts < v_before.submitted_at + interval '72 hours' then
    if not p_override then
      raise exception 'ADVANCE_NOTICE_REQUIRED' using errcode = '22023';
    end if;
    v_override_applied := true;
  end if;

  if v_override_applied and btrim(coalesce(p_override_reason, '')) = '' then
    raise exception 'an override reason is required for this modification''s newly-necessary exception' using errcode = '22023';
  end if;

  update public.reservations
  set starts_at = v_new_starts,
      ends_at = v_new_ends,
      purpose = v_new_purpose,
      participant_count = v_new_count,
      admin_override = v_before.admin_override or v_override_applied,
      override_reason = case when v_override_applied then p_override_reason else v_before.override_reason end
  where id = p_reservation_id
  returning * into v_after;

  insert into public.audit_events (
    actor_id, actor_role, action, entity_table, entity_id, reason,
    before_value, after_value
  ) values (
    v_uid, v_admin.role, 'RESERVATION_MODIFIED', 'reservations',
    p_reservation_id::text, p_override_reason, to_jsonb(v_before), to_jsonb(v_after)
  );

  insert into public.email_outbox (to_email, subject, body, template, metadata, related_reservation_id)
  values (
    v_after.requester_email,
    'Your C205 request has been updated',
    'An administrator changed the details of this request.',
    'reservation_modified',
    jsonb_build_object('reservation_id', v_after.id),
    v_after.id
  );

  return v_after;
end;
$$;

revoke execute on function public.modify_reservation(uuid, integer, timestamptz, timestamptz, text, integer, boolean, text) from public, anon;
grant execute on function public.modify_reservation(uuid, integer, timestamptz, timestamptz, text, integer, boolean, text) to authenticated;

-- ---------------------------------------------------------------------
-- create_manual_reservation — admin books directly on someone's behalf,
-- created and approved in the same atomic step. Sends exactly one email —
-- a confirmation — never the "pending, awaiting review" receipt
-- submit_request sends, since nothing about this booking is actually
-- pending by the time it exists.
-- ---------------------------------------------------------------------
create function public.create_manual_reservation(
  p_room_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_purpose text,
  p_participant_count integer,
  p_requester_name text,
  p_requester_email text,
  p_override boolean default false,
  p_override_reason text default null
)
returns public.reservations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_admin public.profiles;
  v_now timestamptz;
  v_reservation public.reservations;
begin
  if v_uid is null then
    raise exception 'ACCOUNT_NOT_AUTHORIZED' using errcode = '28000';
  end if;

  select * into v_admin from public.profiles where id = v_uid;
  if v_admin is null or v_admin.role <> 'ADMIN' or v_admin.account_status <> 'ACTIVE' or v_admin.email_verified_at is null then
    raise exception 'ACCOUNT_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  perform 1 from public.rooms where id = p_room_id for update;
  if not found then
    raise exception 'room % not found', p_room_id using errcode = '22023';
  end if;

  v_now := clock_timestamp();

  if p_ends_at <= p_starts_at then
    raise exception 'ends_at must be after starts_at' using errcode = '22023';
  end if;
  if p_participant_count <= 0 then
    raise exception 'participant_count must be positive' using errcode = '22023';
  end if;
  if btrim(coalesce(p_purpose, '')) = '' then
    raise exception 'purpose is required' using errcode = '22023';
  end if;
  if btrim(coalesce(p_requester_name, '')) = '' or btrim(coalesce(p_requester_email, '')) = '' then
    raise exception 'requester name and email are required' using errcode = '22023';
  end if;

  -- Absolute, never overridable — this is what the exclusion constraint
  -- enforces at the database level regardless of who or what writes here.
  if public.reservation_overlaps_approved(p_room_id, p_starts_at, p_ends_at) then
    raise exception 'RESERVATION_CONFLICT' using errcode = '23P01';
  end if;

  if not public.reservation_fits_availability(p_room_id, p_starts_at, p_ends_at) then
    if not p_override then
      raise exception 'OUTSIDE_AVAILABILITY' using errcode = '22023';
    end if;
    if btrim(coalesce(p_override_reason, '')) = '' then
      raise exception 'an override reason is required to book outside published availability' using errcode = '22023';
    end if;
  end if;

  -- The 72-hour rule is a protection for how USG reviews *requests* — it
  -- does not apply to a booking an admin is creating and approving
  -- directly; there is no review to protect.
  insert into public.reservations (
    room_id, requester_id, requester_name, requester_email,
    starts_at, ends_at, purpose, participant_count, status,
    submitted_at, decided_at, decided_by, decision_reason,
    admin_override, override_reason
  ) values (
    p_room_id, null, p_requester_name, p_requester_email,
    p_starts_at, p_ends_at, p_purpose, p_participant_count, 'APPROVED',
    v_now, v_now, v_uid, coalesce(p_override_reason, 'Created directly by an administrator'),
    p_override, p_override_reason
  )
  returning * into v_reservation;

  insert into public.audit_events (
    actor_id, actor_role, action, entity_table, entity_id, reason, after_value
  ) values (
    v_uid, v_admin.role, 'RESERVATION_CREATED_MANUALLY', 'reservations',
    v_reservation.id::text, p_override_reason, to_jsonb(v_reservation)
  );

  insert into public.email_outbox (to_email, subject, body, template, metadata, related_reservation_id)
  values (
    p_requester_email,
    'A C205 reservation has been made for you',
    format('USG has booked C205 for you from %s to %s.', p_starts_at, p_ends_at),
    'reservation_manual_confirmation',
    jsonb_build_object('reservation_id', v_reservation.id),
    v_reservation.id
  );

  return v_reservation;
end;
$$;

revoke execute on function public.create_manual_reservation(uuid, timestamptz, timestamptz, text, integer, text, text, boolean, text) from public, anon;
grant execute on function public.create_manual_reservation(uuid, timestamptz, timestamptz, text, integer, text, text, boolean, text) to authenticated;

-- ---------------------------------------------------------------------
-- Availability mutations — locked the same way as reservation mutations.
-- ---------------------------------------------------------------------
create function public.publish_availability_window(
  p_room_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_label text default null
)
returns public.availability_windows
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_admin public.profiles;
  v_window public.availability_windows;
begin
  if v_uid is null then
    raise exception 'ACCOUNT_NOT_AUTHORIZED' using errcode = '28000';
  end if;

  select * into v_admin from public.profiles where id = v_uid;
  if v_admin is null or v_admin.role <> 'ADMIN' or v_admin.account_status <> 'ACTIVE' or v_admin.email_verified_at is null then
    raise exception 'ACCOUNT_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  perform 1 from public.rooms where id = p_room_id for update;
  if not found then
    raise exception 'room % not found', p_room_id using errcode = '22023';
  end if;

  if p_ends_at <= p_starts_at then
    raise exception 'ends_at must be after starts_at' using errcode = '22023';
  end if;

  insert into public.availability_windows (room_id, starts_at, ends_at, label, published_by)
  values (p_room_id, p_starts_at, p_ends_at, p_label, v_uid)
  returning * into v_window;

  insert into public.audit_events (
    actor_id, actor_role, action, entity_table, entity_id, after_value
  ) values (
    v_uid, v_admin.role, 'AVAILABILITY_PUBLISHED', 'availability_windows',
    v_window.id::text, to_jsonb(v_window)
  );

  return v_window;
end;
$$;

revoke execute on function public.publish_availability_window(uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.publish_availability_window(uuid, timestamptz, timestamptz, text) to authenticated;

create function public.remove_availability_window(p_window_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_admin public.profiles;
  v_window public.availability_windows;
begin
  if v_uid is null then
    raise exception 'ACCOUNT_NOT_AUTHORIZED' using errcode = '28000';
  end if;

  select * into v_admin from public.profiles where id = v_uid;
  if v_admin is null or v_admin.role <> 'ADMIN' or v_admin.account_status <> 'ACTIVE' or v_admin.email_verified_at is null then
    raise exception 'ACCOUNT_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select * into v_window from public.availability_windows where id = p_window_id;
  if v_window is null then
    raise exception 'availability window % not found', p_window_id using errcode = 'P0002';
  end if;

  perform 1 from public.rooms where id = v_window.room_id for update;

  delete from public.availability_windows where id = p_window_id;

  insert into public.audit_events (
    actor_id, actor_role, action, entity_table, entity_id, before_value
  ) values (
    v_uid, v_admin.role, 'AVAILABILITY_REMOVED', 'availability_windows',
    p_window_id::text, to_jsonb(v_window)
  );
end;
$$;

revoke execute on function public.remove_availability_window(uuid) from public, anon;
grant execute on function public.remove_availability_window(uuid) to authenticated;

create function public.create_blocked_interval(
  p_room_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reason text
)
returns public.blocked_intervals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_admin public.profiles;
  v_block public.blocked_intervals;
begin
  if v_uid is null then
    raise exception 'ACCOUNT_NOT_AUTHORIZED' using errcode = '28000';
  end if;

  select * into v_admin from public.profiles where id = v_uid;
  if v_admin is null or v_admin.role <> 'ADMIN' or v_admin.account_status <> 'ACTIVE' or v_admin.email_verified_at is null then
    raise exception 'ACCOUNT_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  perform 1 from public.rooms where id = p_room_id for update;
  if not found then
    raise exception 'room % not found', p_room_id using errcode = '22023';
  end if;

  if p_ends_at <= p_starts_at then
    raise exception 'ends_at must be after starts_at' using errcode = '22023';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'reason is required' using errcode = '22023';
  end if;

  -- Blocking time does not touch existing reservations at all — an
  -- APPROVED booking already inside this new block stays APPROVED (the
  -- exclusion constraint only governs approved-vs-approved conflicts, not
  -- approved-vs-block), and any PENDING request now inside it stays
  -- PENDING with a derived warning (reservation_conflict_warnings), never
  -- silently rejected.
  insert into public.blocked_intervals (room_id, starts_at, ends_at, reason, blocked_by)
  values (p_room_id, p_starts_at, p_ends_at, p_reason, v_uid)
  returning * into v_block;

  insert into public.audit_events (
    actor_id, actor_role, action, entity_table, entity_id, after_value
  ) values (
    v_uid, v_admin.role, 'BLOCK_CREATED', 'blocked_intervals',
    v_block.id::text, to_jsonb(v_block)
  );

  return v_block;
end;
$$;

revoke execute on function public.create_blocked_interval(uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.create_blocked_interval(uuid, timestamptz, timestamptz, text) to authenticated;

create function public.remove_blocked_interval(p_block_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_admin public.profiles;
  v_block public.blocked_intervals;
begin
  if v_uid is null then
    raise exception 'ACCOUNT_NOT_AUTHORIZED' using errcode = '28000';
  end if;

  select * into v_admin from public.profiles where id = v_uid;
  if v_admin is null or v_admin.role <> 'ADMIN' or v_admin.account_status <> 'ACTIVE' or v_admin.email_verified_at is null then
    raise exception 'ACCOUNT_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select * into v_block from public.blocked_intervals where id = p_block_id;
  if v_block is null then
    raise exception 'blocked interval % not found', p_block_id using errcode = 'P0002';
  end if;

  perform 1 from public.rooms where id = v_block.room_id for update;

  delete from public.blocked_intervals where id = p_block_id;

  insert into public.audit_events (
    actor_id, actor_role, action, entity_table, entity_id, before_value
  ) values (
    v_uid, v_admin.role, 'BLOCK_REMOVED', 'blocked_intervals',
    p_block_id::text, to_jsonb(v_block)
  );
end;
$$;

revoke execute on function public.remove_blocked_interval(uuid) from public, anon;
grant execute on function public.remove_blocked_interval(uuid) to authenticated;
