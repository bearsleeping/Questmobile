create table if not exists public.workflow_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.workflow_profiles enable row level security;

create policy "select own profile"
on public.workflow_profiles
for select
to authenticated
using (auth.uid() = user_id);

create policy "upsert own profile"
on public.workflow_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "update own profile"
on public.workflow_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.workflow_leaderboard (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default 'Uzytkownik',
  level int not null default 1,
  rank text not null default 'Bronze',
  rank_level text not null default 'Bronze I',
  total_exp int not null default 0,
  total_hours numeric(10,2) not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.workflow_leaderboard enable row level security;

create policy "select leaderboard"
on public.workflow_leaderboard
for select
to authenticated
using (true);

create policy "insert own leaderboard row"
on public.workflow_leaderboard
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "update own leaderboard row"
on public.workflow_leaderboard
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.workflow_planner_notes (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null default 'Uzytkownik',
  title text not null,
  content text not null,
  is_pinned boolean not null default false,
  start_date date not null default current_date,
  end_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.workflow_planner_notes
  add column if not exists start_date date not null default current_date;

alter table if exists public.workflow_planner_notes
  add column if not exists end_date date not null default current_date;

alter table public.workflow_planner_notes enable row level security;

create policy "select planner notes"
on public.workflow_planner_notes
for select
to authenticated
using (true);

create policy "insert own planner notes"
on public.workflow_planner_notes
for insert
to authenticated
with check (auth.uid() = author_user_id);

create policy "update own planner notes"
on public.workflow_planner_notes
for update
to authenticated
using (auth.uid() = author_user_id)
with check (auth.uid() = author_user_id);

create policy "delete own planner notes"
on public.workflow_planner_notes
for delete
to authenticated
using (auth.uid() = author_user_id);

create table if not exists public.workflow_teams (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  code text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.workflow_team_members (
  team_id uuid not null references public.workflow_teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table if not exists public.workflow_team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.workflow_teams(id) on delete cascade,
  team_name text not null,
  inviter_user_id uuid not null references auth.users(id) on delete cascade,
  invitee_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now()
);

create index if not exists workflow_team_members_user_id_idx
  on public.workflow_team_members(user_id);

create index if not exists workflow_team_invites_invitee_user_status_idx
  on public.workflow_team_invites(invitee_user_id, status);

alter table public.workflow_teams enable row level security;
alter table public.workflow_team_members enable row level security;
alter table public.workflow_team_invites enable row level security;

create policy "select teams"
on public.workflow_teams
for select
to authenticated
using (true);

create policy "insert own teams"
on public.workflow_teams
for insert
to authenticated
with check (auth.uid() = owner_user_id);

create policy "update own teams"
on public.workflow_teams
for update
to authenticated
using (auth.uid() = owner_user_id)
with check (auth.uid() = owner_user_id);

create policy "delete own teams"
on public.workflow_teams
for delete
to authenticated
using (auth.uid() = owner_user_id);

create policy "select team members"
on public.workflow_team_members
for select
to authenticated
using (true);

create policy "insert own membership"
on public.workflow_team_members
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "delete own membership or owner"
on public.workflow_team_members
for delete
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.workflow_teams t
    where t.id = team_id and t.owner_user_id = auth.uid()
  )
);

create policy "select own invites"
on public.workflow_team_invites
for select
to authenticated
using (
  auth.uid() = inviter_user_id
  or auth.uid() = invitee_user_id
);

create policy "insert invites by team member"
on public.workflow_team_invites
for insert
to authenticated
with check (
  auth.uid() = inviter_user_id
  and exists (
    select 1
    from public.workflow_team_members m
    where m.team_id = workflow_team_invites.team_id
      and m.user_id = auth.uid()
  )
);

create policy "update invite status by inviter or invitee"
on public.workflow_team_invites
for update
to authenticated
using (
  auth.uid() = inviter_user_id
  or auth.uid() = invitee_user_id
)
with check (
  auth.uid() = inviter_user_id
  or auth.uid() = invitee_user_id
);


-- migration: team invites by user_id (for existing projects)
alter table if exists public.workflow_team_invites
  add column if not exists invitee_user_id uuid references auth.users(id) on delete cascade;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workflow_team_invites'
      and column_name = 'invitee_email'
  ) then
    execute 'alter table public.workflow_team_invites alter column invitee_email drop not null';
  end if;
end $$;

create index if not exists workflow_team_invites_invitee_user_status_idx
  on public.workflow_team_invites(invitee_user_id, status);

drop policy if exists "select own invites" on public.workflow_team_invites;
drop policy if exists "insert invites by team member" on public.workflow_team_invites;
drop policy if exists "update invite status by inviter or invitee" on public.workflow_team_invites;

create policy "select own invites"
on public.workflow_team_invites
for select
to authenticated
using (
  auth.uid() = inviter_user_id
  or auth.uid() = invitee_user_id
);

create policy "insert invites by team member"
on public.workflow_team_invites
for insert
to authenticated
with check (
  auth.uid() = inviter_user_id
  and invitee_user_id is not null
  and exists (
    select 1
    from public.workflow_team_members m
    where m.team_id = workflow_team_invites.team_id
      and m.user_id = auth.uid()
  )
);

create policy "update invite status by inviter or invitee"
on public.workflow_team_invites
for update
to authenticated
using (
  auth.uid() = inviter_user_id
  or auth.uid() = invitee_user_id
)
with check (
  auth.uid() = inviter_user_id
  or auth.uid() = invitee_user_id
);

-- Fix: Auto-confirm new users so they can login immediately without email verification
create or replace function public.handle_new_user()
returns trigger as $$
begin
  update auth.users set email_confirmed_at = now() where id = new.id;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user();

-- Fix: Confirm existing unconfirmed users
update auth.users set email_confirmed_at = now() where email_confirmed_at is null;
