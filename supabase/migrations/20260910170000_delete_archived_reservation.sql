-- Archiving (previous migration) only hides a decided reservation — some
-- admins will still want a real, permanent delete for entries they're
-- certain about. Gated behind archived_at is not null: an admin must
-- archive first, then delete from the Archived list, rather than deleting
-- straight out of the live Decision history — the same two-step "trash"
-- pattern used everywhere else this kind of irreversible action shows up,
-- so a slip can't destroy a still-visible record in one click.
--
-- The audit trail is unaffected: entity_id on audit_events is plain text,
-- never a foreign key to reservations, so every prior event for this
-- reservation (submitted, approved/rejected, cancelled, archived) survives
-- the delete untouched, plus one final RESERVATION_DELETED_PERMANENTLY
-- event capturing the full row as it looked the moment before deletion —
-- the record of what happened here outlives the reservation row itself.
create function public.delete_reservation_permanently(
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
    raise exception 'only an archived reservation can be permanently deleted' using errcode = '22023';
  end if;
  if v_before.version <> p_expected_version then
    raise exception 'STALE_RESERVATION_VERSION' using errcode = '40001';
  end if;

  insert into public.audit_events (
    actor_id, actor_role, action, entity_table, entity_id, before_value
  ) values (
    v_uid, v_admin.role, 'RESERVATION_DELETED_PERMANENTLY', 'reservations',
    p_reservation_id::text, to_jsonb(v_before)
  );

  delete from public.reservations where id = p_reservation_id;

  return v_before;
end;
$$;

revoke execute on function public.delete_reservation_permanently(uuid, integer) from public, anon;
grant execute on function public.delete_reservation_permanently(uuid, integer) to authenticated;
