-- Admin's "Decision history" list only grows — every approved, rejected,
-- and cancelled reservation stays there forever, with no way to tidy it
-- up. Adds an archive/unarchive pair rather than a delete: archiving only
-- hides a decided reservation from the default admin view, it never
-- removes the row (or the audit trail that already references it), and
-- can always be undone. Mirrors the same admin-only, optimistic-version,
-- audited shape as every other reservation mutation in this file's
-- lineage — only PENDING is exempt, since a request still awaiting a
-- decision has nothing "historical" to archive yet.

alter table public.reservations add column archived_at timestamptz;
alter table public.reservations add column archived_by uuid references public.profiles (id) on delete set null;
alter table public.reservations add constraint reservations_archived_pair
  check ((archived_at is null) = (archived_by is null));

-- Speeds up "decision history" (archived_at is null) and "archived"
-- (archived_at is not null) list queries alike without indexing the
-- (large, mostly-null) column in full.
create index reservations_archived_idx on public.reservations (archived_at);

create function public.archive_reservation(
  p_reservation_id uuid,
  p_expected_version integer
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
    raise exception 'ACCOUNT_NOT_AUTHORIZED' using errcode = '28000';
  end if;

  select * into v_admin from public.profiles where id = v_uid;
  if v_admin is null or v_admin.role <> 'ADMIN' or v_admin.account_status <> 'ACTIVE' or v_admin.email_verified_at is null then
    raise exception 'ACCOUNT_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  -- No room-row lock here, unlike the scheduling mutations above: archiving
  -- changes nothing about starts_at/ends_at/status, so it has no scheduling
  -- invariant to protect. Locking the reservation row itself is still
  -- enough to serialize concurrent archive/unarchive calls on the same row.
  select * into v_before from public.reservations where id = p_reservation_id for update;
  if v_before is null then
    raise exception 'reservation % not found', p_reservation_id using errcode = 'P0002';
  end if;

  if v_before.status = 'PENDING' then
    raise exception 'a request still awaiting a decision cannot be archived' using errcode = '22023';
  end if;
  if v_before.archived_at is not null then
    raise exception 'reservation % is already archived', p_reservation_id using errcode = '22023';
  end if;
  if v_before.version <> p_expected_version then
    raise exception 'STALE_RESERVATION_VERSION' using errcode = '40001';
  end if;

  update public.reservations
  set archived_at = clock_timestamp(),
      archived_by = v_uid
  where id = p_reservation_id
  returning * into v_after;

  insert into public.audit_events (
    actor_id, actor_role, action, entity_table, entity_id, before_value, after_value
  ) values (
    v_uid, v_admin.role, 'RESERVATION_ARCHIVED', 'reservations',
    p_reservation_id::text, to_jsonb(v_before), to_jsonb(v_after)
  );

  return v_after;
end;
$$;

revoke execute on function public.archive_reservation(uuid, integer) from public, anon;
grant execute on function public.archive_reservation(uuid, integer) to authenticated;

create function public.unarchive_reservation(
  p_reservation_id uuid,
  p_expected_version integer
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
    raise exception 'ACCOUNT_NOT_AUTHORIZED' using errcode = '28000';
  end if;

  select * into v_admin from public.profiles where id = v_uid;
  if v_admin is null or v_admin.role <> 'ADMIN' or v_admin.account_status <> 'ACTIVE' or v_admin.email_verified_at is null then
    raise exception 'ACCOUNT_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select * into v_before from public.reservations where id = p_reservation_id for update;
  if v_before is null then
    raise exception 'reservation % not found', p_reservation_id using errcode = 'P0002';
  end if;

  if v_before.archived_at is null then
    raise exception 'reservation % is not archived', p_reservation_id using errcode = '22023';
  end if;
  if v_before.version <> p_expected_version then
    raise exception 'STALE_RESERVATION_VERSION' using errcode = '40001';
  end if;

  update public.reservations
  set archived_at = null,
      archived_by = null
  where id = p_reservation_id
  returning * into v_after;

  insert into public.audit_events (
    actor_id, actor_role, action, entity_table, entity_id, before_value, after_value
  ) values (
    v_uid, v_admin.role, 'RESERVATION_UNARCHIVED', 'reservations',
    p_reservation_id::text, to_jsonb(v_before), to_jsonb(v_after)
  );

  return v_after;
end;
$$;

revoke execute on function public.unarchive_reservation(uuid, integer) from public, anon;
grant execute on function public.unarchive_reservation(uuid, integer) to authenticated;
