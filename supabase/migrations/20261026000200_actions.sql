-- =====================================================================
-- LAB NLQS — ACTION PLAN CONTROL MANAGEMENT  · Phase 1 (core workflow)
-- Migration 0002 · Non-destructive. Requires 0001_core.
--
--   1. Enums, lookup tables (QSE, ISO clauses, categories, sources), settings
--   2. action_plans and child tables
--   3. Permission functions
--   4. Integrity triggers (numbering, versioning, protected fields)
--   5. Workflow engine (single entry point: action_transition)
--   6. Reassignment, deadline extension, assignment RPCs
--   7. Register view
--   8. RLS + privileges
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Types, lookups, settings
-- ---------------------------------------------------------------------
do $$ begin
  create type public.action_status as enum (
    'draft','submitted','approved','in_progress',
    'pending_verification','effectiveness_review','pending_closure',
    'closed','rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.action_priority as enum ('low','medium','high','critical');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.risk_level as enum ('low','medium','high','very_high');
exception when duplicate_object then null; end $$;

create table if not exists public.qse_categories (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  sort_order  int  not null default 0,
  active      boolean not null default true
);

create table if not exists public.iso_clauses (
  id          uuid primary key default gen_random_uuid(),
  standard    text not null default 'ISO 15189:2022',
  clause      text not null,
  title       text not null,
  sort_order  int  not null default 0,
  active      boolean not null default true,
  unique (standard, clause)
);

create table if not exists public.action_categories (
  id                        uuid primary key default gen_random_uuid(),
  code                      text not null unique,
  name                      text not null,
  description               text,
  requires_approval         boolean not null default false,  -- always needs approval before execution
  requires_effectiveness    boolean not null default false,  -- needs an effectiveness review before closure
  requires_root_cause       boolean not null default false,  -- used by the CAPA module (phase 2)
  sort_order                int not null default 0,
  active                    boolean not null default true
);

create table if not exists public.action_sources (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  sort_order  int not null default 0,
  active      boolean not null default true
);

-- Single-row configuration (laboratory policy encoded as data)
create table if not exists public.action_settings (
  id                     boolean primary key default true check (id),
  timezone               text not null default 'Asia/Phnom_Penh',
  approval_min_priority  public.action_priority default 'high',   -- null = priority never forces approval
  approval_min_risk      public.risk_level      default 'high',   -- null = risk never forces approval
  due_soon_days          int not null default 7 check (due_soon_days between 1 and 90),
  min_justification_len  int not null default 15 check (min_justification_len between 5 and 500),
  updated_at             timestamptz not null default now()
);
insert into public.action_settings (id) values (true) on conflict do nothing;

create or replace function public.app_today()
returns date language sql stable security definer set search_path = public as $$
  select (now() at time zone coalesce((select timezone from public.action_settings where id), 'Asia/Phnom_Penh'))::date;
$$;

-- ---------------------------------------------------------------------
-- 2. Action plans and child tables
-- ---------------------------------------------------------------------
create table if not exists public.action_number_counters (
  year      int primary key,
  last_no   int not null default 0
);

create table if not exists public.action_plans (
  id                        uuid primary key default gen_random_uuid(),
  action_no                 text not null unique,
  title                     text not null check (length(trim(title)) between 5 and 200),
  description               text not null default '',
  category_id               uuid not null references public.action_categories(id),
  source_id                 uuid references public.action_sources(id),
  source_reference          text,           -- e.g. audit finding no., NC report no.
  qse_id                    uuid references public.qse_categories(id),
  department_id             uuid not null references public.departments(id),
  priority                  public.action_priority not null default 'medium',
  likelihood                smallint not null default 1 check (likelihood between 1 and 5),
  severity                  smallint not null default 1 check (severity between 1 and 5),
  risk_score                smallint generated always as (likelihood * severity) stored,
  risk_level                public.risk_level generated always as (
                              case when likelihood * severity >= 20 then 'very_high'::public.risk_level
                                   when likelihood * severity >= 10 then 'high'::public.risk_level
                                   when likelihood * severity >= 5  then 'medium'::public.risk_level
                                   else 'low'::public.risk_level end) stored,
  owner_id                  uuid not null references public.profiles(id),
  created_by                uuid not null references public.profiles(id),
  start_date                date,
  due_date                  date not null,
  original_due_date         date not null,
  completion_date           date,
  target_outcome            text not null default '',   -- measurable target
  success_measure           text,                       -- how effectiveness will be judged
  implementation_summary    text,                       -- what was done (evidence summary; files in phase 2)
  effectiveness_review_date date,                       -- when effectiveness can be measured
  verification_result       text,
  effectiveness_result      text,
  closure_comment           text,
  status                    public.action_status not null default 'draft',
  is_blocked                boolean not null default false,
  blocked_reason            text,
  requires_approval         boolean,                    -- snapshot taken at submission
  requires_effectiveness    boolean,                    -- snapshot taken at submission
  submitted_by              uuid references public.profiles(id),
  submitted_at              timestamptz,
  approved_by               uuid references public.profiles(id),
  approved_at               timestamptz,
  verification_submitted_by uuid references public.profiles(id),
  verified_by               uuid references public.profiles(id),
  verified_at               timestamptz,
  effectiveness_by          uuid references public.profiles(id),
  effectiveness_at          timestamptz,
  closed_by                 uuid references public.profiles(id),
  closed_at                 timestamptz,
  reopened_count            int not null default 0,
  version                   int not null default 1,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint action_dates_chk check (start_date is null or due_date >= start_date)
);
create index if not exists action_plans_status_idx     on public.action_plans(status);
create index if not exists action_plans_department_idx on public.action_plans(department_id);
create index if not exists action_plans_owner_idx      on public.action_plans(owner_id);
create index if not exists action_plans_due_idx        on public.action_plans(due_date);
create index if not exists action_plans_category_idx   on public.action_plans(category_id);
create index if not exists action_plans_qse_idx        on public.action_plans(qse_id);

create table if not exists public.action_iso_clauses (
  action_id  uuid not null references public.action_plans(id) on delete restrict,
  clause_id  uuid not null references public.iso_clauses(id),
  primary key (action_id, clause_id)
);
-- audit trigger needs an id-like column; composite key rows are audited with record_id null.

create table if not exists public.action_assignments (
  id           uuid primary key default gen_random_uuid(),
  action_id    uuid not null references public.action_plans(id) on delete restrict,
  user_id      uuid not null references public.profiles(id),
  assigned_by  uuid references public.profiles(id),
  assigned_at  timestamptz not null default now(),
  unique (action_id, user_id)
);
create index if not exists action_assignments_user_idx on public.action_assignments(user_id);

-- Every workflow decision (approve, reject, verify, close, reopen, ...). Written only by RPCs.
create table if not exists public.action_decisions (
  id           uuid primary key default gen_random_uuid(),
  action_id    uuid not null references public.action_plans(id) on delete restrict,
  event        text not null,
  from_status  public.action_status not null,
  to_status    public.action_status not null,
  comment      text,
  details      jsonb,
  decided_by   uuid not null references public.profiles(id),
  decided_at   timestamptz not null default now()
);
create index if not exists action_decisions_action_idx on public.action_decisions(action_id, decided_at);

create table if not exists public.deadline_extensions (
  id             uuid primary key default gen_random_uuid(),
  action_id      uuid not null references public.action_plans(id) on delete restrict,
  old_due_date   date not null,
  new_due_date   date not null,
  justification  text not null,
  approved_by    uuid not null references public.profiles(id),
  created_at     timestamptz not null default now()
);
create index if not exists deadline_extensions_action_idx on public.deadline_extensions(action_id);

create table if not exists public.action_comments (
  id          uuid primary key default gen_random_uuid(),
  action_id   uuid not null references public.action_plans(id) on delete restrict,
  author_id   uuid not null references public.profiles(id),
  body        text not null check (length(trim(body)) between 1 and 4000),
  created_at  timestamptz not null default now()
);
create index if not exists action_comments_action_idx on public.action_comments(action_id, created_at);

-- ---------------------------------------------------------------------
-- 3. Permission functions
-- ---------------------------------------------------------------------
create or replace function public.is_assigned_to_action(p_action uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.action_assignments where action_id = p_action and user_id = p_user);
$$;

create or replace function public.can_view_action_row(
  p_id uuid, p_department uuid, p_created_by uuid, p_owner uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active_user(p_user) and (
       public.has_any_role(array['administrator','quality_manager','reviewer','viewer']::public.app_role[], p_user)
    or public.is_dept_manager_of(p_department, p_user)
    or p_created_by = p_user
    or p_owner = p_user
    or public.is_assigned_to_action(p_id, p_user));
$$;

create or replace function public.can_view_action(p_action uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select public.can_view_action_row(a.id, a.department_id, a.created_by, a.owner_id, p_user)
                   from public.action_plans a where a.id = p_action), false);
$$;

-- Who may edit an action's fields directly (field-level limits are in tg_action_guard).
create or replace function public.can_edit_action_row(
  p_status public.action_status, p_department uuid, p_created_by uuid, p_owner uuid,
  p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active_user(p_user)
     and p_status not in ('closed','rejected')
     and (   public.has_role('quality_manager', p_user)
          or public.is_dept_manager_of(p_department, p_user)
          or (p_status = 'draft' and (p_created_by = p_user or p_owner = p_user))
          or (p_status in ('approved','in_progress') and p_owner = p_user));
$$;

create or replace function public.can_create_action(p_department uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active_user(p_user) and (
       public.has_role('quality_manager', p_user)
    or public.is_dept_manager_of(p_department, p_user)
    or public.has_role('action_owner', p_user));
$$;

create or replace function public.is_eligible_owner(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(array['action_owner','department_manager','quality_manager']::public.app_role[], p_user);
$$;

-- Approval policy: category flag OR priority/risk thresholds from settings.
create or replace function public.action_requires_approval(p_category uuid, p_priority public.action_priority, p_risk public.risk_level)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select requires_approval from public.action_categories where id = p_category), true)
      or coalesce(p_priority >= s.approval_min_priority, false)
      or coalesce(p_risk >= s.approval_min_risk, false)
  from public.action_settings s where s.id;
$$;

-- ---------------------------------------------------------------------
-- 4. Integrity triggers
-- ---------------------------------------------------------------------
create or replace function public.tg_action_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_year int := extract(year from public.app_today())::int; v_no int;
begin
  insert into public.action_number_counters (year, last_no) values (v_year, 1)
  on conflict (year) do update set last_no = public.action_number_counters.last_no + 1
  returning last_no into v_no;
  new.action_no := 'ACT-' || v_year || '-' || lpad(v_no::text, 4, '0');

  if auth.uid() is not null then
    new.created_by := auth.uid();
  elsif new.created_by is null then
    raise exception 'created_by is required';
  end if;

  -- Every action starts as a clean draft; workflow fields cannot be pre-set.
  new.status := 'draft';
  new.version := 1;
  new.original_due_date := new.due_date;
  new.completion_date := null; new.verification_result := null; new.effectiveness_result := null;
  new.closure_comment := null; new.is_blocked := false; new.blocked_reason := null;
  new.requires_approval := null; new.requires_effectiveness := null;
  new.submitted_by := null; new.submitted_at := null; new.approved_by := null; new.approved_at := null;
  new.verification_submitted_by := null; new.verified_by := null; new.verified_at := null;
  new.effectiveness_by := null; new.effectiveness_at := null; new.closed_by := null; new.closed_at := null;
  new.reopened_count := 0;
  new.created_at := now(); new.updated_at := now();

  if not public.is_eligible_owner(new.owner_id) then
    raise exception 'The selected action owner does not hold an owner-eligible role (action owner, department manager or quality manager)';
  end if;
  return new;
end $$;

drop trigger if exists action_plans_before_insert on public.action_plans;
create trigger action_plans_before_insert before insert on public.action_plans
  for each row execute function public.tg_action_before_insert();

-- Field-level protection for direct UPDATEs. The workflow RPCs set app.workflow='on'
-- for the duration of their transaction and bypass these checks.
create or replace function public.tg_action_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb; v_new jsonb;
  -- Never editable directly by anyone
  c_workflow_only text[] := array['id','action_no','status','created_by','created_at','original_due_date',
    'completion_date','verification_result','effectiveness_result','closure_comment','is_blocked','blocked_reason',
    'requires_approval','requires_effectiveness','submitted_by','submitted_at','approved_by','approved_at',
    'verification_submitted_by','verified_by','verified_at','effectiveness_by','effectiveness_at',
    'closed_by','closed_at','reopened_count','version','updated_at','risk_score','risk_level'];
  -- After submission these change only through dedicated RPCs (reassign / extend deadline)
  c_rpc_only text[] := array['owner_id','due_date'];
  -- After submission only a quality manager may change these (they drive the approval policy)
  c_policy text[] := array['category_id','department_id','priority','likelihood','severity'];
  -- What an action owner may update after approval
  c_owner_after_approval text[] := array['implementation_summary','start_date','effectiveness_review_date'];
  v_key text;
begin
  new.updated_at := now();
  new.version := old.version + 1;

  if coalesce(current_setting('app.workflow', true), '') = 'on' then
    return new;
  end if;
  if auth.uid() is null then
    raise exception 'Direct changes to action plans outside the application are not permitted; use the workflow functions';
  end if;

  if old.status in ('closed','rejected') then
    raise exception 'Action % is % and cannot be edited', old.action_no, old.status
      using errcode = 'insufficient_privilege';
  end if;

  v_old := to_jsonb(old); v_new := to_jsonb(new);
  foreach v_key in array c_workflow_only loop
    if v_key not in ('version','updated_at','risk_score','risk_level') and v_new->v_key is distinct from v_old->v_key then
      raise exception 'Field "%" can only change through the workflow', v_key using errcode = 'insufficient_privilege';
    end if;
  end loop;

  if old.status <> 'draft' then
    foreach v_key in array c_rpc_only loop
      if v_new->v_key is distinct from v_old->v_key then
        raise exception 'After submission, "%" must be changed with % (justification required)', v_key,
          case v_key when 'owner_id' then 'Reassign' else 'Extend deadline' end
          using errcode = 'insufficient_privilege';
      end if;
    end loop;
    if not public.has_role('quality_manager') then
      foreach v_key in array c_policy loop
        if v_new->v_key is distinct from v_old->v_key then
          raise exception 'After submission only a quality manager can change "%"', v_key
            using errcode = 'insufficient_privilege';
        end if;
      end loop;
    end if;
    -- Owners (who are not managers) are limited to implementation fields
    if not public.has_role('quality_manager') and not public.is_dept_manager_of(old.department_id) then
      if (v_new - c_owner_after_approval - c_workflow_only) is distinct from (v_old - c_owner_after_approval - c_workflow_only) then
        raise exception 'After approval the action owner may only update implementation summary, start date and effectiveness review date'
          using errcode = 'insufficient_privilege';
      end if;
    end if;
  end if;

  if new.owner_id is distinct from old.owner_id and not public.is_eligible_owner(new.owner_id) then
    raise exception 'The selected action owner does not hold an owner-eligible role';
  end if;
  if old.status = 'draft' and new.due_date is distinct from old.due_date then
    new.original_due_date := new.due_date;  -- plan not yet committed
  end if;
  return new;
end $$;

drop trigger if exists action_plans_guard on public.action_plans;
create trigger action_plans_guard before update on public.action_plans
  for each row execute function public.tg_action_guard();

-- No physical deletion of action records (traceability). Rejected is the terminal "no" state.
create or replace function public.tg_no_delete()
returns trigger language plpgsql as $$
begin
  raise exception '% records cannot be deleted; use the workflow (reject / reopen) instead', tg_table_name
    using errcode = 'insufficient_privilege';
end $$;

drop trigger if exists action_plans_no_delete on public.action_plans;
create trigger action_plans_no_delete before delete on public.action_plans
  for each row execute function public.tg_no_delete();
drop trigger if exists action_decisions_no_change on public.action_decisions;
create trigger action_decisions_no_change before update or delete on public.action_decisions
  for each row execute function public.tg_no_delete();
drop trigger if exists deadline_extensions_no_change on public.deadline_extensions;
create trigger deadline_extensions_no_change before update or delete on public.deadline_extensions
  for each row execute function public.tg_no_delete();
drop trigger if exists action_comments_no_change on public.action_comments;
create trigger action_comments_no_change before update or delete on public.action_comments
  for each row execute function public.tg_no_delete();

-- Child tables may only change while the parent is editable
create or replace function public.tg_action_child_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_status public.action_status;
begin
  if coalesce(current_setting('app.workflow', true), '') = 'on' then return coalesce(new, old); end if;
  select status into v_status from public.action_plans where id = coalesce(new.action_id, old.action_id);
  if v_status in ('closed','rejected') then
    raise exception 'The action is % and cannot be changed', v_status using errcode = 'insufficient_privilege';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists action_iso_clauses_guard on public.action_iso_clauses;
create trigger action_iso_clauses_guard before insert or delete on public.action_iso_clauses
  for each row execute function public.tg_action_child_guard();

-- Audit triggers
drop trigger if exists audit_action_plans on public.action_plans;
create trigger audit_action_plans after insert or update on public.action_plans
  for each row execute function public.tg_audit_row('actions');
drop trigger if exists audit_action_iso on public.action_iso_clauses;
create trigger audit_action_iso after insert or delete on public.action_iso_clauses
  for each row execute function public.tg_audit_row('actions');
drop trigger if exists audit_action_assign on public.action_assignments;
create trigger audit_action_assign after insert or delete on public.action_assignments
  for each row execute function public.tg_audit_row('actions');
drop trigger if exists audit_action_decisions on public.action_decisions;
create trigger audit_action_decisions after insert on public.action_decisions
  for each row execute function public.tg_audit_row('actions');
drop trigger if exists audit_deadline_ext on public.deadline_extensions;
create trigger audit_deadline_ext after insert on public.deadline_extensions
  for each row execute function public.tg_audit_row('actions');
drop trigger if exists audit_action_comments on public.action_comments;
create trigger audit_action_comments after insert on public.action_comments
  for each row execute function public.tg_audit_row('actions');
drop trigger if exists audit_action_categories on public.action_categories;
create trigger audit_action_categories after insert or update or delete on public.action_categories
  for each row execute function public.tg_audit_row('actions');
drop trigger if exists audit_action_sources on public.action_sources;
create trigger audit_action_sources after insert or update or delete on public.action_sources
  for each row execute function public.tg_audit_row('actions');
drop trigger if exists audit_action_settings on public.action_settings;
create trigger audit_action_settings after update on public.action_settings
  for each row execute function public.tg_audit_row('actions');
drop trigger if exists audit_iso_clauses on public.iso_clauses;
create trigger audit_iso_clauses after insert or update or delete on public.iso_clauses
  for each row execute function public.tg_audit_row('actions');
drop trigger if exists audit_qse on public.qse_categories;
create trigger audit_qse after insert or update or delete on public.qse_categories
  for each row execute function public.tg_audit_row('actions');

drop trigger if exists action_settings_updated_at on public.action_settings;
create trigger action_settings_updated_at before update on public.action_settings
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- 5. Workflow engine
-- ---------------------------------------------------------------------
-- Returns NULL when p_user may perform p_event on the action, otherwise the reason it is refused.
-- This single function drives both enforcement (action_transition) and the UI (action_available_events).
create or replace function public.action_event_denial(p_action public.action_plans, p_event text, p_user uuid default auth.uid())
returns text language plpgsql stable security definer set search_path = public as $$
declare
  a public.action_plans := p_action;
  is_qm   boolean := public.has_role('quality_manager', p_user);
  is_dm   boolean := public.is_dept_manager_of(a.department_id, p_user);
  is_rev  boolean := public.has_role('reviewer', p_user);
  is_own  boolean := a.owner_id = p_user;
  is_asg  boolean := public.is_assigned_to_action(a.id, p_user);
  is_crt  boolean := a.created_by = p_user;
begin
  if not public.is_active_user(p_user) then return 'Your account is inactive'; end if;

  case p_event
  when 'submit' then
    if a.status <> 'draft' then return 'Only draft actions can be submitted'; end if;
    if not (is_crt or is_own or is_qm or is_dm) then return 'Only the creator, owner, department manager or quality manager can submit'; end if;
    if length(trim(a.description)) < 10 then return 'Description is required (at least 10 characters)'; end if;
    if length(trim(a.target_outcome)) < 5 then return 'A measurable target outcome is required'; end if;
    if a.due_date < public.app_today() then return 'Due date is in the past'; end if;

  when 'approve', 'return', 'reject' then
    if a.status <> 'submitted' then return 'Only submitted actions can be approved, returned or rejected'; end if;
    if not (is_qm or is_dm) then return 'Only a quality manager or the department manager can decide on approval'; end if;
    if is_crt or is_own then return 'Segregation of duties: you cannot approve an action you created or own'; end if;

  when 'start' then
    if a.status <> 'approved' then return 'Only approved actions can be started'; end if;
    if not (is_own or is_qm) then return 'Only the action owner or quality manager can start the action'; end if;

  when 'block' then
    if a.status not in ('approved','in_progress') then return 'Only approved or in-progress actions can be blocked'; end if;
    if a.is_blocked then return 'Action is already blocked'; end if;
    if not (is_own or is_asg or is_qm or is_dm) then return 'Not permitted'; end if;

  when 'unblock' then
    if not a.is_blocked then return 'Action is not blocked'; end if;
    if not (is_own or is_asg or is_qm or is_dm) then return 'Not permitted'; end if;

  when 'submit_verification' then
    if a.status <> 'in_progress' then return 'Only in-progress actions can be submitted for verification'; end if;
    if a.is_blocked then return 'Unblock the action first'; end if;
    if not (is_own or is_qm) then return 'Only the action owner or quality manager can submit for verification'; end if;
    if length(trim(coalesce(a.implementation_summary, ''))) < 10 then
      return 'Record an implementation summary (what was done and where the evidence is) first';
    end if;

  when 'verify_pass', 'verify_fail' then
    if a.status <> 'pending_verification' then return 'Action is not awaiting verification'; end if;
    if not (is_rev or is_qm) then return 'Only a reviewer or quality manager can verify implementation'; end if;
    if is_own or is_asg or a.verification_submitted_by = p_user then
      return 'Segregation of duties: you cannot verify work you performed or submitted';
    end if;

  when 'effectiveness_pass', 'effectiveness_fail' then
    if a.status <> 'effectiveness_review' then return 'Action is not awaiting effectiveness review'; end if;
    if not (is_rev or is_qm) then return 'Only a reviewer or quality manager can evaluate effectiveness'; end if;
    if is_own or is_asg then return 'Segregation of duties: you cannot evaluate the effectiveness of your own action'; end if;

  when 'close' then
    if a.status <> 'pending_closure' then return 'Action is not ready for closure'; end if;
    if not is_qm then return 'Only a quality manager can authorize closure'; end if;
    if is_own then return 'Segregation of duties: you cannot close an action you own'; end if;

  when 'reopen' then
    if a.status <> 'closed' then return 'Only closed actions can be reopened'; end if;
    if not is_qm then return 'Only a quality manager can reopen an action'; end if;

  else
    return 'Unknown workflow event: ' || p_event;
  end case;
  return null;
end $$;

create or replace function public.action_available_events(p_action_id uuid)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare a public.action_plans; e text; result text[] := '{}';
begin
  select * into a from public.action_plans where id = p_action_id;
  if not found or not public.can_view_action(p_action_id) then return result; end if;
  foreach e in array array['submit','approve','return','reject','start','block','unblock','submit_verification',
    'verify_pass','verify_fail','effectiveness_pass','effectiveness_fail','close','reopen'] loop
    if public.action_event_denial(a, e) is null then result := result || e; end if;
  end loop;
  return result;
end $$;

-- Single entry point for every status change.
create or replace function public.action_transition(
  p_action_id uuid, p_event text, p_comment text default null, p_expected_version int default null)
returns public.action_plans
language plpgsql security definer set search_path = public as $$
declare
  a public.action_plans;
  v_reason text;
  v_from public.action_status;
  v_to public.action_status;
  v_comment text := nullif(trim(coalesce(p_comment, '')), '');
  v_min int := (select min_justification_len from public.action_settings where id);
  v_uid uuid := auth.uid();
  v_today date := public.app_today();
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = 'insufficient_privilege'; end if;

  select * into a from public.action_plans where id = p_action_id for update;
  if not found or not public.can_view_action(p_action_id) then
    raise exception 'Action not found' using errcode = 'no_data_found';
  end if;
  if p_expected_version is not null and a.version <> p_expected_version then
    raise exception 'CONFLICT: this action was changed by someone else (version % vs %). Reload and try again.',
      a.version, p_expected_version using errcode = 'serialization_failure';
  end if;

  v_reason := public.action_event_denial(a, p_event, v_uid);
  if v_reason is not null then
    raise exception '%', v_reason using errcode = 'insufficient_privilege';
  end if;

  -- Comment requirements
  if p_event in ('return','reject','block','verify_pass','verify_fail','effectiveness_pass','effectiveness_fail','reopen')
     and length(coalesce(v_comment, '')) < v_min then
    raise exception 'A comment of at least % characters is required for "%"', v_min, p_event;
  end if;

  perform set_config('app.workflow', 'on', true);
  perform set_config('app.event', p_event, true);
  v_from := a.status;

  case p_event
  when 'submit' then
    a.requires_approval := public.action_requires_approval(a.category_id, a.priority, a.risk_level);
    a.requires_effectiveness := coalesce((select requires_effectiveness from public.action_categories where id = a.category_id), true);
    a.submitted_by := v_uid; a.submitted_at := now();
    if a.requires_approval then
      a.status := 'submitted';
    else
      a.status := 'approved';
      v_comment := coalesce(v_comment || ' — ', '') || 'Approval not required by laboratory policy (category/priority/risk below thresholds).';
    end if;
  when 'approve' then
    a.status := 'approved'; a.approved_by := v_uid; a.approved_at := now();
  when 'return' then
    a.status := 'draft'; a.submitted_by := null; a.submitted_at := null;
  when 'reject' then
    a.status := 'rejected';
  when 'start' then
    a.status := 'in_progress'; a.start_date := coalesce(a.start_date, v_today);
  when 'block' then
    a.is_blocked := true; a.blocked_reason := v_comment;
  when 'unblock' then
    a.is_blocked := false; a.blocked_reason := null;
  when 'submit_verification' then
    a.status := 'pending_verification'; a.completion_date := v_today; a.verification_submitted_by := v_uid;
  when 'verify_pass' then
    a.verification_result := v_comment; a.verified_by := v_uid; a.verified_at := now();
    a.status := case when a.requires_effectiveness then 'effectiveness_review' else 'pending_closure' end;
  when 'verify_fail' then
    a.status := 'in_progress'; a.verification_result := v_comment; a.completion_date := null;
    a.verified_by := v_uid; a.verified_at := now();
  when 'effectiveness_pass' then
    a.status := 'pending_closure'; a.effectiveness_result := v_comment;
    a.effectiveness_by := v_uid; a.effectiveness_at := now();
  when 'effectiveness_fail' then
    a.status := 'in_progress'; a.effectiveness_result := v_comment; a.completion_date := null;
    a.effectiveness_by := v_uid; a.effectiveness_at := now();
  when 'close' then
    a.status := 'closed'; a.closure_comment := v_comment; a.closed_by := v_uid; a.closed_at := now();
  when 'reopen' then
    a.status := 'in_progress'; a.reopened_count := a.reopened_count + 1;
    a.closed_by := null; a.closed_at := null; a.closure_comment := null; a.completion_date := null;
  end case;
  v_to := a.status;

  update public.action_plans set
    status = a.status, requires_approval = a.requires_approval, requires_effectiveness = a.requires_effectiveness,
    submitted_by = a.submitted_by, submitted_at = a.submitted_at,
    approved_by = a.approved_by, approved_at = a.approved_at, start_date = a.start_date,
    is_blocked = a.is_blocked, blocked_reason = a.blocked_reason, completion_date = a.completion_date,
    verification_submitted_by = a.verification_submitted_by,
    verification_result = a.verification_result, verified_by = a.verified_by, verified_at = a.verified_at,
    effectiveness_result = a.effectiveness_result, effectiveness_by = a.effectiveness_by, effectiveness_at = a.effectiveness_at,
    closure_comment = a.closure_comment, closed_by = a.closed_by, closed_at = a.closed_at,
    reopened_count = a.reopened_count
  where id = a.id
  returning * into a;

  insert into public.action_decisions (action_id, event, from_status, to_status, comment, decided_by)
  values (a.id, p_event, v_from, v_to, v_comment, v_uid);

  perform set_config('app.workflow', '', true);
  perform set_config('app.event', '', true);
  return a;
end $$;

-- ---------------------------------------------------------------------
-- 6. Reassignment, deadline extension, staff assignment
-- ---------------------------------------------------------------------
create or replace function public.action_reassign(
  p_action_id uuid, p_new_owner uuid, p_justification text, p_expected_version int default null)
returns public.action_plans
language plpgsql security definer set search_path = public as $$
declare a public.action_plans; v_min int := (select min_justification_len from public.action_settings where id);
begin
  select * into a from public.action_plans where id = p_action_id for update;
  if not found or not public.can_view_action(p_action_id) then raise exception 'Action not found'; end if;
  if p_expected_version is not null and a.version <> p_expected_version then
    raise exception 'CONFLICT: this action was changed by someone else. Reload and try again.' using errcode = 'serialization_failure';
  end if;
  if a.status in ('closed','rejected') then raise exception 'Closed or rejected actions cannot be reassigned'; end if;
  if not (public.has_role('quality_manager') or public.is_dept_manager_of(a.department_id)) then
    raise exception 'Only a quality manager or the department manager can reassign' using errcode = 'insufficient_privilege';
  end if;
  if p_new_owner = a.owner_id then raise exception 'The new owner is the current owner'; end if;
  if not public.is_eligible_owner(p_new_owner) then raise exception 'The selected person does not hold an owner-eligible role'; end if;
  if length(trim(coalesce(p_justification, ''))) < v_min then
    raise exception 'A justification of at least % characters is required', v_min;
  end if;

  perform set_config('app.workflow', 'on', true);
  perform set_config('app.event', 'reassign', true);
  update public.action_plans set owner_id = p_new_owner where id = a.id returning * into a;
  insert into public.action_decisions (action_id, event, from_status, to_status, comment, details, decided_by)
  values (a.id, 'reassign', a.status, a.status, trim(p_justification),
          jsonb_build_object('new_owner', p_new_owner), auth.uid());
  perform set_config('app.workflow', '', true);
  perform set_config('app.event', '', true);
  return a;
end $$;

create or replace function public.action_extend_deadline(
  p_action_id uuid, p_new_due date, p_justification text, p_expected_version int default null)
returns public.action_plans
language plpgsql security definer set search_path = public as $$
declare a public.action_plans; v_old date; v_min int := (select min_justification_len from public.action_settings where id);
begin
  select * into a from public.action_plans where id = p_action_id for update;
  if not found or not public.can_view_action(p_action_id) then raise exception 'Action not found'; end if;
  if p_expected_version is not null and a.version <> p_expected_version then
    raise exception 'CONFLICT: this action was changed by someone else. Reload and try again.' using errcode = 'serialization_failure';
  end if;
  if a.status in ('draft','closed','rejected','pending_closure') then
    raise exception 'Deadline extension applies to submitted or active actions (edit the due date directly while in draft)';
  end if;
  if not (public.has_role('quality_manager') or public.is_dept_manager_of(a.department_id)) then
    raise exception 'Only a quality manager or the department manager can extend a deadline' using errcode = 'insufficient_privilege';
  end if;
  if a.owner_id = auth.uid() then
    raise exception 'Segregation of duties: you cannot extend the deadline of an action you own' using errcode = 'insufficient_privilege';
  end if;
  if p_new_due is null or p_new_due = a.due_date then raise exception 'Enter a new due date'; end if;
  if a.start_date is not null and p_new_due < a.start_date then raise exception 'New due date is before the start date'; end if;
  if length(trim(coalesce(p_justification, ''))) < v_min then
    raise exception 'A justification of at least % characters is required', v_min;
  end if;

  v_old := a.due_date;
  perform set_config('app.workflow', 'on', true);
  perform set_config('app.event', 'extend_deadline', true);
  update public.action_plans set due_date = p_new_due where id = a.id returning * into a;
  insert into public.deadline_extensions (action_id, old_due_date, new_due_date, justification, approved_by)
  values (a.id, v_old, p_new_due, trim(p_justification), auth.uid());
  insert into public.action_decisions (action_id, event, from_status, to_status, comment, details, decided_by)
  values (a.id, 'extend_deadline', a.status, a.status, trim(p_justification),
          jsonb_build_object('old_due_date', v_old, 'new_due_date', p_new_due), auth.uid());
  perform set_config('app.workflow', '', true);
  perform set_config('app.event', '', true);
  return a;
end $$;

-- Replace the set of assigned staff for an action.
create or replace function public.action_set_assignees(p_action_id uuid, p_user_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare a public.action_plans; v_bad uuid;
begin
  select * into a from public.action_plans where id = p_action_id for update;
  if not found or not public.can_view_action(p_action_id) then raise exception 'Action not found'; end if;
  if a.status in ('closed','rejected') then raise exception 'Closed or rejected actions cannot be changed'; end if;
  if not (public.has_role('quality_manager') or public.is_dept_manager_of(a.department_id) or a.owner_id = auth.uid()
          or (a.status = 'draft' and a.created_by = auth.uid())) then
    raise exception 'Only the owner, department manager or quality manager can assign staff' using errcode = 'insufficient_privilege';
  end if;
  select u into v_bad from unnest(coalesce(p_user_ids, '{}')) u
  where not public.is_active_user(u) limit 1;
  if v_bad is not null then raise exception 'Cannot assign an inactive or unknown user'; end if;

  perform set_config('app.event', 'assign_staff', true);
  delete from public.action_assignments where action_id = a.id and not (user_id = any(coalesce(p_user_ids, '{}')));
  insert into public.action_assignments (action_id, user_id, assigned_by)
  select a.id, u, auth.uid() from unnest(coalesce(p_user_ids, '{}')) u
  on conflict (action_id, user_id) do nothing;
  perform set_config('app.event', '', true);
end $$;

-- Replace the ISO clauses linked to an action (draft: creator/owner; later: QM / dept manager)
create or replace function public.action_set_iso_clauses(p_action_id uuid, p_clause_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare a public.action_plans;
begin
  select * into a from public.action_plans where id = p_action_id for update;
  if not found or not public.can_view_action(p_action_id) then raise exception 'Action not found'; end if;
  if not public.can_edit_action_row(a.status, a.department_id, a.created_by, a.owner_id)
     or (a.status <> 'draft' and not (public.has_role('quality_manager') or public.is_dept_manager_of(a.department_id))) then
    raise exception 'You cannot change the ISO clauses of this action' using errcode = 'insufficient_privilege';
  end if;
  delete from public.action_iso_clauses where action_id = a.id and not (clause_id = any(coalesce(p_clause_ids, '{}')));
  insert into public.action_iso_clauses (action_id, clause_id)
  select a.id, c from unnest(coalesce(p_clause_ids, '{}')) c on conflict do nothing;
end $$;

-- ---------------------------------------------------------------------
-- 7. Register view (RLS of the underlying tables applies: security_invoker)
-- ---------------------------------------------------------------------
create or replace view public.action_register_v with (security_invoker = true) as
select
  a.*,
  c.code  as category_code,  c.name as category_name,
  s.name  as source_name,
  q.code  as qse_code,       q.name as qse_name,
  d.code  as department_code, d.name as department_name,
  o.full_name as owner_name,
  cr.full_name as created_by_name,
  cl.full_name as closed_by_name,
  (select string_agg(ic.clause, ', ' order by ic.sort_order)
     from public.action_iso_clauses x join public.iso_clauses ic on ic.id = x.clause_id
    where x.action_id = a.id) as iso_clauses,
  (select string_agg(p.full_name, ', ' order by p.full_name)
     from public.action_assignments aa join public.profiles p on p.id = aa.user_id
    where aa.action_id = a.id) as assigned_staff,
  (a.status in ('draft','submitted','approved','in_progress') and a.due_date < public.app_today()) as is_overdue,
  case when a.status in ('draft','submitted','approved','in_progress') and a.due_date < public.app_today()
       then public.app_today() - a.due_date else 0 end as days_overdue,
  (a.status in ('draft','submitted','approved','in_progress')
     and a.due_date between public.app_today()
     and public.app_today() + (select due_soon_days from public.action_settings where id)) as is_due_soon
from public.action_plans a
join public.action_categories c on c.id = a.category_id
left join public.action_sources s on s.id = a.source_id
left join public.qse_categories q on q.id = a.qse_id
join public.departments d on d.id = a.department_id
join public.profiles o on o.id = a.owner_id
join public.profiles cr on cr.id = a.created_by
left join public.profiles cl on cl.id = a.closed_by;

-- ---------------------------------------------------------------------
-- 8. RLS and privileges
-- ---------------------------------------------------------------------
alter table public.qse_categories         enable row level security;
alter table public.iso_clauses            enable row level security;
alter table public.action_categories      enable row level security;
alter table public.action_sources         enable row level security;
alter table public.action_settings        enable row level security;
alter table public.action_number_counters enable row level security;
alter table public.action_plans           enable row level security;
alter table public.action_iso_clauses     enable row level security;
alter table public.action_assignments     enable row level security;
alter table public.action_decisions       enable row level security;
alter table public.deadline_extensions    enable row level security;
alter table public.action_comments        enable row level security;

-- Lookups: everyone signed in reads; quality managers and administrators maintain.
do $$
declare t text;
begin
  foreach t in array array['qse_categories','iso_clauses','action_categories','action_sources'] loop
    execute format('drop policy if exists %1$s_select on public.%1$s', t);
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (public.is_active_user())', t);
    execute format('drop policy if exists %1$s_write on public.%1$s', t);
    execute format($p$create policy %1$s_write on public.%1$s for insert to authenticated
                   with check (public.has_any_role(array['administrator','quality_manager']::public.app_role[]))$p$, t);
    execute format('drop policy if exists %1$s_update on public.%1$s', t);
    execute format($p$create policy %1$s_update on public.%1$s for update to authenticated
                   using (public.has_any_role(array['administrator','quality_manager']::public.app_role[]))
                   with check (public.has_any_role(array['administrator','quality_manager']::public.app_role[]))$p$, t);
  end loop;
end $$;

-- Settings encode laboratory policy: quality manager only (administrators can view).
drop policy if exists action_settings_select on public.action_settings;
create policy action_settings_select on public.action_settings for select to authenticated using (public.is_active_user());
drop policy if exists action_settings_update on public.action_settings;
create policy action_settings_update on public.action_settings for update to authenticated
  using (public.has_role('quality_manager')) with check (public.has_role('quality_manager'));

drop policy if exists action_plans_select on public.action_plans;
create policy action_plans_select on public.action_plans for select to authenticated
  using (public.can_view_action_row(id, department_id, created_by, owner_id));
drop policy if exists action_plans_insert on public.action_plans;
create policy action_plans_insert on public.action_plans for insert to authenticated
  with check (public.can_create_action(department_id));
drop policy if exists action_plans_update on public.action_plans;
create policy action_plans_update on public.action_plans for update to authenticated
  using (public.can_edit_action_row(status, department_id, created_by, owner_id))
  with check (public.can_edit_action_row(status, department_id, created_by, owner_id)
              or coalesce(current_setting('app.workflow', true), '') = 'on');

do $$
declare t text;
begin
  foreach t in array array['action_iso_clauses','action_assignments','action_decisions','deadline_extensions','action_comments'] loop
    execute format('drop policy if exists %1$s_select on public.%1$s', t);
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (public.can_view_action(action_id))', t);
  end loop;
end $$;

drop policy if exists action_comments_insert on public.action_comments;
create policy action_comments_insert on public.action_comments for insert to authenticated
  with check (author_id = auth.uid() and public.can_view_action(action_id)
              and (select status from public.action_plans where id = action_id) not in ('closed','rejected'));

-- Audit rows for actions are visible to anyone who can view the action.
drop policy if exists audit_select_actions on public.audit_events;
create policy audit_select_actions on public.audit_events for select to authenticated
  using (action_id is not null and public.can_view_action(action_id));

revoke all on public.qse_categories, public.iso_clauses, public.action_categories, public.action_sources,
  public.action_settings, public.action_number_counters, public.action_plans, public.action_iso_clauses,
  public.action_assignments, public.action_decisions, public.deadline_extensions, public.action_comments,
  public.action_register_v from anon;

grant select, insert, update on public.qse_categories, public.iso_clauses, public.action_categories, public.action_sources to authenticated;
grant select, update on public.action_settings to authenticated;
grant select, insert, update on public.action_plans to authenticated;
grant select on public.action_iso_clauses, public.action_assignments, public.action_decisions, public.deadline_extensions to authenticated;
grant select, insert on public.action_comments to authenticated;
grant select on public.action_register_v to authenticated;
revoke all on public.action_number_counters from authenticated;

revoke execute on function public.action_transition(uuid, text, text, int) from public, anon;
revoke execute on function public.action_reassign(uuid, uuid, text, int) from public, anon;
revoke execute on function public.action_extend_deadline(uuid, date, text, int) from public, anon;
revoke execute on function public.action_set_assignees(uuid, uuid[]) from public, anon;
revoke execute on function public.action_set_iso_clauses(uuid, uuid[]) from public, anon;
revoke execute on function public.action_event_denial(public.action_plans, text, uuid) from public, anon, authenticated;
grant execute on function public.action_transition(uuid, text, text, int),
  public.action_reassign(uuid, uuid, text, int), public.action_extend_deadline(uuid, date, text, int),
  public.action_set_assignees(uuid, uuid[]), public.action_set_iso_clauses(uuid, uuid[]),
  public.action_available_events(uuid), public.app_today(), public.can_view_action(uuid, uuid)
  to authenticated;
