begin;
select plan(3);

insert into auth.users(id, aud, role) values
  ('00000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated');
insert into public.workspaces(id) values ('10000000-0000-0000-0000-000000000001');
insert into public.workspace_members(workspace_id, user_id, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'owner');
insert into public.notebooks(id, workspace_id, name, rank) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '私密', 1024);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select is((select count(*) from public.notebooks), 1::bigint, 'member can read own notebook');
select lives_ok($$update public.notebooks set name = '已更新' where id = '20000000-0000-0000-0000-000000000001'$$, 'member can update own notebook');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select is((select count(*) from public.notebooks), 0::bigint, 'other user cannot read notebook');

select * from finish();
rollback;
