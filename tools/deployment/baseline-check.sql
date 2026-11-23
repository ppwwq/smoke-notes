-- Read-only supplemental checks for objects not reliably covered by schema diff.
select
  (select count(*) = 8 and bool_and(c.relrowsecurity)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relname in
     ('workspaces','workspace_members','notebooks','notes','todos',
      'pairing_codes','pairing_attempts','applied_operations'))
  and (select count(*) = 3 and bool_and(
      md5(replace(p.prosrc, E'\r\n', E'\n')) = expected.body_md5
      and p.prosecdef and p.proconfig @> array['search_path=""']
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and not has_function_privilege('anon', p.oid, 'EXECUTE'))
    from (values
      ('public.apply_workspace_mutation(uuid,text,uuid,integer,jsonb)', 'de024ea053c3a1d9d2958729698fce73'),
      ('public.rotate_pairing_code(uuid,text)', '8679caf4ecb1e4f93a6ddd2f32b3c618'),
      ('public.bootstrap_workspace()', 'f06744ae12ae188be66aa978c60383d1')
    ) as expected(signature, body_md5)
    join pg_proc p on p.oid = to_regprocedure(expected.signature))
  and not has_table_privilege('authenticated', 'public.applied_operations', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon', 'public.pairing_attempts', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.pairing_attempts', 'SELECT,INSERT,UPDATE,DELETE')
  and (select count(*) = 3 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename in ('notebooks','notes','todos'));
