-- A genuine missing notification, not a bug: handle_auth_user_email_confirmed
-- (20260905130000_auth_hardening.sql) already fires the moment a new
-- user's email is verified, but only ever updated profiles.email_verified_at
-- — USG had no signal at all that a new account needed authorizing, short
-- of manually checking /admin/accounts. This is exactly the gap in the
-- USG internal rules document's "If a new individual requires access...
-- the USG Logistics Department must be informed" (rule 13) — the account
-- sits in PENDING indefinitely until an admin happens to notice it.
--
-- Deliberately keyed off email confirmation, not the original signup
-- (auth.users INSERT): an unverified signup isn't yet a real, actionable
-- account — notifying admin about it before the email is even confirmed
-- would be noise for something that may never complete.
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
      s.usg_notification_email,
      format('New C205 account awaiting authorization: %s', coalesce(v_full_name, new.email)),
      format(
        '%s (%s) has verified their email and is awaiting authorization to request C205. Review and authorize from the admin accounts page.',
        coalesce(v_full_name, new.email), new.email
      ),
      'account_registered_admin',
      jsonb_build_object('profile_id', new.id)
    from public.app_settings s;
  end if;
  return new;
end;
$$;
