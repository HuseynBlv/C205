-- Append-only audit log, application settings, email outbox, and scoped
-- idempotency records. None of these four tables have any RLS policy or
-- grant for `anon`/`authenticated` beyond what's explicitly listed below —
-- audit records and notification jobs must never be directly readable or
-- writable by a client, per the brief.

create table public.audit_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid references public.profiles (id) on delete set null,
  actor_role public.account_role,
  action text not null,
  entity_table text not null,
  entity_id text not null,
  reason text,
  before_value jsonb,
  after_value jsonb
);

comment on table public.audit_events is
  'Append-only. No UPDATE/DELETE is possible for any role, including the '
  'table owner, via audit_events_immutable(). Rows are only ever inserted '
  'by SECURITY DEFINER functions, never by a direct client grant.';

create index audit_events_entity_idx on public.audit_events (entity_table, entity_id);
create index audit_events_actor_idx on public.audit_events (actor_id);

create function public.audit_events_immutable()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'audit_events is append-only: % is not permitted', tg_op;
end;
$$;

revoke execute on function public.audit_events_immutable() from public, anon, authenticated;

create trigger audit_events_no_update
  before update on public.audit_events
  for each row
  execute function public.audit_events_immutable();

create trigger audit_events_no_delete
  before delete on public.audit_events
  for each row
  execute function public.audit_events_immutable();

alter table public.audit_events enable row level security;
-- Intentionally no policies: RLS enabled with zero policies denies all
-- access to `anon` and `authenticated`. Only SECURITY DEFINER functions
-- (which run as the table owner, bypassing RLS) and `service_role`
-- (which bypasses RLS entirely) can touch this table.

revoke all on public.audit_events from anon, authenticated;

-- Singleton settings row. The `id boolean primary key default true check
-- (id)` trick is a standard way to make Postgres enforce "exactly one row"
-- without a separate row-count constraint.
create table public.app_settings (
  id boolean primary key default true,
  usg_notification_email text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  constraint app_settings_singleton check (id)
);

comment on table public.app_settings is
  'Single-row application configuration. usg_notification_email is a '
  'placeholder seeded by migration, not a development credential — an '
  'admin must set the real address via set_usg_notification_email() '
  'before any notification email is meaningful.';

create function public.set_app_settings_audit_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

revoke execute on function public.set_app_settings_audit_fields() from public, anon, authenticated;

create trigger app_settings_set_audit_fields
  before update on public.app_settings
  for each row
  execute function public.set_app_settings_audit_fields();

alter table public.app_settings enable row level security;

create policy app_settings_select_admin
  on public.app_settings
  for select
  to authenticated
  using (public.is_active_admin());

-- No update policy/grant: settings changes go through
-- set_usg_notification_email() (functions migration) so every change is
-- validated and audited, not just role-gated. The audit-fields trigger
-- above still applies to that function's UPDATE statement.
revoke all on public.app_settings from anon, authenticated;
grant select on public.app_settings to authenticated;

-- Placeholder value, not a real inbox and not a secret — an administrator
-- must replace it via the app before notifications go live. Seeded here
-- (rather than seed.sql) because exactly one settings row must always
-- exist for the UPDATE-only grant above to ever have a row to update.
insert into public.app_settings (usg_notification_email)
values ('replace-before-launch@usg.example.edu');

create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  subject text not null,
  body text not null,
  template text not null,
  metadata jsonb not null default '{}'::jsonb,
  related_reservation_id uuid references public.reservations (id) on delete set null,
  status public.email_outbox_status not null default 'PENDING',
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

comment on table public.email_outbox is
  'Durable notification queue. No client grant exists at all — jobs are '
  'enqueued only by SECURITY DEFINER functions, and only a future sending '
  'worker using the service_role key (which bypasses RLS) may update '
  'status/attempts/sent_at.';

create index email_outbox_status_idx on public.email_outbox (status);

alter table public.email_outbox enable row level security;
-- Intentionally no policies for anon/authenticated: notification jobs are
-- not directly readable or writable by any client.

revoke all on public.email_outbox from anon, authenticated;

create table public.idempotency_keys (
  scope text not null,
  key text not null,
  requester_id uuid references public.profiles (id) on delete set null,
  response jsonb,
  created_at timestamptz not null default now(),
  primary key (scope, key)
);

comment on table public.idempotency_keys is
  'Scoped by (scope, key) so different operations cannot collide on the '
  'same client-supplied key. Written only from inside SECURITY DEFINER '
  'functions such as submit_reservation(); no direct client grant.';

alter table public.idempotency_keys enable row level security;
-- Intentionally no policies for anon/authenticated.

revoke all on public.idempotency_keys from anon, authenticated;
