-- Notifications, part 1: a narrow, secret-gated path for a background
-- sending worker (src/app/api/cron/send-emails/route.ts) to drain
-- public.email_outbox.
--
-- Neither of this project's two existing privileged-access patterns fits
-- a cron trigger: there is no signed-in Supabase Auth session to check
-- (every other SECURITY DEFINER function requires auth.uid()), and
-- SUPABASE_SERVICE_ROLE_KEY is deliberately never used by any app code
-- (confirmed by a repo-wide grep in Step 2b) — using it here would be the
-- one exception to that rule. Instead, authorization is a single shared
-- secret, set once by an admin via set_email_worker_secret() and compared
-- inside every function below. This matters because email_outbox rows
-- carry real PII (recipient addresses, requester names in subjects/bodies)
-- — without this check, the functions would be callable by anyone holding
-- the public anon key (which is everyone, since it ships to every
-- browser) with no protection at all. The Next.js route handler checks
-- the same secret itself as a request header before ever calling these;
-- the DB-level check exists so the functions are also safe standalone.
--
-- Claiming increments `attempts` rather than moving to a new status value
-- — deliberately avoiding `alter type ... add value` (which Postgres
-- cannot use inside the same transaction that adds it, complicating a
-- single migration file). A row stays 'PENDING' with a rising `attempts`
-- count until it's actually marked 'SENT', or the count crosses a
-- threshold and it's marked 'FAILED'. This gives "at least once" delivery
-- (a row still 'PENDING' after a worker crashes mid-send is retried next
-- run) at the accepted cost of a possible rare duplicate send if two
-- worker runs ever genuinely overlap — a much better failure mode for a
-- notification email than "silently never sent."

alter table public.app_settings
  add column email_worker_secret text;

comment on column public.app_settings.email_worker_secret is
  'Shared secret authorizing the background email-sending worker '
  '(claim_pending_emails / mark_email_sent / mark_email_failed below) — '
  'not a user credential. Set once via set_email_worker_secret(), then '
  'configured as EMAIL_WORKER_SECRET in the worker''s own environment.';

create function public.set_email_worker_secret(p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_admin public.profiles;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_admin from public.profiles where id = v_uid;
  if v_admin is null or v_admin.role <> 'ADMIN' or v_admin.account_status <> 'ACTIVE' then
    raise exception 'admin privileges required' using errcode = '42501';
  end if;

  if p_secret is null or length(p_secret) < 20 then
    raise exception 'secret must be at least 20 characters' using errcode = '22023';
  end if;

  update public.app_settings
  set email_worker_secret = p_secret,
      updated_at = now(),
      updated_by = v_uid
  where id = true;

  -- Never records the secret's own value, before or after — the whole
  -- point is that it stays out of anything admin-readable like the
  -- audit log.
  insert into public.audit_events (
    actor_id, actor_role, action, entity_table, entity_id
  ) values (
    v_uid, v_admin.role, 'EMAIL_WORKER_SECRET_ROTATED', 'app_settings', 'true'
  );
end;
$$;

revoke execute on function public.set_email_worker_secret(text) from public, anon;
grant execute on function public.set_email_worker_secret(text) to authenticated;

create function public.claim_pending_emails(p_secret text, p_limit integer default 20)
returns setof public.email_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected text;
begin
  select email_worker_secret into v_expected from public.app_settings where id = true;
  if v_expected is null or p_secret is null or p_secret <> v_expected then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  return query
    update public.email_outbox
    set attempts = attempts + 1
    where id in (
      select id from public.email_outbox
      where status = 'PENDING' and attempts < 5
      order by created_at
      limit greatest(p_limit, 0)
      for update skip locked
    )
    returning *;
end;
$$;

comment on function public.claim_pending_emails(text, integer) is
  'Returns up to p_limit not-yet-exhausted PENDING rows and increments '
  'their attempts, without changing status — the caller is expected to '
  'follow up with mark_email_sent or mark_email_failed for every row '
  'returned. Rows already claimed by a concurrent call are skipped '
  '(FOR UPDATE SKIP LOCKED), not double-returned within one call.';

revoke execute on function public.claim_pending_emails(text, integer) from public, authenticated;
grant execute on function public.claim_pending_emails(text, integer) to anon;

create function public.mark_email_sent(p_secret text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected text;
begin
  select email_worker_secret into v_expected from public.app_settings where id = true;
  if v_expected is null or p_secret is null or p_secret <> v_expected then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  update public.email_outbox
  set status = 'SENT', sent_at = now(), last_error = null
  where id = p_id;
end;
$$;

revoke execute on function public.mark_email_sent(text, uuid) from public, authenticated;
grant execute on function public.mark_email_sent(text, uuid) to anon;

create function public.mark_email_failed(p_secret text, p_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected text;
  v_attempts integer;
begin
  select email_worker_secret into v_expected from public.app_settings where id = true;
  if v_expected is null or p_secret is null or p_secret <> v_expected then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  select attempts into v_attempts from public.email_outbox where id = p_id;

  update public.email_outbox
  set last_error = left(coalesce(p_error, ''), 2000),
      status = case when v_attempts >= 5 then 'FAILED'::public.email_outbox_status else status end
  where id = p_id;
end;
$$;

revoke execute on function public.mark_email_failed(text, uuid, text) from public, authenticated;
grant execute on function public.mark_email_failed(text, uuid, text) to anon;
