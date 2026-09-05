-- Profiles: one row per Supabase Auth identity.
--
-- `role` and `account_status` are protected columns — see the grants at the
-- bottom of this file. They are never included in the UPDATE column grant,
-- so even a client that defeats RLS (there is none to defeat here; the
-- policy also forbids it) still hits a hard permission-denied at the grant
-- level. They can only change via the admin-only SECURITY DEFINER functions
-- in a later migration (set_user_role, set_account_status).
--
-- Removing account access is always a status flip to 'REMOVED', never a
-- row deletion — the FK from profiles to auth.users is ON DELETE RESTRICT
-- so the underlying identity can't be deleted out from under a profile
-- that has reservation history pointing at it.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  email text not null,
  full_name text not null,
  role public.account_role not null default 'USER',
  account_status public.account_status not null default 'PENDING',
  status_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'One row per auth.users identity. role/account_status are protected: '
  'mutable only via the set_user_role / set_account_status SECURITY DEFINER '
  'functions, never by direct client UPDATE.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- Auto-provision a profile row whenever a new Auth identity is created.
-- SECURITY DEFINER is required: the role that performs the internal
-- auth.users insert (Supabase's auth service) has no grants on
-- public.profiles, by design.
create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role, account_status)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), new.email),
    'USER',
    'PENDING'
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user();

-- Keep profiles.email in sync if a user changes their Auth email later.
-- This only affects the live profile row, never historical reservation
-- snapshots (requester_name/requester_email on reservations), which are
-- captured at submission time and must not change retroactively.
create function public.handle_auth_user_email_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

revoke execute on function public.handle_auth_user_email_updated() from public, anon, authenticated;

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  execute function public.handle_auth_user_email_updated();

-- Shared RLS helper predicates. These must be SECURITY DEFINER, not INVOKER:
-- the profiles_select_admin policy below calls is_active_admin(), so an
-- INVOKER function re-triggers RLS on profiles for its own internal select,
-- which re-evaluates profiles_select_admin, which calls is_active_admin()
-- again — infinite recursion ("stack depth limit exceeded"). Running as
-- DEFINER bypasses RLS for this internal lookup only; it's still safe
-- because the query is hard-scoped to the caller's own row (auth.uid()),
-- never parameterized by caller input.
create function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.account_status = 'ACTIVE'
  );
$$;

create function public.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'ADMIN'
      and p.account_status = 'ACTIVE'
  );
$$;

revoke execute on function public.is_active_user() from public, anon;
revoke execute on function public.is_active_admin() from public, anon;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.is_active_admin() to authenticated;

alter table public.profiles enable row level security;

-- A user can always read their own account row — this is deliberately not
-- gated on account_status, because it is exactly how an inactive user finds
-- out *why* they're inactive (status_reason). It carries no booking data.
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

-- Admins need to see the full account list to review/authorize accounts.
create policy profiles_select_admin
  on public.profiles
  for select
  to authenticated
  using (public.is_active_admin());

-- Users may edit their own display name only. role/account_status are
-- excluded from the column grant below, not just the policy, so no UPDATE
-- statement naming those columns can succeed regardless of its WHERE/CHECK.
create policy profiles_update_own_name
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
