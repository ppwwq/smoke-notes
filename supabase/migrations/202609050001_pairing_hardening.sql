-- Keep unsuccessful attempts committed so the pairing limit actually applies.
alter table public.notes drop constraint if exists notes_title_check;
alter table public.notes add constraint notes_title_check check (char_length(title) <= 200);

create or replace function public.redeem_pairing_code(p_code_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid();
  selected_code public.pairing_codes%rowtype;
  attempt_id bigint;
begin
  if current_user_id is null then raise exception 'authentication_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));
  if (select count(*) from public.pairing_attempts
      where user_id = current_user_id and attempted_at > now() - interval '10 minutes') >= 10 then
    return null;
  end if;
  insert into public.pairing_attempts(user_id) values (current_user_id) returning id into attempt_id;
  select * into selected_code from public.pairing_codes
    where code_hash = p_code_hash and redeemed_at is null and expires_at > now() for update;
  if selected_code.id is null then return null; end if;
  update public.pairing_codes set redeemed_at = now() where id = selected_code.id;
  insert into public.workspace_members(workspace_id, user_id, role)
    values (selected_code.workspace_id, current_user_id, 'member')
    on conflict (workspace_id, user_id) do nothing;
  update public.pairing_attempts set success = true where id = attempt_id;
  return selected_code.workspace_id;
end;
$$;

revoke execute on function public.bootstrap_workspace() from public, anon;
revoke execute on function public.redeem_pairing_code(text) from public, anon;
revoke execute on function public.is_workspace_member(uuid) from public, anon;
grant execute on function public.bootstrap_workspace() to authenticated;
grant execute on function public.redeem_pairing_code(text) to authenticated;
grant execute on function public.is_workspace_member(uuid) to authenticated;
