-- A mutation and its idempotency receipt must commit in the same transaction.
-- Deploy this migration before the apply-mutation edge function that calls it.
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
        rank = (p_row ->> 'rank')::double precision, version = new_version,
        updated_at = now(), deleted_at = (p_row ->> 'deleted_at')::timestamptz
        where id = p_entity_id returning to_jsonb(todos.*) into saved_row;
    end if;
    mutation_result := jsonb_build_object('status', 'applied', 'record', saved_row);
  end if;

  insert into public.applied_operations(id, user_id, result)
    values (p_operation_id, current_user_id, mutation_result);
  return mutation_result;
end;
$$;

revoke execute on function public.apply_workspace_mutation(uuid, text, uuid, integer, jsonb) from public, anon;
grant execute on function public.apply_workspace_mutation(uuid, text, uuid, integer, jsonb) to authenticated;

-- Only the atomic RPC may issue receipts; clients must not pre-seed fake ones.
revoke insert, update, delete on public.applied_operations from authenticated;
