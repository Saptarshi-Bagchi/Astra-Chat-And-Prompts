create table public.threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index messages_thread_idx on public.messages (thread_id, created_at);

create table public.prompt_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  title text not null,
  body text not null,
  category text not null default 'general',
  created_at timestamptz not null default now()
);

create table public.app_settings (
  id boolean primary key default true check (id),
  owner_email text,
  created_at timestamptz not null default now()
);
insert into public.app_settings (id) values (true);

alter table public.threads enable row level security;
alter table public.messages enable row level security;
alter table public.prompt_templates enable row level security;
alter table public.app_settings enable row level security;

grant select, insert, update, delete on public.threads to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant select, insert, update, delete on public.prompt_templates to authenticated;
grant select, update on public.app_settings to authenticated;
grant all on public.threads to service_role;
grant all on public.messages to service_role;
grant all on public.prompt_templates to service_role;
grant all on public.app_settings to service_role;

create policy "Users manage own threads"
  on public.threads for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users manage own messages"
  on public.messages for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Authenticated users read templates"
  on public.prompt_templates for select to authenticated
  using (user_id is null or user_id = auth.uid());

create policy "Users insert own templates"
  on public.prompt_templates for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users update own templates"
  on public.prompt_templates for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users delete own templates"
  on public.prompt_templates for delete to authenticated
  using (user_id = auth.uid());

create policy "Authenticated users read settings"
  on public.app_settings for select to authenticated
  using (true);

create policy "Owner claims settings"
  on public.app_settings for update to authenticated
  using (owner_email is null or owner_email = (select email from auth.users where id = auth.uid()));
