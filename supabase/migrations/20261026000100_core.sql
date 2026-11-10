-- =====================================================================
-- LAB NLQS — CORE MODULE  (shared by Action Plans, IQC, Document Control)
-- Migration 0001 · Non-destructive: creates objects only, drops nothing.
--
-- Contents
--   1. Roles enum, departments, profiles, user_roles
--   2. Authorization helper functions (used by every module's RLS)
--   3. Append-only audit trail (audit_events) + generic audit trigger
--   4. RLS policies for core tables
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Core tables
-- ---------------------------------------------------------------------
do $$ begin
  create type public.app_role as enum (
    'administrator',       -- users, departments, configuration. NOT a quality approver.
    'quality_manager',     -- approves, verifies, closes, reopens quality actions
    'department_manager',  -- manages actions of the department(s) it is scoped to
    'action_owner',        -- may create actions and be named action owner
    'assigned_staff',      -- may be assigned to actions
    'reviewer',            -- performs implementation verification & effectiveness review
    'viewer'               -- read-only access to all actions
  );
exception when duplicate_object then null; end $$;

create table if not exists public.departments (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[A-Z0-9_-]{2,20}$'),
  name        text not null check (length(trim(name)) > 0),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete restrict,
  email          text not null,
  full_name      text not null default '',
  job_title      text,
  department_id  uuid references public.departments(id),
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists profiles_department_idx on public.profiles(department_id);

-- A role may be global (department_id null) or scoped to one department.
-- department_manager MUST be scoped; other roles are global.
create table if not exists public.user_roles (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete restrict,
  role           public.app_role not null,
  department_id  uuid references public.departments(id),
  granted_by     uuid references public.profiles(id),
  granted_at     timestamptz not null default now(),
  constraint user_roles_scope_chk check (
    (role = 'department_manager' and department_id is not null) or
    (role <> 'department_manager' and department_id is null)
  )
);
create unique index if not exists user_roles_unique_idx
  on public.user_roles (user_id, role, coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists user_roles_user_idx on public.user_roles(user_id);

-- Generic updated_at maintenance
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists departments_updated_at on public.departments;
create trigger departments_updated_at before update on public.departments
  for each row execute function public.tg_set_updated_at();
drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.tg_set_updated_at();

-- New auth user -> profile row (no roles; an administrator grants them)
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''),
          coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email,''), '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------
-- 2. Authorization helpers (SECURITY DEFINER so RLS can call them
--    without recursive policy evaluation). All read only.
-- ---------------------------------------------------------------------
create or replace function public.is_active_user(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = p_user and active);
$$;

create or replace function public.has_role(p_role public.app_role, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles ur join public.profiles p on p.id = ur.user_id
    where ur.user_id = p_user and ur.role = p_role and p.active
  );
$$;

create or replace function public.has_any_role(p_roles public.app_role[], p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles ur join public.profiles p on p.id = ur.user_id
    where ur.user_id = p_user and ur.role = any(p_roles) and p.active
  );
$$;

create or replace function public.is_dept_manager_of(p_department uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles ur join public.profiles p on p.id = ur.user_id
    where ur.user_id = p_user and ur.role = 'department_manager'
      and ur.department_id = p_department and p.active
  );
$$;

create or replace function public.my_roles()
returns table (role public.app_role, department_id uuid)
language sql stable security definer set search_path = public as $$
  select ur.role, ur.department_id
  from public.user_roles ur join public.profiles p on p.id = ur.user_id
  where ur.user_id = auth.uid() and p.active;
$$;

-- ---------------------------------------------------------------------
-- 3. Append-only audit trail
-- ---------------------------------------------------------------------
create table if not exists public.audit_events (
  id              bigint generated always as identity primary key,
  occurred_at     timestamptz not null default now(),
  actor_id        uuid,                      -- auth.uid(); null when changed outside the app (e.g. SQL editor)
  db_role         text not null default current_user,
  module          text not null,             -- 'core', 'actions', later 'iqc', 'documents'...
  table_name      text not null,
  record_id       uuid,
  action_id       uuid,                      -- set for any row belonging to an action plan
  operation       text not null check (operation in ('INSERT','UPDATE','DELETE')),
  event_type      text,                      -- workflow event (approve, close, ...) when applicable
  changed_fields  text[],
  old_data        jsonb,
  new_data        jsonb
);
create index if not exists audit_events_action_idx on public.audit_events(action_id, occurred_at);
create index if not exists audit_events_table_idx  on public.audit_events(table_name, record_id);
create index if not exists audit_events_time_idx   on public.audit_events(occurred_at);

-- Block any modification of the audit trail, for every database role.
create or replace function public.tg_audit_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_events is append-only: % is not permitted', tg_op
    using errcode = 'insufficient_privilege';
end $$;

drop trigger if exists audit_events_no_update on public.audit_events;
create trigger audit_events_no_update before update or delete on public.audit_events
  for each row execute function public.tg_audit_immutable();
drop trigger if exists audit_events_no_truncate on public.audit_events;
create trigger audit_events_no_truncate before truncate on public.audit_events
  for each statement execute function public.tg_audit_immutable();

-- Generic row audit. TG_ARGV[0] = module name.
create or replace function public.tg_audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changed text[];
  v_action uuid;
  v_record uuid;
begin
  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into v_changed
    from jsonb_object_keys(v_new) k
    where v_new->k is distinct from v_old->k and k not in ('updated_at','version');
    if v_changed is null then
      return new;  -- nothing meaningful changed
    end if;
  end if;

  begin v_record := (v_row->>'id')::uuid; exception when others then v_record := null; end;
  if tg_table_name = 'action_plans' then
    v_action := v_record;
  elsif v_row ? 'action_id' then
    v_action := (v_row->>'action_id')::uuid;
  end if;

  insert into public.audit_events
    (actor_id, module, table_name, record_id, action_id, operation, event_type, changed_fields, old_data, new_data)
  values
    (auth.uid(), coalesce(tg_argv[0], 'core'), tg_table_name, v_record, v_action, tg_op,
     nullif(current_setting('app.event', true), ''), v_changed, v_old, v_new);

  return coalesce(new, old);
end $$;

drop trigger if exists audit_departments on public.departments;
create trigger audit_departments after insert or update or delete on public.departments
  for each row execute function public.tg_audit_row('core');
drop trigger if exists audit_profiles on public.profiles;
create trigger audit_profiles after insert or update or delete on public.profiles
  for each row execute function public.tg_audit_row('core');
drop trigger if exists audit_user_roles on public.user_roles;
create trigger audit_user_roles after insert or update or delete on public.user_roles
  for each row execute function public.tg_audit_row('core');

-- ---------------------------------------------------------------------
-- 4. Guards and RLS for core tables
-- ---------------------------------------------------------------------

-- Non-administrators may only change their own name and job title.
create or replace function public.tg_profiles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;  -- service / SQL editor
  if new.id <> old.id or new.email <> old.email then
    raise exception 'Profile id and email cannot be changed here';
  end if;
  if not public.has_role('administrator') then
    if new.id <> auth.uid() then
      raise exception 'You may only edit your own profile' using errcode = 'insufficient_privilege';
    end if;
    if new.department_id is distinct from old.department_id or new.active is distinct from old.active then
      raise exception 'Only an administrator can change department or active status'
        using errcode = 'insufficient_privilege';
    end if;
  elsif new.id = auth.uid() and new.active = false then
    raise exception 'Administrators cannot deactivate themselves';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.tg_profiles_guard();

-- Administrators manage roles, but never their own (prevents self-granting
-- quality_manager and approving their own work).
create or replace function public.tg_user_roles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_target uuid := coalesce(new.user_id, old.user_id);
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if v_target = auth.uid() then
    raise exception 'You cannot change your own roles; ask another administrator'
      using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'INSERT' then
    new.granted_by := auth.uid();
    new.granted_at := now();
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists user_roles_guard on public.user_roles;
create trigger user_roles_guard before insert or update or delete on public.user_roles
  for each row execute function public.tg_user_roles_guard();

alter table public.departments  enable row level security;
alter table public.profiles     enable row level security;
alter table public.user_roles   enable row level security;
alter table public.audit_events enable row level security;

drop policy if exists departments_select on public.departments;
create policy departments_select on public.departments for select to authenticated
  using (public.is_active_user());
drop policy if exists departments_admin_insert on public.departments;
create policy departments_admin_insert on public.departments for insert to authenticated
  with check (public.has_role('administrator'));
drop policy if exists departments_admin_update on public.departments;
create policy departments_admin_update on public.departments for update to authenticated
  using (public.has_role('administrator')) with check (public.has_role('administrator'));

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (public.is_active_user() or id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.has_role('administrator'))
  with check (id = auth.uid() or public.has_role('administrator'));

drop policy if exists user_roles_select on public.user_roles;
create policy user_roles_select on public.user_roles for select to authenticated
  using (public.is_active_user());
drop policy if exists user_roles_admin_insert on public.user_roles;
create policy user_roles_admin_insert on public.user_roles for insert to authenticated
  with check (public.has_role('administrator'));
drop policy if exists user_roles_admin_delete on public.user_roles;
create policy user_roles_admin_delete on public.user_roles for delete to authenticated
  using (public.has_role('administrator'));

-- Audit rows: administrators and quality managers see all core rows;
-- action-related rows are additionally visible via the actions module policy.
drop policy if exists audit_select_core on public.audit_events;
create policy audit_select_core on public.audit_events for select to authenticated
  using (public.has_any_role(array['administrator','quality_manager']::public.app_role[]));

-- ---------------------------------------------------------------------
-- Privileges: nothing for anonymous users; audit trail is read-only.
-- ---------------------------------------------------------------------
revoke all on public.departments, public.profiles, public.user_roles, public.audit_events from anon;
grant select, insert, update on public.departments to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, delete on public.user_roles to authenticated;
revoke insert, update, delete, truncate on public.audit_events from authenticated;
grant select on public.audit_events to authenticated;

revoke execute on function public.tg_audit_row() from public;
grant execute on function public.has_role(public.app_role, uuid), public.has_any_role(public.app_role[], uuid),
  public.is_dept_manager_of(uuid, uuid), public.is_active_user(uuid), public.my_roles() to authenticated;
