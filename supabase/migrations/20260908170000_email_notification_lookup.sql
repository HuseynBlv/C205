-- Lets the email-sending worker render a real, structured HTML template
-- (subject/body already exist as plain text on email_outbox itself — this
-- is additional detail for a nicer layout, not a replacement) without
-- touching any of the six existing reservation-mutating functions.
--
-- Gated by the exact same email_worker_secret as claim_pending_emails /
-- mark_email_sent / mark_email_failed (see that migration's comment for
-- why a shared secret, not a Supabase Auth session or the service_role
-- key). This function deliberately returns the FULL row — that's safe
-- here specifically because the only thing that ever happens with the
-- result is rendering the one email already addressed to
-- email_outbox.to_email; it never reaches any other recipient, so there
-- is no privacy-tier decision to make the way reservation-details.ts
-- makes one for a browser request from an arbitrary viewer.
create function public.get_reservation_for_notification(p_secret text, p_id uuid)
returns public.reservations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected text;
  v_reservation public.reservations;
begin
  select email_worker_secret into v_expected from public.app_settings where id = true;
  if v_expected is null or p_secret is null or p_secret <> v_expected then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  select * into v_reservation from public.reservations where id = p_id;
  return v_reservation;
end;
$$;

revoke execute on function public.get_reservation_for_notification(text, uuid) from public, authenticated;
grant execute on function public.get_reservation_for_notification(text, uuid) to anon;
