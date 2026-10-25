-- Additive calendar protocol. Does not modify existing notes/todos or their RPC.
begin;
create table public.planner_records (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('event', 'type', 'link')),
  id text not null check (length(id) between 1 and 180),
  payload jsonb,
  version integer not null check (version > 0),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, kind, id)
);
create table public.planner_receipts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  request jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.planner_records enable row level security;
alter table public.planner_receipts enable row level security;
create policy planner_member_read on public.planner_records for select to authenticated
  using (public.is_workspace_member(workspace_id));
-- Supabase may grant ALL via default ACLs. RLS does not protect TRUNCATE.
revoke all on public.planner_records from anon, authenticated;
grant select on public.planner_records to authenticated;
revoke all on public.planner_receipts from anon, authenticated;

create function public.valid_planner_event(v jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare r jsonb; item jsonb; n integer;
begin
  if jsonb_typeof(v) is distinct from 'object'
    or coalesce(length(btrim(v->>'title')),0) not between 1 and 240
    or jsonb_typeof(v->'allDay') is distinct from 'boolean'
    or coalesce(v->>'start','') !~ '^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$'
    or coalesce(v->>'end','') !~ '^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$'
    or (v->>'end')::timestamp <= (v->>'start')::timestamp
    or (v->>'end')::timestamp - (v->>'start')::timestamp > interval '366 days'
    or coalesce(length(v->>'notes'),0)>4000 or coalesce(length(v->>'location'),0)>500
    or coalesce(length(v->>'url'),0)>2000
    or (coalesce(v->>'url','')<>'' and v->>'url' !~ '^https?://')
    or coalesce(v->>'color','') not in ('amber','rose','sage','sky','violet','graphite','lavender','mauve','mist','dustyrose','peach','clay','purple','green','blue','orange')
    then return false; end if;
  if (v->>'allDay')::boolean and (right(v->>'start',5)<>'00:00' or right(v->>'end',5)<>'00:00') then return false; end if;
  perform (v->>'start')::timestamp at time zone coalesce(v->>'timeZone','Asia/Hong_Kong');
  r := v->'repeat';
  if r is not null and r <> 'null'::jsonb then
    if jsonb_typeof(r) <> 'object' or coalesce(r->>'frequency','') not in ('daily','weekly','monthly','yearly')
      or coalesce(r->>'interval','') !~ '^\d+$' or (r->>'interval')::integer not between 1 and 99 then return false; end if;
    if r ? 'count' and (r->>'count' !~ '^\d+$' or (r->>'count')::integer not between 1 and 10000) then return false; end if;
    if r ? 'until' then
      if r ? 'count' or r->>'until' !~ '^\d{4}-\d{2}-\d{2}$' or (r->>'until')::date < (v->>'start')::date then return false; end if;
    end if;
    if r->>'frequency'='weekly' and (jsonb_typeof(r->'weekdays') is distinct from 'array' or jsonb_array_length(r->'weekdays')=0) then return false; end if;
    if r ? 'weekdays' then
      for item in select * from jsonb_array_elements(r->'weekdays') loop
        if item::text !~ '^\d$' or item::text::integer not between 0 and 6 then return false; end if;
      end loop;
    end if;
    if r ? 'monthDays' then
      if jsonb_array_length(r->'monthDays')=0 then return false; end if;
      for item in select * from jsonb_array_elements(r->'monthDays') loop
        if item::text !~ '^\d+$' or item::text::integer not between 1 and 31 then return false; end if;
      end loop;
    end if;
    if r ? 'months' then
      if jsonb_array_length(r->'months')=0 then return false; end if;
      for item in select * from jsonb_array_elements(r->'months') loop
        if item::text !~ '^\d+$' or item::text::integer not between 1 and 12 then return false; end if;
      end loop;
    end if;
    if r ? 'nthWeekday' then
      n := (r->'nthWeekday'->>'ordinal')::integer;
      if n is null or n not in (-1,1,2,3,4,5) or coalesce((r->'nthWeekday'->>'weekday')::integer,-1) not between 0 and 6 then return false; end if;
    end if;
  end if;
  return true;
exception when others then return false;
end;
$$;

create function public.planner_sync_capabilities()
returns jsonb language sql stable set search_path = '' as $$ select '{"planner":1}'::jsonb $$;
revoke execute on function public.planner_sync_capabilities() from public, anon;
grant execute on function public.planner_sync_capabilities() to authenticated;

create function public.apply_planner_mutation(p_operation_id uuid, p_workspace_id uuid, p_kind text, p_id text, p_base_version integer, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); existing public.planner_records%rowtype; receipt public.planner_receipts%rowtype;
  saved public.planner_records%rowtype; result jsonb; request jsonb; e record;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if p_workspace_id is null or not public.is_workspace_member(p_workspace_id) then raise exception 'workspace_forbidden'; end if;
  if p_operation_id is null or p_kind is null or p_kind not in ('event','type','link') or coalesce(length(p_id),0) not between 1 and 180
    or p_base_version is null or p_base_version<0 then raise exception 'invalid_operation'; end if;
  request := jsonb_build_object('workspace',p_workspace_id,'kind',p_kind,'id',p_id,'base',p_base_version,'payload',p_payload);
  perform pg_advisory_xact_lock(hashtextextended('planner-operation:'||p_operation_id::text,0));
  select * into receipt from public.planner_receipts where id=p_operation_id;
  if found then
    if receipt.user_id<>uid or receipt.request<>request then raise exception 'operation_id_conflict'; end if;
    return receipt.result;
  end if;
  if p_payload is not null then
    if jsonb_typeof(p_payload)<>'object' or length(p_payload::text)>1000000 or p_payload->>'id' is distinct from p_id
      or p_payload->>'workspaceId' is distinct from p_workspace_id::text then raise exception 'invalid_payload'; end if;
    if p_kind='event' then
      if not public.valid_planner_event(p_payload) or jsonb_typeof(p_payload->'exceptions') is distinct from 'object' then raise exception 'invalid_event'; end if;
      for e in select * from jsonb_each(p_payload->'exceptions') loop
        if e.key !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'invalid_exception'; end if;
        perform e.key::date;
        if e.value<>'null'::jsonb and not public.valid_planner_event(e.value) then raise exception 'invalid_exception'; end if;
      end loop;
      if p_payload->>'deletedAt' is not null then perform (p_payload->>'deletedAt')::timestamptz; end if;
    elsif p_kind='type' then
      if coalesce(length(btrim(p_payload->>'name')),0) not between 1 and 40
        or coalesce(p_payload->>'color','') not in ('amber','rose','sage','sky','violet','graphite','lavender','mauve','mist','dustyrose','peach','clay','purple','green','blue','orange') then raise exception 'invalid_type'; end if;
    else
      if p_id is distinct from p_workspace_id::text||':'||(p_payload->>'todoId') then raise exception 'invalid_link'; end if;
      perform (p_payload->>'todoId')::uuid;
      if p_payload->>'time' is not null and p_payload->>'time' !~ '^([01]\d|2[0-3]):[0-5]\d$' then raise exception 'invalid_time'; end if;
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('planner:'||p_workspace_id::text||':'||p_kind||':'||p_id,0));
  select * into existing from public.planner_records where workspace_id=p_workspace_id and kind=p_kind and id=p_id for update;
  if found and existing.version<>p_base_version then
    result := jsonb_build_object('status','conflict','record',to_jsonb(existing));
  else
    if existing.id is null and p_base_version<>0 then raise exception 'missing_remote_record'; end if;
    insert into public.planner_records(workspace_id,kind,id,payload,version)
      values(p_workspace_id,p_kind,p_id,p_payload,coalesce(existing.version,0)+1)
      on conflict(workspace_id,kind,id) do update set payload=excluded.payload,version=excluded.version,updated_at=now()
      returning * into saved;
    result := jsonb_build_object('status','applied','record',to_jsonb(saved));
  end if;
  insert into public.planner_receipts(id,user_id,workspace_id,request,result) values(p_operation_id,uid,p_workspace_id,request,result);
  return result;
end;
$$;
revoke execute on function public.valid_planner_event(jsonb) from public, anon;
revoke execute on function public.apply_planner_mutation(uuid,uuid,text,text,integer,jsonb) from public, anon;
grant execute on function public.apply_planner_mutation(uuid,uuid,text,text,integer,jsonb) to authenticated;
commit;
