-- Publishing a month creates one row per matching weekday (roughly 20+
-- for a single month, published_availability_month's own doc comment
-- notes this is deliberately not one bulk row) — removing them back out
-- one at a time via remove_availability_window() doesn't scale the same
-- way. This adds the symmetric bulk operation: remove every window
-- overlapping an arbitrary range in one call, one audit event summarizing
-- the whole batch rather than one per row (which would just move the
-- "1000 things to look at" problem from the availability list into the
-- audit log instead of actually solving it).
--
-- No separate "how many would this remove" preview function is needed —
-- availability_windows already grants plain SELECT to authenticated
-- (availability_windows_select_active), the same reasoning
-- previewAvailabilityImpactAction's own comment already documents for
-- reservations, so the app layer can just query the count directly.
create function public.remove_availability_windows_in_range(
  p_room_id uuid,
  p_range_start timestamptz,
  p_range_end timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_admin public.profiles;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'ACCOUNT_NOT_AUTHORIZED' using errcode = '28000';
  end if;

  select * into v_admin from public.profiles where id = v_uid;
  if v_admin is null or v_admin.role <> 'ADMIN' or v_admin.account_status <> 'ACTIVE' or v_admin.email_verified_at is null then
    raise exception 'ACCOUNT_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if p_range_end <= p_range_start then
    raise exception 'range end must be after range start' using errcode = '22023';
  end if;

  -- Locked for consistency with every other availability mutation in
  -- this app, even though a bulk delete has no "conflicting concurrent
  -- write" to race against the way submit/approve do — same discipline,
  -- not a functional requirement here.
  perform 1 from public.rooms where id = p_room_id for update;
  if not found then
    raise exception 'room % not found', p_room_id using errcode = '22023';
  end if;

  -- Overlap, not "starts within the range": a window that starts the
  -- evening before a typed range but runs past midnight into it should
  -- still be caught by "remove everything in September," matching the
  -- same overlap semantics getDayAvailabilityAction already uses.
  with deleted as (
    delete from public.availability_windows
    where room_id = p_room_id
      and starts_at < p_range_end
      and ends_at > p_range_start
    returning id
  )
  select count(*) into v_count from deleted;

  if v_count > 0 then
    insert into public.audit_events (
      actor_id, actor_role, action, entity_table, entity_id, before_value
    ) values (
      v_uid, v_admin.role, 'AVAILABILITY_RANGE_REMOVED', 'availability_windows',
      p_room_id::text,
      jsonb_build_object('count', v_count, 'range_start', p_range_start, 'range_end', p_range_end)
    );
  end if;

  return v_count;
end;
$$;

revoke execute on function public.remove_availability_windows_in_range(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.remove_availability_windows_in_range(uuid, timestamptz, timestamptz) to authenticated;
