-- Room hours: C205 can only ever be reserved (or have availability
-- published/edited for it) between 08:00 and 23:00 in the room's own
-- local time — never earlier, and never running past 23:00 into the next
-- calendar day. A reservation crossing midnight is rejected the same way
-- (its end no longer falls on the same local calendar date as its
-- start), which is the correct side effect, not a special case: the room
-- isn't administered overnight.
--
-- Absolute everywhere it's checked — unlike OUTSIDE_AVAILABILITY,
-- ADVANCE_NOTICE_REQUIRED, and EXTENDED_MEETING_BUFFER_REQUIRED, this has
-- no admin override. Those three are policy choices USG can knowingly
-- except a specific booking from; this is closer to the room's physical
-- operating hours, which an override checkbox shouldn't be able to waive.
--
-- Existing data is left untouched on purpose: two already-APPROVED
-- reservations on production start at 07:00, and the published "Weekday
-- hours" windows currently run 07:30-20:00. Retroactively trimming those
-- windows to fit the new bound would risk breaking a future
-- modify_reservation call on either existing booking (it re-validates
-- fit-availability against the *current* window even when the edit
-- doesn't touch the time), for no benefit — nothing new can ever be
-- booked before 08:00 regardless, since submit_request/
-- create_manual_reservation/modify_reservation all reject it directly
-- now, independent of whatever a stale window happens to cover. Newly
-- published or edited windows go through publish_availability_window /
-- publish_availability_month / update_availability_window below, which
-- enforce the bound going forward.
create function public.reservation_within_room_hours(
  p_room_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_start_local timestamp;
  v_end_local timestamp;
begin
  select timezone into v_tz from public.rooms where id = p_room_id;
  if v_tz is null then
    return false;
  end if;

  v_start_local := p_starts_at at time zone v_tz;
  v_end_local := p_ends_at at time zone v_tz;

  return v_start_local::time >= time '08:00'
     and v_end_local::date = v_start_local::date
     and v_end_local::time <= time '23:00';
end;
$$;

revoke execute on function public.reservation_within_room_hours(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.reservation_within_room_hours(uuid, timestamptz, timestamptz) to authenticated;

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

  if not public.reservation_within_room_hours(p_room_id, p_starts_at, p_ends_at) then
    raise exception 'OUTSIDE_ROOM_HOURS' using errcode = '22023';
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

  -- Absolute, and only checked when the time is actually changing — an
  -- admin editing only the purpose/participant count on one of the two
  -- pre-existing 07:00 reservations from before this rule must not be
  -- blocked from making that unrelated edit.
  if (p_starts_at is not null or p_ends_at is not null)
     and not public.reservation_within_room_hours(v_room_id, v_new_starts, v_new_ends) then
    raise exception 'OUTSIDE_ROOM_HOURS' using errcode = '22023';
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
-- create_manual_reservation
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

  if not public.reservation_within_room_hours(p_room_id, p_starts_at, p_ends_at) then
    raise exception 'OUTSIDE_ROOM_HOURS' using errcode = '22023';
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
-- publish_availability_window
-- ---------------------------------------------------------------------
create or replace function public.publish_availability_window(
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

  if not public.reservation_within_room_hours(p_room_id, p_starts_at, p_ends_at) then
    raise exception 'availability can only be published between 08:00 and 23:00' using errcode = '22023';
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

  -- The audit event above records exactly what was requested, before any
  -- merge — perform, then return whichever row (possibly a merge of
  -- several) now covers the requested range.
  perform public._merge_adjacent_availability_windows(p_room_id);

  select * into v_window
  from public.availability_windows
  where room_id = p_room_id and starts_at <= p_starts_at and ends_at >= p_ends_at
  order by (ends_at - starts_at) asc
  limit 1;

  return v_window;
end;
$$;

-- ---------------------------------------------------------------------
-- update_availability_window
-- ---------------------------------------------------------------------
create or replace function public.update_availability_window(
  p_window_id uuid,
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
  v_before public.availability_windows;
  v_after public.availability_windows;
begin
  if v_uid is null then
    raise exception 'ACCOUNT_NOT_AUTHORIZED' using errcode = '28000';
  end if;

  select * into v_admin from public.profiles where id = v_uid;
  if v_admin is null or v_admin.role <> 'ADMIN' or v_admin.account_status <> 'ACTIVE' or v_admin.email_verified_at is null then
    raise exception 'ACCOUNT_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select * into v_before from public.availability_windows where id = p_window_id;
  if v_before is null then
    raise exception 'availability window % not found', p_window_id using errcode = 'P0002';
  end if;

  perform 1 from public.rooms where id = v_before.room_id for update;

  if p_ends_at <= p_starts_at then
    raise exception 'ends_at must be after starts_at' using errcode = '22023';
  end if;

  if not public.reservation_within_room_hours(v_before.room_id, p_starts_at, p_ends_at) then
    raise exception 'availability can only be published between 08:00 and 23:00' using errcode = '22023';
  end if;

  update public.availability_windows
  set starts_at = p_starts_at,
      ends_at = p_ends_at,
      label = p_label
  where id = p_window_id
  returning * into v_after;

  insert into public.audit_events (
    actor_id, actor_role, action, entity_table, entity_id,
    before_value, after_value
  ) values (
    v_uid, v_admin.role, 'AVAILABILITY_UPDATED', 'availability_windows',
    p_window_id::text, to_jsonb(v_before), to_jsonb(v_after)
  );

  perform public._merge_adjacent_availability_windows(v_before.room_id);

  select * into v_after
  from public.availability_windows
  where room_id = v_before.room_id and starts_at <= p_starts_at and ends_at >= p_ends_at
  order by (ends_at - starts_at) asc
  limit 1;

  return v_after;
end;
$$;

-- ---------------------------------------------------------------------
-- publish_availability_month — p_start_time/p_end_time are already plain
-- room-local wall-clock time, so this checks them directly rather than
-- going through reservation_within_room_hours (which takes timestamptz).
-- ---------------------------------------------------------------------
create or replace function public.publish_availability_month(
  p_room_id uuid,
  p_month date,
  p_weekdays integer[],
  p_start_time time,
  p_end_time time,
  p_excluded_dates date[] default '{}',
  p_label text default null
)
returns setof public.availability_windows
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_admin public.profiles;
  v_room public.rooms;
  v_month_start date;
  v_month_end date;
  v_d date;
  v_created integer := 0;
begin
  if v_uid is null then
    raise exception 'ACCOUNT_NOT_AUTHORIZED' using errcode = '28000';
  end if;

  select * into v_admin from public.profiles where id = v_uid;
  if v_admin is null or v_admin.role <> 'ADMIN' or v_admin.account_status <> 'ACTIVE' or v_admin.email_verified_at is null then
    raise exception 'ACCOUNT_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then
    raise exception 'room % not found', p_room_id using errcode = '22023';
  end if;

  if p_end_time <= p_start_time then
    raise exception 'end time must be after start time' using errcode = '22023';
  end if;
  if p_start_time < time '08:00' or p_end_time > time '23:00' then
    raise exception 'availability can only be published between 08:00 and 23:00' using errcode = '22023';
  end if;
  if p_weekdays is null or array_length(p_weekdays, 1) is null then
    raise exception 'select at least one weekday' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_weekdays) w where w < 1 or w > 7) then
    raise exception 'weekdays must be between 1 (Monday) and 7 (Sunday)' using errcode = '22023';
  end if;

  v_month_start := date_trunc('month', p_month)::date;
  v_month_end := (date_trunc('month', p_month) + interval '1 month' - interval '1 day')::date;

  v_d := v_month_start;
  while v_d <= v_month_end loop
    if extract(isodow from v_d)::integer = any(p_weekdays)
       and not (v_d = any(coalesce(p_excluded_dates, '{}')))
    then
      insert into public.availability_windows (room_id, starts_at, ends_at, label, published_by)
      values (
        p_room_id,
        (v_d + p_start_time) at time zone v_room.timezone,
        (v_d + p_end_time) at time zone v_room.timezone,
        p_label,
        v_uid
      );
      v_created := v_created + 1;
    end if;
    v_d := v_d + 1;
  end loop;

  if v_created = 0 then
    raise exception 'no matching dates in this month for the selected weekdays' using errcode = '22023';
  end if;

  insert into public.audit_events (
    actor_id, actor_role, action, entity_table, entity_id, after_value
  ) values (
    v_uid, v_admin.role, 'AVAILABILITY_MONTH_PUBLISHED', 'availability_windows',
    p_room_id::text,
    jsonb_build_object(
      'month', v_month_start, 'weekdays', p_weekdays,
      'start_time', p_start_time, 'end_time', p_end_time,
      'excluded_dates', p_excluded_dates, 'label', p_label,
      'windows_created', v_created
    )
  );

  perform public._merge_adjacent_availability_windows(p_room_id);

  return query
    select *
    from public.availability_windows
    where room_id = p_room_id
      and starts_at >= (v_month_start::timestamp at time zone v_room.timezone)
      and starts_at < ((v_month_end + 1)::timestamp at time zone v_room.timezone);
end;
$$;
