-- USG wants more than one inbox to receive admin-facing notifications
-- (a new request submitted, a new account awaiting authorization).
-- app_settings.usg_notification_email was a single required column —
-- replaced here with a proper table so any number of addresses can
-- receive the same notifications, each one added/removed (and audited)
-- independently, the same granularity every other admin action in this
-- app already gets.
create table public.usg_notification_recipients (
  email text primary key,
  added_at timestamptz not null default now(),
  added_by uuid references public.profiles (id) on delete set null
);

comment on table public.usg_notification_recipients is
  'Every address that receives USG''s admin-facing notifications (new '
  'request submitted, new account awaiting authorization). Writes only '
  'through add_usg_notification_recipient / '
  'remove_usg_notification_recipient — never a direct grant, same rule '
  'as every other settings table in this schema.';

alter table public.usg_notification_recipients enable row level security;

create policy usg_notification_recipients_select_admin
  on public.usg_notification_recipients
  for select
  to authenticated
  using (public.is_active_admin());

revoke all on public.usg_notification_recipients from anon, authenticated;
grant select on public.usg_notification_recipients to authenticated;

-- Carry the one address an admin may have already configured forward,
-- rather than silently dropping it back to the placeholder.
insert into public.usg_notification_recipients (email)
select usg_notification_email from public.app_settings where id = true
on conflict (email) do nothing;

alter table public.app_settings drop column usg_notification_email;

drop function if exists public.set_usg_notification_email(text);

create function public.add_usg_notification_recipient(p_email text)
returns public.usg_notification_recipients
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_admin public.profiles;
  v_email text := lower(btrim(p_email));
  v_row public.usg_notification_recipients;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_admin from public.profiles where id = v_uid;
  if v_admin is null or v_admin.role <> 'ADMIN' or v_admin.account_status <> 'ACTIVE' then
    raise exception 'admin privileges required' using errcode = '42501';
  end if;

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid email address' using errcode = '22023';
  end if;

  if exists (select 1 from public.usg_notification_recipients where email = v_email) then
    raise exception 'that address is already a notification recipient' using errcode = '23505';
  end if;

  insert into public.usg_notification_recipients (email, added_by)
  values (v_email, v_uid)
  returning * into v_row;

  insert into public.audit_events (
    actor_id, actor_role, action, entity_table, entity_id, after_value
  ) values (
    v_uid, v_admin.role, 'NOTIFICATION_RECIPIENT_ADDED', 'usg_notification_recipients',
    v_email, to_jsonb(v_row)
  );

  return v_row;
end;
$$;

revoke execute on function public.add_usg_notification_recipient(text) from public, anon;
grant execute on function public.add_usg_notification_recipient(text) to authenticated;

-- At least one recipient must always remain — the same "last admin"
-- style protection set_account_status/set_user_role already apply
-- elsewhere, here so USG can never silently end up with nowhere to
-- receive a notification.
create function public.remove_usg_notification_recipient(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_admin public.profiles;
  v_email text := lower(btrim(p_email));
  v_before public.usg_notification_recipients;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_admin from public.profiles where id = v_uid;
  if v_admin is null or v_admin.role <> 'ADMIN' or v_admin.account_status <> 'ACTIVE' then
    raise exception 'admin privileges required' using errcode = '42501';
  end if;

  select * into v_before from public.usg_notification_recipients where email = v_email for update;
  if v_before is null then
    raise exception 'recipient % not found', v_email using errcode = 'P0002';
  end if;

  if (select count(*) from public.usg_notification_recipients) <= 1 then
    raise exception 'at least one notification recipient must remain' using errcode = '22023';
  end if;

  delete from public.usg_notification_recipients where email = v_email;

  insert into public.audit_events (
    actor_id, actor_role, action, entity_table, entity_id, before_value
  ) values (
    v_uid, v_admin.role, 'NOTIFICATION_RECIPIENT_REMOVED', 'usg_notification_recipients',
    v_email, to_jsonb(v_before)
  );
end;
$$;

revoke execute on function public.remove_usg_notification_recipient(text) from public, anon;
grant execute on function public.remove_usg_notification_recipient(text) to authenticated;

-- ---------------------------------------------------------------------
-- submit_request — the admin-notification insert now fans out to every
-- configured recipient (one outbox row each) instead of the single
-- app_settings column.
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
  select r.email,
         format('New C205 request from %s', v_profile.full_name),
         format('%s requested C205 for %s to %s.', v_profile.full_name, p_starts_at, p_ends_at),
         'reservation_submitted_admin',
         jsonb_build_object('reservation_id', v_reservation.id),
         v_reservation.id
  from public.usg_notification_recipients r;

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
-- handle_auth_user_email_confirmed — same fan-out for the
-- account-registered-admin notice.
-- ---------------------------------------------------------------------
create or replace function public.handle_auth_user_email_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_full_name text;
begin
  if new.email_confirmed_at is distinct from old.email_confirmed_at then
    update public.profiles set email_verified_at = new.email_confirmed_at where id = new.id;

    select full_name into v_full_name from public.profiles where id = new.id;

    insert into public.email_outbox (to_email, subject, body, template, metadata)
    select
      r.email,
      format('New C205 account awaiting authorization: %s', coalesce(v_full_name, new.email)),
      format(
        '%s (%s) has verified their email and is awaiting authorization to request C205. Review and authorize from the admin accounts page.',
        coalesce(v_full_name, new.email), new.email
      ),
      'account_registered_admin',
      jsonb_build_object('profile_id', new.id)
    from public.usg_notification_recipients r;
  end if;
  return new;
end;
$$;
