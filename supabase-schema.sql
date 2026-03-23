-- Supabase schema for client-side sync
-- Run in Supabase SQL editor.

create table if not exists public.user_storage (
  user_id uuid not null references auth.users on delete cascade,
  key text not null,
  value text,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.user_storage enable row level security;

create policy "user_storage_select_own"
  on public.user_storage
  for select
  using (auth.uid() = user_id);

create policy "user_storage_insert_own"
  on public.user_storage
  for insert
  with check (auth.uid() = user_id);

create policy "user_storage_update_own"
  on public.user_storage
  for update
  using (auth.uid() = user_id);

create policy "user_storage_delete_own"
  on public.user_storage
  for delete
  using (auth.uid() = user_id);

create table if not exists public.community_users (
  user_id uuid not null references auth.users on delete cascade,
  name text,
  avatar_url text,
  joined_at date,
  total_hours numeric,
  level int,
  level_progress numeric,
  rank_name text,
  achievements int,
  status jsonb,
  live_status jsonb,
  entries jsonb,
  events jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id)
);

alter table public.community_users enable row level security;

create policy "community_users_select_public"
  on public.community_users
  for select
  using (true);

create policy "community_users_insert_own"
  on public.community_users
  for insert
  with check (auth.uid() = user_id);

create policy "community_users_update_own"
  on public.community_users
  for update
  using (auth.uid() = user_id);

create policy "community_users_delete_own"
  on public.community_users
  for delete
  using (auth.uid() = user_id);

create table if not exists public.planner_public (
  id text primary key,
  title text not null,
  content text not null,
  start_date date,
  end_date date,
  pinned boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users on delete set null default auth.uid(),
  author_name text,
  author_avatar text
);

alter table public.planner_public enable row level security;

create policy "planner_public_select_all"
  on public.planner_public
  for select
  using (true);

create policy "planner_public_insert_auth"
  on public.planner_public
  for insert
  with check (auth.uid() = created_by);

create policy "planner_public_update_own"
  on public.planner_public
  for update
  using (auth.uid() = created_by);

create policy "planner_public_delete_own"
  on public.planner_public
  for delete
  using (auth.uid() = created_by);
