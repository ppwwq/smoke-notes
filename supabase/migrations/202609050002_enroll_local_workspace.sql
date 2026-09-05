-- Preserve existing offline workspace IDs when enabling cloud sync.
create or replace function public.enroll_local_workspace(p_workspace_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'authentication_required'; end if;
  if p_workspace_id is null then raise exception 'workspace_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 0));
  if exists(select 1 from public.workspaces where id = p_workspace_id) then
    if not public.is_workspace_member(p_workspace_id) then
      raise exception 'workspace_forbidden';
    end if;
    return p_workspace_id;
  end if;
  insert into public.workspaces(id) values(p_workspace_id);
  insert into public.workspace_members(workspace_id, user_id, role)
    values(p_workspace_id, current_user_id, 'owner');
  return p_workspace_id;
end;
$$;
revoke execute on function public.enroll_local_workspace(uuid) from public, anon;
grant execute on function public.enroll_local_workspace(uuid) to authenticated;
