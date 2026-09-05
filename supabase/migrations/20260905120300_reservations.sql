-- Reservations: the core booking record.
--
-- No direct INSERT/UPDATE/DELETE grant exists on this table for
-- `authenticated` or `anon` at all — every write goes through a
-- SECURITY DEFINER function in a later migration (submit_reservation,
-- decide_reservation, cancel_reservation), which runs as the table owner
-- and so needs no grant of its own. This is what makes reservation status,
-- decision fields, and requester identity un-forgeable by a direct client
-- write: there is no grant path to attempt one through.
--
-- requester_name/requester_email are snapshots taken at submission time by
-- submit_reservation(), not a live join to profiles — this is what
-- preserves historical requester information even after a profile's
-- account_status becomes REMOVED (accounts are never deleted, only
-- deactivated, but this also protects history against future schema
-- changes to how identity is displayed).
create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete restrict,
  requester_id uuid references public.profiles (id) on delete set null,
  requester_name text not null,
  requester_email text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  purpose text not null,
  participant_count integer not null,
  status public.reservation_status not null default 'PENDING',
  admin_override boolean not null default false,
  override_reason text,
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null,
  decision_reason text,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null,
  cancellation_reason text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservations_time_check check (ends_at > starts_at),
  constraint reservations_participant_count_check check (participant_count > 0),
  constraint reservations_purpose_not_blank check (btrim(purpose) <> ''),
  constraint reservations_decision_pair check ((decided_at is null) = (decided_by is null)),
  constraint reservations_cancellation_pair check ((cancelled_at is null) = (cancelled_by is null))
);

comment on table public.reservations is
  'requester_name/requester_email are point-in-time snapshots, not a live '
  'join — they preserve historical requester identity independent of the '
  'profiles row. All writes go through submit_reservation / '
  'decide_reservation / cancel_reservation; there is no direct grant.';

create index reservations_room_starts_idx on public.reservations (room_id, starts_at);
create index reservations_requester_idx on public.reservations (requester_id);
create index reservations_status_idx on public.reservations (status);

-- The one rule that must hold regardless of which function or client wrote
-- the row: two APPROVED reservations for the same room can never occupy
-- overlapping time. btree_gist lets a plain equality column (room_id) sit
-- in the same GiST index as the range overlap operator.
--
-- The half-open range ('[)': starts_at inclusive, ends_at exclusive) is
-- what allows back-to-back bookings to be adjacent without colliding — a
-- 10:00-11:00 and an 11:00-12:00 approved booking do not overlap. The
-- `where (status = 'APPROVED')` clause is what allows unlimited concurrent
-- PENDING requests for the same slot (only one can ever be approved; the
-- rest must then be rejected) without touching PENDING/REJECTED/CANCELLED
-- rows at all.
alter table public.reservations
  add constraint reservations_no_overlapping_approved
  exclude using gist (
    room_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (status = 'APPROVED');

create trigger reservations_set_updated_at
  before update on public.reservations
  for each row
  execute function public.set_updated_at();

-- Optimistic-concurrency counter. This is a courtesy signal for clients
-- (e.g. "this reservation changed since you loaded it") — the actual
-- correctness guarantee against concurrent admin decisions comes from
-- `select ... for update` row locking inside decide_reservation /
-- cancel_reservation, not from clients comparing versions.
create function public.bump_reservation_version()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.version = old.version + 1;
  return new;
end;
$$;

revoke execute on function public.bump_reservation_version() from public, anon, authenticated;

create trigger reservations_bump_version
  before update on public.reservations
  for each row
  execute function public.bump_reservation_version();

alter table public.reservations enable row level security;

-- An active user may read their own request history in full detail.
create policy reservations_select_own
  on public.reservations
  for select
  to authenticated
  using (requester_id = auth.uid() and public.is_active_user());

-- Admins may read every reservation in full detail.
create policy reservations_select_admin
  on public.reservations
  for select
  to authenticated
  using (public.is_active_admin());

-- No insert/update/delete policy exists for any client role. Combined with
-- the grants below (none), this table is only ever written by the
-- SECURITY DEFINER functions in the functions migration, which run as the
-- table owner and so bypass both RLS and the grant check entirely.
revoke all on public.reservations from anon, authenticated;
grant select on public.reservations to authenticated;

-- Anonymous occupancy projection: what other users need to plan around
-- (which slots are taken or tentatively held) without any requester
-- identity, email, or purpose. This view is deliberately NOT
-- `security_invoker` — it runs with the view owner's privileges, which is
-- the standard Postgres technique for exposing a narrow, non-RLS-limited
-- slice of a table the caller otherwise can't read directly (here: other
-- people's reservations). The active-user gate is enforced inside the view
-- itself via auth.uid(), which reflects the real caller regardless of the
-- view's own privileges.
create view public.room_occupancy
with (security_invoker = false)
as
select
  r.id,
  r.room_id,
  r.starts_at,
  r.ends_at,
  r.status
from public.reservations r
where r.status in ('PENDING', 'APPROVED')
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.account_status = 'ACTIVE'
  );

comment on view public.room_occupancy is
  'Anonymized calendar projection: time + status only, no requester_id, '
  'requester_name, requester_email, or purpose. Safe for any active user '
  'to see, unlike the base reservations table.';

revoke all on public.room_occupancy from anon, authenticated;
grant select on public.room_occupancy to authenticated;
