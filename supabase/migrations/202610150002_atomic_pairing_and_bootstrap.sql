-- A failed replacement must leave the currently valid pairing code usable.
create or replace function public.rotate_pairing_code(p_workspace_id uuid, p_code_hash text)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid();
  new_code_id uuid;
  expires timestamptz;
begin
  if current_user_id is null then raise exception 'authentication_required'; end if;
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'workspace_forbidden';
  end if;
  if p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_code_hash';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('pairing:' || p_workspace_id::text, 0));
  expires := clock_timestamp() + interval '5 minutes';
  -- Insert first: historical hash collisions abort without retiring the old code.
  insert into public.pairing_codes(workspace_id, code_hash, created_by, expires_at)
    values (p_workspace_id, p_code_hash, current_user_id, expires)
    returning id into new_code_id;
  update public.pairing_codes set redeemed_at = clock_timestamp()
    where workspace_id = p_workspace_id and redeemed_at is null and id <> new_code_id;
  return expires;
end;
$$;
revoke execute on function public.rotate_pairing_code(uuid, text) from public, anon;
grant execute on function public.rotate_pairing_code(uuid, text) to authenticated;

create or replace function public.bootstrap_workspace()
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid();
  workspace uuid;
begin
  if current_user_id is null then raise exception 'authentication_required'; end if;
  -- Same user lock as redeem_pairing_code: concurrent first calls share a result.
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));
  select workspace_id into workspace from public.workspace_members
    where user_id = current_user_id order by created_at, workspace_id limit 1;
  if workspace is not null then return workspace; end if;
  insert into public.workspaces default values returning id into workspace;
  insert into public.workspace_members(workspace_id, user_id, role)
    values (workspace, current_user_id, 'owner');
  return workspace;
end;
$$;
revoke execute on function public.bootstrap_workspace() from public, anon;
grant execute on function public.bootstrap_workspace() to authenticated;
