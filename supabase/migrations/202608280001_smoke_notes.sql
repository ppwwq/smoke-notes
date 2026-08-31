create extension if not exists pgcrypto;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.notebooks (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  rank double precision not null,
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.notes (
  id uuid primary key,
  notebook_id uuid not null references public.notebooks(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '' check (char_length(body) <= 100000),
  rank double precision not null,
  version integer not null default 1 check (version > 0),
  conflict_of uuid references public.notes(id) on delete set null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.todos (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 500),
  completed boolean not null default false,
  rank double precision not null,
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.pairing_codes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  code_hash text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.pairing_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  success boolean not null default false,
  attempted_at timestamptz not null default now()
);

create table public.applied_operations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  result jsonb not null,
  applied_at timestamptz not null default now()
);

create index notebooks_workspace_rank_idx on public.notebooks(workspace_id, rank);
create index notes_notebook_rank_idx on public.notes(notebook_id, rank);
create index todos_workspace_rank_idx on public.todos(workspace_id, rank);
create index pairing_codes_expiry_idx on public.pairing_codes(expires_at) where redeemed_at is null;
create index pairing_attempts_user_time_idx on public.pairing_attempts(user_id, attempted_at desc);

create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace and user_id = auth.uid()
  );
$$;

create or replace function public.bootstrap_workspace()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  workspace uuid;
begin
  if current_user_id is null then raise exception 'authentication_required'; end if;
  select workspace_id into workspace
  from public.workspace_members
  where user_id = current_user_id
  order by created_at
  limit 1;
  if workspace is not null then return workspace; end if;

  insert into public.workspaces default values returning id into workspace;
  insert into public.workspace_members(workspace_id, user_id, role)
  values (workspace, current_user_id, 'owner');
  return workspace;
end;
$$;

create or replace function public.redeem_pairing_code(p_code_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  selected_code public.pairing_codes%rowtype;
  attempt_id bigint;
begin
  if current_user_id is null then raise exception 'authentication_required'; end if;
  if (
    select count(*) from public.pairing_attempts
    where user_id = current_user_id and attempted_at > now() - interval '10 minutes'
  ) >= 10 then
    raise exception 'rate_limited';
  end if;

  insert into public.pairing_attempts(user_id) values (current_user_id) returning id into attempt_id;
  select * into selected_code
  from public.pairing_codes
  where code_hash = p_code_hash and redeemed_at is null and expires_at > now()
  for update;
  if selected_code.id is null then raise exception 'invalid_or_expired_code'; end if;

  update public.pairing_codes set redeemed_at = now() where id = selected_code.id;
  insert into public.workspace_members(workspace_id, user_id, role)
  values (selected_code.workspace_id, current_user_id, 'member')
  on conflict (workspace_id, user_id) do nothing;
  update public.pairing_attempts set success = true where id = attempt_id;
  return selected_code.workspace_id;
end;
$$;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.notebooks enable row level security;
alter table public.notes enable row level security;
alter table public.todos enable row level security;
alter table public.pairing_codes enable row level security;
alter table public.pairing_attempts enable row level security;
alter table public.applied_operations enable row level security;

create policy workspaces_member_select on public.workspaces for select to authenticated
using (public.is_workspace_member(id));
create policy members_member_select on public.workspace_members for select to authenticated
using (public.is_workspace_member(workspace_id));
create policy notebooks_member_all on public.notebooks for all to authenticated
using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy notes_member_all on public.notes for all to authenticated
using (exists (
  select 1 from public.notebooks n where n.id = notebook_id and public.is_workspace_member(n.workspace_id)
)) with check (exists (
  select 1 from public.notebooks n where n.id = notebook_id and public.is_workspace_member(n.workspace_id)
));
create policy todos_member_all on public.todos for all to authenticated
using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy pairing_owner_all on public.pairing_codes for all to authenticated
using (public.is_workspace_member(workspace_id)) with check (
  public.is_workspace_member(workspace_id) and created_by = auth.uid()
);
create policy operations_owner_all on public.applied_operations for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.pairing_attempts from anon, authenticated;
grant select, insert, update, delete on public.notebooks, public.notes, public.todos to authenticated;
grant select on public.workspaces, public.workspace_members to authenticated;
grant select, insert, update on public.pairing_codes to authenticated;
grant select, insert on public.applied_operations to authenticated;
grant execute on function public.bootstrap_workspace() to authenticated;
grant execute on function public.redeem_pairing_code(text) to authenticated;
grant execute on function public.is_workspace_member(uuid) to authenticated;

alter publication supabase_realtime add table public.notebooks, public.notes, public.todos;
