-- AI Agent skills foundation tables.
-- Apply this to Supabase before using /api/ai/* and /api/tasks/[id]/agent-presets.

create table if not exists ai_model_configs (
  id varchar(36) primary key default gen_random_uuid(),
  name varchar(100) not null,
  provider varchar(20) not null default 'builtin',
  model varchar(100) not null,
  temperature integer not null default 5,
  max_tokens integer not null default 2400,
  supports_vision boolean not null default false,
  custom_api_url text,
  custom_api_key_encrypted text,
  is_active boolean not null default false,
  created_by varchar(36) references platform_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

create index if not exists ai_model_configs_active_idx on ai_model_configs(is_active);

create table if not exists agent_skill_templates (
  id varchar(36) primary key default gen_random_uuid(),
  skill_key varchar(50) not null unique,
  name varchar(100) not null,
  description text,
  is_enabled boolean not null default true,
  active_version_id varchar(36),
  model_config_id varchar(36) references ai_model_configs(id) on delete set null,
  created_by varchar(36) references platform_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

create index if not exists agent_skill_templates_key_idx on agent_skill_templates(skill_key);

create table if not exists agent_skill_versions (
  id varchar(36) primary key default gen_random_uuid(),
  template_id varchar(36) not null references agent_skill_templates(id) on delete cascade,
  version integer not null,
  system_prompt text not null,
  user_prompt_template text not null,
  output_schema jsonb not null default '{}',
  notes text,
  created_by varchar(36) references platform_users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(template_id, version)
);

create index if not exists agent_skill_versions_template_id_idx on agent_skill_versions(template_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'agent_skill_templates_active_version_id_fkey'
  ) then
    alter table agent_skill_templates
      add constraint agent_skill_templates_active_version_id_fkey
      foreign key (active_version_id) references agent_skill_versions(id) on delete set null;
  end if;
end $$;

create table if not exists agent_skill_audit_logs (
  id varchar(36) primary key default gen_random_uuid(),
  skill_key varchar(50) not null,
  template_id varchar(36) references agent_skill_templates(id) on delete set null,
  version_id varchar(36) references agent_skill_versions(id) on delete set null,
  action varchar(50) not null,
  actor_user_id varchar(36) references platform_users(id) on delete set null,
  task_id varchar(36) references experience_tasks(id) on delete set null,
  request_snapshot jsonb default '{}',
  response_snapshot jsonb default '{}',
  status varchar(20) not null default 'success',
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists agent_skill_audit_logs_skill_key_idx on agent_skill_audit_logs(skill_key);
create index if not exists agent_skill_audit_logs_task_id_idx on agent_skill_audit_logs(task_id);

alter table ai_model_configs enable row level security;
alter table agent_skill_templates enable row level security;
alter table agent_skill_versions enable row level security;
alter table agent_skill_audit_logs enable row level security;

drop policy if exists ai_model_configs_public_select on ai_model_configs;
create policy ai_model_configs_public_select on ai_model_configs for select using (true);
drop policy if exists ai_model_configs_public_insert on ai_model_configs;
create policy ai_model_configs_public_insert on ai_model_configs for insert with check (true);
drop policy if exists ai_model_configs_public_update on ai_model_configs;
create policy ai_model_configs_public_update on ai_model_configs for update using (true);
drop policy if exists ai_model_configs_public_delete on ai_model_configs;
create policy ai_model_configs_public_delete on ai_model_configs for delete using (true);

drop policy if exists agent_skill_templates_public_select on agent_skill_templates;
create policy agent_skill_templates_public_select on agent_skill_templates for select using (true);
drop policy if exists agent_skill_templates_public_insert on agent_skill_templates;
create policy agent_skill_templates_public_insert on agent_skill_templates for insert with check (true);
drop policy if exists agent_skill_templates_public_update on agent_skill_templates;
create policy agent_skill_templates_public_update on agent_skill_templates for update using (true);
drop policy if exists agent_skill_templates_public_delete on agent_skill_templates;
create policy agent_skill_templates_public_delete on agent_skill_templates for delete using (true);

drop policy if exists agent_skill_versions_public_select on agent_skill_versions;
create policy agent_skill_versions_public_select on agent_skill_versions for select using (true);
drop policy if exists agent_skill_versions_public_insert on agent_skill_versions;
create policy agent_skill_versions_public_insert on agent_skill_versions for insert with check (true);
drop policy if exists agent_skill_versions_public_update on agent_skill_versions;
create policy agent_skill_versions_public_update on agent_skill_versions for update using (true);
drop policy if exists agent_skill_versions_public_delete on agent_skill_versions;
create policy agent_skill_versions_public_delete on agent_skill_versions for delete using (true);

drop policy if exists agent_skill_audit_logs_public_select on agent_skill_audit_logs;
create policy agent_skill_audit_logs_public_select on agent_skill_audit_logs for select using (true);
drop policy if exists agent_skill_audit_logs_public_insert on agent_skill_audit_logs;
create policy agent_skill_audit_logs_public_insert on agent_skill_audit_logs for insert with check (true);
drop policy if exists agent_skill_audit_logs_public_update on agent_skill_audit_logs;
create policy agent_skill_audit_logs_public_update on agent_skill_audit_logs for update using (true);
drop policy if exists agent_skill_audit_logs_public_delete on agent_skill_audit_logs;
create policy agent_skill_audit_logs_public_delete on agent_skill_audit_logs for delete using (true);
