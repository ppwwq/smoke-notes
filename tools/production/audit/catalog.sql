-- Fixed catalog-only inspection. Never invoke application functions or read app rows.
begin isolation level repeatable read read only;
set local search_path = pg_catalog;
select jsonb_build_object(
  'read_only', current_setting('transaction_read_only'),
  'major', current_setting('server_version_num')::int / 10000,
  'database', current_database(),
  'tls', coalesce((select ssl from pg_stat_ssl where pid = pg_backend_pid()), false),
  'schema', jsonb_build_object(
    'client_roles', (select jsonb_agg(to_jsonb(x) order by x.rolname) from (
      select r.rolname,r.rolsuper,r.rolinherit,r.rolcreaterole,r.rolcreatedb,
        r.rolcanlogin,r.rolreplication,r.rolbypassrls,
        array(select m.rolname from pg_roles m where m.oid<>r.oid and pg_has_role(r.oid,m.oid,'MEMBER') order by m.rolname) as memberships
      from pg_roles r where r.rolname in ('anon','authenticated')
    ) x),
    'tables', (select jsonb_agg(to_jsonb(x) order by x.name) from (
      select c.relname as name, c.relkind, c.relrowsecurity, c.relforcerowsecurity,
        c.relreplident, pg_get_userbyid(c.relowner) as owner
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname in
        ('workspaces','workspace_members','notebooks','notes','todos','pairing_codes','pairing_attempts','applied_operations')
    ) x),
    'columns', (select jsonb_agg(to_jsonb(x) order by x.table_name,x.position) from (
      select c.relname as table_name, a.attnum as position, a.attname as name,
        format_type(a.atttypid,a.atttypmod) as type, a.attnotnull,
        a.attidentity, a.attgenerated, pg_get_expr(d.adbin,d.adrelid) as default_expr,
        a.attacl::text as acl
      from pg_attribute a join pg_class c on c.oid=a.attrelid
      join pg_namespace n on n.oid=c.relnamespace
      left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
      where n.nspname='public' and a.attnum>0 and not a.attisdropped and c.relname in
        ('workspaces','workspace_members','notebooks','notes','todos','pairing_codes','pairing_attempts','applied_operations')
    ) x),
    'constraints', (select jsonb_agg(to_jsonb(x) order by x.table_name,x.name) from (
      select c.relname as table_name, k.conname as name, k.convalidated,
        pg_get_constraintdef(k.oid) as definition
      from pg_constraint k join pg_class c on c.oid=k.conrelid
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname in
        ('workspaces','workspace_members','notebooks','notes','todos','pairing_codes','pairing_attempts','applied_operations')
    ) x),
    'indexes', (select jsonb_agg(to_jsonb(x) order by x.definition) from (
      select pg_get_indexdef(i.indexrelid) as definition, i.indisvalid, i.indisready
      from pg_index i join pg_class c on c.oid=i.indrelid
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname in
        ('workspaces','workspace_members','notebooks','notes','todos','pairing_codes','pairing_attempts','applied_operations')
    ) x),
    'policies', (select jsonb_agg(to_jsonb(x) order by x.tablename,x.policyname) from (
      select tablename,policyname,permissive,roles,cmd,qual,with_check
      from pg_policies where schemaname='public' and tablename in
        ('workspaces','workspace_members','notebooks','notes','todos','pairing_codes','pairing_attempts','applied_operations')
    ) x),
    'table_grants', (select jsonb_agg(to_jsonb(x) order by x.table_name,x.grantee,x.privilege_type) from (
      select c.relname as table_name, case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee,
        a.privilege_type,a.is_grantable,pg_get_userbyid(a.grantor) as grantor
      from pg_class c join pg_namespace n on n.oid=c.relnamespace,
        lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
      where n.nspname='public' and c.relname in
        ('workspaces','workspace_members','notebooks','notes','todos','pairing_codes','pairing_attempts','applied_operations')
    ) x),
    'functions', (select jsonb_agg(to_jsonb(x) order by x.definition) from (
      select pg_get_functiondef(p.oid) as definition, pg_get_userbyid(p.proowner) as owner,
        p.proacl::text as acl
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in
        ('is_workspace_member','bootstrap_workspace','redeem_pairing_code','enroll_local_workspace',
         'rotate_pairing_code','apply_workspace_mutation','valid_todo_planning','workspace_sync_capabilities')
    ) x),
    'triggers', (select jsonb_agg(to_jsonb(x) order by x.definition) from (
      select pg_get_triggerdef(t.oid) as definition,t.tgenabled
      from pg_trigger t join pg_class c on c.oid=t.tgrelid
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and not t.tgisinternal and c.relname in
        ('workspaces','workspace_members','notebooks','notes','todos','pairing_codes','pairing_attempts','applied_operations')
    ) x),
    'publication', (select jsonb_agg(to_jsonb(x) order by x.tablename) from (
      select p.puballtables,p.pubinsert,p.pubupdate,p.pubdelete,p.pubtruncate,p.pubviaroot,
        t.tablename,t.attnames,t.rowfilter
      from pg_publication p join pg_publication_tables t on t.pubname=p.pubname
      where p.pubname='supabase_realtime' and t.schemaname='public' and t.tablename in
        ('workspaces','workspace_members','notebooks','notes','todos','pairing_codes','pairing_attempts','applied_operations')
    ) x),
    'extensions', (select jsonb_agg(jsonb_build_object('name',extname,'version',extversion) order by extname)
      from pg_extension where extname in ('pgcrypto','plpgsql'))
  )
);
select to_regclass('supabase_migrations.schema_migrations') is not null as history_exists \gset
\if :history_exists
select jsonb_build_object('exists',true,'versions',coalesce(jsonb_agg(version order by version),'[]'::jsonb))
from supabase_migrations.schema_migrations;
\else
select '{"exists":false,"versions":[]}'::jsonb;
\endif
rollback;
