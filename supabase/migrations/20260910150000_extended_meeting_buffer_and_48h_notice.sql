-- Two corrections against the USG internal rules for Room C205:
--
-- Rule 4 (Advance Reservation): "Reservation requests should normally be
-- submitted at least 48 hours in advance" — the booking engine enforced
-- 72 hours instead. Every occurrence of the 72-hour threshold is replaced
-- with 48 hours below (submit_request, approve_request,
-- modify_reservation); create_manual_reservation was and remains exempt,
-- since an admin creating and approving a booking directly has no
-- "request under review" for the notice window to protect.
--
-- Rule 8 (Extended Meetings): "For meetings lasting more than two (2)
-- hours, organizers should, where reasonably possible, leave sufficient
-- time before another extended meeting begins, normally around one
-- hour." Nothing previously enforced this at all. Added as
-- EXTENDED_MEETING_BUFFER_REQUIRED, checked only against currently
-- APPROVED reservations (a PENDING request hasn't actually claimed the
-- room yet, the same reasoning reservation_overlaps_approved already
-- relies on) and only when the candidate meeting is itself extended
-- (> 2 hours) — the rule only asks an extended meeting to give way to
-- another extended meeting, not to ordinary short bookings.
--
-- Rule 8's own wording is discretionary ("should", "where reasonably
-- possible"), so this follows the exact same hard-at-submission,
-- overridable-at-approval/modification shape already used for
-- OUTSIDE_AVAILABILITY: a regular user cannot submit a request that
-- would violate the buffer at all (matching how OUTSIDE_AVAILABILITY and
-- ADVANCE_NOTICE_REQUIRED are also unconditional at submit_request), but
-- an admin can approve, modify, or manually create one anyway with a
-- recorded override reason.

create function public.reservation_extended_meeting_nearby(
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
      and (r.ends_at - r.starts_at) > interval '2 hours'
      and r.starts_at < p_ends_at + interval '1 hour'
      and p_starts_at < r.ends_at + interval '1 hour'
  );
$$;

