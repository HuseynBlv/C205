-- Admin dashboard: fills the gaps the existing booking-engine functions
-- (Step 3a) don't cover — editing an existing availability window/block,
-- publishing a whole month of recurring hours in one transactional call,
-- and letting an admin actually read the audit trail. Every new mutation
-- follows the same room-lock-first convention as submit_request and
-- friends; nothing here bypasses it.

-- ---------------------------------------------------------------------
-- Admins can now read the audit trail. The table itself stays append-only
-- (audit_events_immutable() still blocks UPDATE/DELETE for every role) —
-- this only adds read access, scoped to admins, the same way
-- app_settings_select_admin already scopes settings reads.
-- ---------------------------------------------------------------------
create policy audit_events_select_admin
  on public.audit_events
  for select
  to authenticated
  using (public.is_active_admin());

grant select on public.audit_events to authenticated;

-- ---------------------------------------------------------------------
-- Internal helper, not granted to any client role: merges any
-- availability windows for a room that overlap OR exactly touch each
-- other into a single row, leaving windows with a real gap between them
-- untouched. Only ever called from inside another SECURITY DEFINER
-- function that has already locked the room row, so it never needs its
-- own lock. reservation_fits_availability already treats back-to-back
-- windows as continuous for booking purposes via range_agg — this exists
-- purely so the *stored* rows an admin sees stay tidy after repeated
-- publish/edit calls, not because booking correctness depends on it.
-- ---------------------------------------------------------------------
create function public._merge_adjacent_availability_windows(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_group_start timestamptz;
  v_group_end timestamptz;
  v_group_label text;
  v_group_ids uuid[];
  v_have_group boolean := false;
begin
  for r in
    select id, starts_at, ends_at, label
    from public.availability_windows
    where room_id = p_room_id
    order by starts_at, ends_at
  loop
    if not v_have_group then
      v_group_start := r.starts_at;
      v_group_end := r.ends_at;
      v_group_label := r.label;
      v_group_ids := array[r.id];
      v_have_group := true;
    elsif r.starts_at <= v_group_end then
      -- overlaps or touches (starts exactly where the group currently
      -- ends) the open group: extend it, never shrink it.
      v_group_end := greatest(v_group_end, r.ends_at);
      v_group_ids := array_append(v_group_ids, r.id);
    else
      -- a real gap: flush the group so far, then start a new one.
      if array_length(v_group_ids, 1) > 1 then
        delete from public.availability_windows where id = any(v_group_ids);
        insert into public.availability_windows (room_id, starts_at, ends_at, label, published_by)
        values (p_room_id, v_group_start, v_group_end, v_group_label, auth.uid());
      end if;
      v_group_start := r.starts_at;
      v_group_end := r.ends_at;
      v_group_label := r.label;
      v_group_ids := array[r.id];
    end if;
  end loop;

  if v_have_group and array_length(v_group_ids, 1) > 1 then
    delete from public.availability_windows where id = any(v_group_ids);
    insert into public.availability_windows (room_id, starts_at, ends_at, label, published_by)
    values (p_room_id, v_group_start, v_group_end, v_group_label, auth.uid());
  end if;
end;
$$;

revoke execute on function public._merge_adjacent_availability_windows(uuid) from public, anon, authenticated;

-- publish_availability_window now normalizes after inserting, and returns
-- whichever row (possibly a merge of several) now covers the requested
-- range — the audit event still records exactly what was requested,
-- before any merge.
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

  insert into public.availability_windows (room_id, starts_at, ends_at, label, published_by)
  values (p_room_id, p_starts_at, p_ends_at, p_label, v_uid)
  returning * into v_window;

  insert into public.audit_events (
    actor_id, actor_role, action, entity_table, entity_id, after_value
  ) values (
    v_uid, v_admin.role, 'AVAILABILITY_PUBLISHED', 'availability_windows',
    v_window.id::text, to_jsonb(v_window)
  );

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
-- update_availability_window — admin-only edit of an existing window's
-- time/label. Same room-lock-first discipline, then normalized the same
-- way a fresh publish is.
-- ---------------------------------------------------------------------
create function public.update_availability_window(
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

revoke execute on function public.update_availability_window(uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.update_availability_window(uuid, timestamptz, timestamptz, text) to authenticated;

-- ---------------------------------------------------------------------
-- update_blocked_interval — admin-only edit of an existing block's
-- time/reason. Blocks are never auto-merged (each carries its own
-- reason, and merging would silently lose one) — this only ever touches
-- the single row identified by p_block_id.
-- ---------------------------------------------------------------------
create function public.update_blocked_interval(
  p_block_id uuid,
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
  v_before public.blocked_intervals;
  v_after public.blocked_intervals;
begin
  if v_uid is null then
    raise exception 'ACCOUNT_NOT_AUTHORIZED' using errcode = '28000';
  end if;

  select * into v_admin from public.profiles where id = v_uid;
  if v_admin is null or v_admin.role <> 'ADMIN' or v_admin.account_status <> 'ACTIVE' or v_admin.email_verified_at is null then
    raise exception 'ACCOUNT_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select * into v_before from public.blocked_intervals where id = p_block_id;
  if v_before is null then
    raise exception 'blocked interval % not found', p_block_id using errcode = 'P0002';
  end if;

  perform 1 from public.rooms where id = v_before.room_id for update;

  if p_ends_at <= p_starts_at then
    raise exception 'ends_at must be after starts_at' using errcode = '22023';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'reason is required' using errcode = '22023';
  end if;

  update public.blocked_intervals
  set starts_at = p_starts_at,
      ends_at = p_ends_at,
      reason = p_reason
  where id = p_block_id
  returning * into v_after;

  insert into public.audit_events (
    actor_id, actor_role, action, entity_table, entity_id,
    before_value, after_value
  ) values (
    v_uid, v_admin.role, 'BLOCK_UPDATED', 'blocked_intervals',
    p_block_id::text, to_jsonb(v_before), to_jsonb(v_after)
  );

  return v_after;
end;
$$;

revoke execute on function public.update_blocked_interval(uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.update_blocked_interval(uuid, timestamptz, timestamptz, text) to authenticated;

-- ---------------------------------------------------------------------
-- publish_availability_month — one transactional call for "open these
-- weekdays, this time range, for this whole month, except these dates,"
-- rather than the app looping N separate publish_availability_window
-- calls (N separate transactions). Locks the room once for the entire
-- batch, uses rooms.timezone (finally read, not just stored) to convert
-- each matching calendar date's wall-clock hours to the timestamptz the
-- rest of the schema expects, and normalizes once at the end.
-- ---------------------------------------------------------------------
create function public.publish_availability_month(
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
      and starts_at < ((v_month_end + 1)::timestamp at time zone v_room.timezone)
    order by starts_at;
end;
$$;

revoke execute on function public.publish_availability_month(uuid, date, integer[], time, time, date[], text) from public, anon;
grant execute on function public.publish_availability_month(uuid, date, integer[], time, time, date[], text) to authenticated;
