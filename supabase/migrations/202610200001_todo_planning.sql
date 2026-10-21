-- Additive planning metadata; legacy rows and all historical receipts remain.
-- Apply before the planning-aware apply-mutation edge function and clients.
begin;

create or replace function public.valid_todo_planning(value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  revision jsonb;
  stamp jsonb;
  event jsonb;
  day jsonb;
  date_text text;
begin
  if value is null then return true; end if;
  if jsonb_typeof(value) <> 'object' or value -> 'version' is distinct from '1'::jsonb
    or coalesce(value ->> 'kind', '') not in ('task', 'series', 'occurrence', 'settings')
    or length(value::text) > 1000000 then return false; end if;
  if value ? 'status' and coalesce(value ->> 'status', '') not in ('open', 'completed', 'skipped') then return false; end if;
  if value ? 'notes' and (jsonb_typeof(value -> 'notes') <> 'string' or length(value ->> 'notes') > 10000) then return false; end if;
  if value ? 'generated' and jsonb_typeof(value -> 'generated') <> 'boolean' then return false; end if;
  if value ? 'date' then
    date_text := value ->> 'date';
    if date_text is null or date_text !~ '^\d{4}-\d{2}-\d{2}$'
      or to_char(date_text::date, 'YYYY-MM-DD') <> date_text then return false; end if;
  end if;
  if value ? 'completedAt' and value -> 'completedAt' <> 'null'::jsonb then
    if jsonb_typeof(value -> 'completedAt') <> 'string' then return false; end if;
    perform (value ->> 'completedAt')::timestamptz;
  end if;
  if value ->> 'kind' = 'occurrence' then
    if not (value ? 'seriesId' and value ? 'date' and value ? 'status')
      or jsonb_typeof(value -> 'seriesId') is distinct from 'string'
      or coalesce(value ->> 'seriesId', '') = '' then return false; end if;
    perform (value ->> 'seriesId')::uuid;
  end if;
  if value ->> 'kind' = 'settings' then
    if jsonb_typeof(value -> 'settings') is distinct from 'object'
      or value -> 'settings' ->> 'timeZone' is distinct from 'Asia/Hong_Kong'
      or not coalesce(value -> 'settings' -> 'dayBoundaryHour' in ('0'::jsonb, '4'::jsonb), false) then return false; end if;
  end if;
  if value ->> 'kind' = 'series' then
    if jsonb_typeof(value -> 'revisions') is distinct from 'array'
      or jsonb_array_length(value -> 'revisions') = 0 then return false; end if;
    for revision in select * from jsonb_array_elements(value -> 'revisions') loop
      if jsonb_typeof(revision) <> 'object'
        or coalesce(revision ->> 'id', '') = ''
        or jsonb_typeof(revision -> 'text') is distinct from 'string'
        or length(revision ->> 'text') not between 1 and 500
        or jsonb_typeof(revision -> 'notes') is distinct from 'string'
        or length(revision ->> 'notes') > 10000
        or jsonb_typeof(revision -> 'paused') is distinct from 'boolean'
        or jsonb_typeof(revision -> 'stopped') is distinct from 'boolean'
        or jsonb_typeof(revision -> 'changedAt') is distinct from 'string'
        or jsonb_typeof(revision -> 'repeat') is distinct from 'object'
        or coalesce(revision -> 'repeat' ->> 'kind', '') not in ('daily', 'weekdays', 'weekly') then return false; end if;
      perform (revision ->> 'changedAt')::timestamptz;
      date_text := revision ->> 'effectiveFrom';
      if date_text is null or date_text !~ '^\d{4}-\d{2}-\d{2}$'
        or to_char(date_text::date, 'YYYY-MM-DD') <> date_text then return false; end if;
      if revision -> 'repeat' ->> 'kind' = 'weekly' then
        if jsonb_typeof(revision -> 'repeat' -> 'weekdays') is distinct from 'array'
          or jsonb_array_length(revision -> 'repeat' -> 'weekdays') not between 1 and 7 then return false; end if;
        for day in select * from jsonb_array_elements(revision -> 'repeat' -> 'weekdays') loop
          if day not in ('0'::jsonb, '1'::jsonb, '2'::jsonb, '3'::jsonb, '4'::jsonb, '5'::jsonb, '6'::jsonb) then return false; end if;
        end loop;
      end if;
    end loop;
  end if;
  if value ? 'clocks' then
    if jsonb_typeof(value -> 'clocks') <> 'object' then return false; end if;
    for stamp in select item from jsonb_each(value -> 'clocks') as entries(key, item) loop
      if jsonb_typeof(stamp) <> 'object'
        or jsonb_typeof(stamp -> 'at') is distinct from 'string'
        or coalesce(stamp ->> 'id', '') = '' then return false; end if;
      perform (stamp ->> 'at')::timestamptz;
    end loop;
  end if;
  if value ? 'events' then
    if jsonb_typeof(value -> 'events') <> 'array' then return false; end if;
    for event in select * from jsonb_array_elements(value -> 'events') loop
      if jsonb_typeof(event) <> 'object'
        or coalesce(event ->> 'id', '') = ''
        or jsonb_typeof(event -> 'at') is distinct from 'string'
        or coalesce(event ->> 'status', '') not in ('open', 'completed', 'skipped') then return false; end if;
      perform (event ->> 'at')::timestamptz;
      if event ? 'completedAt' and event -> 'completedAt' <> 'null'::jsonb then
        perform (event ->> 'completedAt')::timestamptz;
      end if;
    end loop;
  end if;
  return true;
exception when others then
  return false;
end;
$$;

alter table public.todos add column planning jsonb;
alter table public.todos add constraint todos_planning_valid check (public.valid_todo_planning(planning));
-- Include tombstones: deleting an instance must not allow a second identity for
-- the same series/date, and restoring it must retain its original history.
create unique index todos_series_date_unique on public.todos
  (workspace_id, (planning ->> 'seriesId'), (planning ->> 'date'))
  where planning ->> 'kind' = 'occurrence';
create unique index todos_planning_settings_unique on public.todos (workspace_id)
  where planning ->> 'kind' = 'settings';

create or replace function public.workspace_sync_capabilities()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  return jsonb_build_object('todoPlanning', 1);
end;
$$;
revoke execute on function public.workspace_sync_capabilities() from public, anon;
grant execute on function public.workspace_sync_capabilities() to authenticated;

create or replace function public.apply_workspace_mutation(
  p_operation_id uuid,
  p_entity text,
  p_entity_id uuid,
  p_base_version integer,
  p_row jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_table text;
  target_workspace uuid;
  original_workspace uuid;
  existing_row jsonb;
  saved_row jsonb;
  receipt public.applied_operations%rowtype;
  mutation_result jsonb;
  new_version integer;
begin
  if current_user_id is null then raise exception 'authentication_required'; end if;
  if p_operation_id is null or p_entity_id is null
    or p_entity is null or p_entity not in ('notebook', 'note', 'todo')
    or p_row is null or jsonb_typeof(p_row) <> 'object'
    or (p_row ->> 'id') is distinct from p_entity_id::text then
    raise exception 'invalid_operation';
  end if;
  if p_base_version is null or p_base_version < 0 then raise exception 'invalid_version'; end if;

  -- Serialize retries before inspecting the receipt, including concurrent calls
  -- whose first response has not reached the client yet.
  perform pg_advisory_xact_lock(hashtextextended('operation:' || p_operation_id::text, 0));
  select * into receipt from public.applied_operations where id = p_operation_id;
  if found then
    if receipt.user_id <> current_user_id then raise exception 'operation_id_conflict'; end if;
    return receipt.result;
  end if;

  target_table := case p_entity when 'notebook' then 'notebooks' when 'note' then 'notes' else 'todos' end;
  -- Row locks alone cannot serialize the first insert of an entity.
  perform pg_advisory_xact_lock(hashtextextended(p_entity || ':' || p_entity_id::text, 0));
  -- The primary key never changes; NO KEY UPDATE also lets another mutation
  -- reference this note through a foreign key without a lock-order inversion.
  execute format('select to_jsonb(r) from public.%I r where id = $1 for no key update', target_table)
    into existing_row using p_entity_id;

  if p_entity = 'note' then
    select workspace_id into target_workspace from public.notebooks
      where id = (p_row ->> 'notebook_id')::uuid;
  else
    target_workspace := (p_row ->> 'workspace_id')::uuid;
  end if;
  if target_workspace is null then raise exception 'workspace_missing'; end if;
  if not public.is_workspace_member(target_workspace) then raise exception 'workspace_forbidden'; end if;

  if existing_row is not null then
    if p_entity = 'note' then
      select workspace_id into original_workspace from public.notebooks
        where id = (existing_row ->> 'notebook_id')::uuid;
    else
      original_workspace := (existing_row ->> 'workspace_id')::uuid;
    end if;
    if original_workspace is distinct from target_workspace then raise exception 'workspace_forbidden'; end if;
  end if;

  -- A legacy client does not understand recurrence/history. Do not let its
  -- full-row update erase metadata or make completed disagree with status.
  if p_entity = 'todo' then
    if existing_row -> 'planning' is not null
      and existing_row -> 'planning' <> 'null'::jsonb
      and not (p_row ? 'planning') then
      raise exception 'todo_planning_client_required';
    end if;
    if p_row ? 'planning' and (
      p_row -> 'planning' = 'null'::jsonb or not public.valid_todo_planning(p_row -> 'planning')
    ) then raise exception 'invalid_todo_planning'; end if;
    if existing_row -> 'planning' ->> 'kind' = 'occurrence' and (
      p_row -> 'planning' ->> 'kind' is distinct from 'occurrence'
      or p_row -> 'planning' ->> 'seriesId' is distinct from existing_row -> 'planning' ->> 'seriesId'
      or p_row -> 'planning' ->> 'date' is distinct from existing_row -> 'planning' ->> 'date'
    ) then raise exception 'invalid_todo_planning'; end if;
  end if;

  if existing_row is not null and (existing_row ->> 'version')::integer <> p_base_version then
    mutation_result := jsonb_build_object('status', 'conflict', 'record', existing_row);
  else
    if existing_row is null and p_base_version <> 0 then raise exception 'missing_remote_record'; end if;
    if (p_row ->> 'rank') is null or (p_row ->> 'rank')::double precision in
      ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision) then
      raise exception 'invalid_rank';
    end if;
    if p_entity = 'note' and p_row ->> 'conflict_of' is not null then
      if not exists (
        select 1 from public.notes n join public.notebooks b on b.id = n.notebook_id
        where n.id = (p_row ->> 'conflict_of')::uuid and b.workspace_id = target_workspace
      ) then raise exception 'workspace_forbidden'; end if;
    end if;

    new_version := coalesce((existing_row ->> 'version')::integer, 0) + 1;
    p_row := p_row || jsonb_build_object('id', p_entity_id, 'version', new_version, 'updated_at', now());
    if existing_row is null then
      execute format(
        'insert into public.%I select * from jsonb_populate_record(null::public.%I, $1) returning to_jsonb(%I.*)',
        target_table, target_table, target_table
      ) into saved_row using p_row;
    elsif p_entity = 'notebook' then
      update public.notebooks set
        name = p_row ->> 'name', rank = (p_row ->> 'rank')::double precision,
        version = new_version, updated_at = now(), deleted_at = (p_row ->> 'deleted_at')::timestamptz
        where id = p_entity_id returning to_jsonb(notebooks.*) into saved_row;
    elsif p_entity = 'note' then
      update public.notes set
        notebook_id = (p_row ->> 'notebook_id')::uuid, title = p_row ->> 'title', body = p_row ->> 'body',
        content_json = p_row -> 'content_json', color = p_row ->> 'color', kind = p_row ->> 'kind',
        conflict_of = (p_row ->> 'conflict_of')::uuid, rank = (p_row ->> 'rank')::double precision,
        version = new_version, updated_at = now(), deleted_at = (p_row ->> 'deleted_at')::timestamptz
        where id = p_entity_id returning to_jsonb(notes.*) into saved_row;
    else
      update public.todos set
        text = p_row ->> 'text', completed = (p_row ->> 'completed')::boolean,
        planning = case when p_row ? 'planning' then p_row -> 'planning' else planning end,
        rank = (p_row ->> 'rank')::double precision, version = new_version,
        updated_at = now(), deleted_at = (p_row ->> 'deleted_at')::timestamptz
        where id = p_entity_id returning to_jsonb(todos.*) into saved_row;
    end if;
    mutation_result := jsonb_build_object('status', 'applied', 'record', saved_row);
  end if;

  mutation_result := mutation_result || jsonb_build_object('todoPlanningVersion', 1);
  insert into public.applied_operations(id, user_id, result)
    values (p_operation_id, current_user_id, mutation_result);
  return mutation_result;
end;
$$;

revoke execute on function public.apply_workspace_mutation(uuid, text, uuid, integer, jsonb) from public, anon;
grant execute on function public.apply_workspace_mutation(uuid, text, uuid, integer, jsonb) to authenticated;

-- Only the atomic RPC may issue receipts; clients must not pre-seed fake ones.
revoke insert, update, delete on public.applied_operations from authenticated;

commit;