revoke execute on function public.reservation_extended_meeting_nearby(uuid, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.reservation_extended_meeting_nearby(uuid, timestamptz, timestamptz, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- submit_request
-- ---------------------------------------------------------------------
create or replace function public.submit_request(
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

  select * into v_profile from public.profiles where id = v_uid;
  if v_profile is null or v_profile.account_status <> 'ACTIVE' or v_profile.email_verified_at is null then
    raise exception 'ACCOUNT_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  perform 1 from public.rooms where id = p_room_id for update;
  if not found then
    raise exception 'room % not found', p_room_id using errcode = '22023';
  end if;

  v_payload := jsonb_build_object(
    'room_id', p_room_id, 'starts_at', p_starts_at, 'ends_at', p_ends_at,
    'purpose', p_purpose, 'participant_count', p_participant_count
  );

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
     and p_starts_at < v_submitted_at + interval '48 hours' then
    raise exception 'ADVANCE_NOTICE_REQUIRED' using errcode = '22023';
  end if;

  if (p_ends_at - p_starts_at) > interval '2 hours'
     and public.reservation_extended_meeting_nearby(p_room_id, p_starts_at, p_ends_at) then
    raise exception 'EXTENDED_MEETING_BUFFER_REQUIRED' using errcode = '22023';
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

-- ---------------------------------------------------------------------
-- approve_request
-- ---------------------------------------------------------------------
create or replace function public.approve_request(
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

  perform 1 from public.rooms where id = v_room_id for update;
  select * into v_before from public.reservations where id = p_reservation_id for update;

  if v_before.status <> 'PENDING' then
    raise exception 'INVALID_STATUS_TRANSITION' using errcode = '22023';
  end if;
  if v_before.version <> p_expected_version then
    raise exception 'STALE_RESERVATION_VERSION' using errcode = '40001';
  end if;

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

  if (v_before.ends_at - v_before.starts_at) >= interval '2 hours'
     and v_before.starts_at < v_before.submitted_at + interval '48 hours' then
    if not p_override then
      raise exception 'ADVANCE_NOTICE_REQUIRED' using errcode = '22023';
    end if;
    if btrim(coalesce(p_override_reason, '')) = '' then
      raise exception 'an override reason is required to approve inside the 48-hour advance-notice window' using errcode = '22023';
    end if;
  end if;

  if (v_before.ends_at - v_before.starts_at) > interval '2 hours'
     and public.reservation_extended_meeting_nearby(v_before.room_id, v_before.starts_at, v_before.ends_at, v_before.id) then
    if not p_override then
      raise exception 'EXTENDED_MEETING_BUFFER_REQUIRED' using errcode = '22023';
    end if;
    if btrim(coalesce(p_override_reason, '')) = '' then
      raise exception 'an override reason is required to approve without the recommended one-hour buffer between extended meetings' using errcode = '22023';
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

-- ---------------------------------------------------------------------
-- modify_reservation
-- ---------------------------------------------------------------------
create or replace function public.modify_reservation(
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

  if public.reservation_overlaps_approved(v_before.room_id, v_new_starts, v_new_ends, v_before.id) then
    raise exception 'RESERVATION_CONFLICT' using errcode = '23P01';
  end if;

  if not public.reservation_fits_availability(v_before.room_id, v_new_starts, v_new_ends) then
    if not p_override then
      raise exception 'OUTSIDE_AVAILABILITY' using errcode = '22023';
    end if;
    v_override_applied := true;
  end if;

  if (v_new_ends - v_new_starts) >= interval '2 hours'
     and v_new_starts < v_before.submitted_at + interval '48 hours' then
    if not p_override then
      raise exception 'ADVANCE_NOTICE_REQUIRED' using errcode = '22023';
    end if;
    v_override_applied := true;
  end if;

  if (v_new_ends - v_new_starts) > interval '2 hours'
     and public.reservation_extended_meeting_nearby(v_before.room_id, v_new_starts, v_new_ends, v_before.id) then
    if not p_override then
      raise exception 'EXTENDED_MEETING_BUFFER_REQUIRED' using errcode = '22023';
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

-- ---------------------------------------------------------------------
-- create_manual_reservation — the buffer rule still applies (it protects
-- the room's actual occupation pattern, not the request-review process),
-- unlike the advance-notice window which this function is deliberately
-- exempt from.
-- ---------------------------------------------------------------------
create or replace function public.create_manual_reservation(
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

  if (p_ends_at - p_starts_at) > interval '2 hours'
     and public.reservation_extended_meeting_nearby(p_room_id, p_starts_at, p_ends_at) then
    if not p_override then
      raise exception 'EXTENDED_MEETING_BUFFER_REQUIRED' using errcode = '22023';
    end if;
    if btrim(coalesce(p_override_reason, '')) = '' then
      raise exception 'an override reason is required to book without the recommended one-hour buffer between extended meetings' using errcode = '22023';
    end if;
  end if;

  -- The 48-hour advance-notice rule is a protection for how USG reviews
  -- *requests* — it does not apply to a booking an admin is creating and
  -- approving directly; there is no review to protect.
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

-- ---------------------------------------------------------------------
-- reservation_conflict_warnings — now also surfaces the buffer rule as a
-- derived, read-only warning on a PENDING request, same as the other two.
-- ---------------------------------------------------------------------
create or replace function public.reservation_conflict_warnings(p_reservation_id uuid)
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
      then 'RESERVATION_CONFLICT' end,
    case when (v_r.ends_at - v_r.starts_at) > interval '2 hours'
              and public.reservation_extended_meeting_nearby(v_r.room_id, v_r.starts_at, v_r.ends_at, v_r.id)
      then 'EXTENDED_MEETING_BUFFER_REQUIRED' end
  ], null);
end;
$$;
