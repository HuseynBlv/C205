-- Room, published availability windows, and blocked intervals.
--
-- All three are admin-managed reference/config data. Any ACTIVE account may
-- read them (they need to know open hours and blackouts to submit a valid
-- request); only an active admin may write them. None of this is booking
-- data that identifies a person, so it doesn't need the anonymized-view
-- treatment reservations get.

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  timezone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger rooms_set_updated_at
  before update on public.rooms
  for each row
  execute function public.set_updated_at();

alter table public.rooms enable row level security;

create policy rooms_select_active
  on public.rooms
  for select
  to authenticated
  using (public.is_active_user());

create policy rooms_admin_write
  on public.rooms
  for all
  to authenticated
  using (public.is_active_admin())
  with check (public.is_active_admin());

revoke all on public.rooms from anon, authenticated;
grant select on public.rooms to authenticated;
grant insert, update, delete on public.rooms to authenticated;

-- The room this whole app exists for. Structural reference data, not a
-- development fixture, so it belongs in a migration (runs in every
-- environment) rather than seed.sql (dev-only).
insert into public.rooms (code, name, timezone)
values ('C205', 'Room C205', 'Asia/Baku');

create table public.availability_windows (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  label text,
  published_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint availability_windows_time_check check (ends_at > starts_at)
);

create index availability_windows_room_starts_idx
  on public.availability_windows (room_id, starts_at);

create trigger availability_windows_set_updated_at
  before update on public.availability_windows
  for each row
  execute function public.set_updated_at();

alter table public.availability_windows enable row level security;

create policy availability_windows_select_active
  on public.availability_windows
  for select
  to authenticated
  using (public.is_active_user());

create policy availability_windows_admin_write
  on public.availability_windows
  for all
  to authenticated
  using (public.is_active_admin())
  with check (public.is_active_admin());

revoke all on public.availability_windows from anon, authenticated;
grant select on public.availability_windows to authenticated;
grant insert, update, delete on public.availability_windows to authenticated;

create table public.blocked_intervals (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null,
  blocked_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint blocked_intervals_time_check check (ends_at > starts_at)
);

create index blocked_intervals_room_starts_idx
  on public.blocked_intervals (room_id, starts_at);

create trigger blocked_intervals_set_updated_at
  before update on public.blocked_intervals
  for each row
  execute function public.set_updated_at();

alter table public.blocked_intervals enable row level security;

create policy blocked_intervals_select_active
  on public.blocked_intervals
  for select
  to authenticated
  using (public.is_active_user());

create policy blocked_intervals_admin_write
  on public.blocked_intervals
  for all
  to authenticated
  using (public.is_active_admin())
  with check (public.is_active_admin());

revoke all on public.blocked_intervals from anon, authenticated;
grant select on public.blocked_intervals to authenticated;
grant insert, update, delete on public.blocked_intervals to authenticated;
