"""Explicit metadata-only baseline adoption. Never replay historical migrations."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys

import audit_only
import baseline_profile

PROJECT = 'koundrkjeambrcodxkdd'


def validate_inputs(env):
    sha = env.get('RELEASE_SHA', '')
    if (env.get('BASELINE_OPERATION') != 'adopt_baseline'
            or not re.fullmatch('[0-9a-f]{40}', sha)
            or env.get('SUPABASE_PROJECT_REF') != PROJECT
            or env.get('BASELINE_ACK') != f'ADOPT_PRIOR_SEVEN_KEEP_DATA:{sha}:{PROJECT}'
            or env.get('RELEASE_MODE') != 'no_backup'
            or env.get('NO_BACKUP_RISK_ACK') != f'I_ACCEPT_DATA_LOSS_WITHOUT_BACKUP:{sha}:{PROJECT}'
            or env.get('BACKUP_EVIDENCE_ID')):
        raise RuntimeError('Explicit baseline adoption and no-backup acknowledgement required')


def require_baseline(reference, observed, history):
    if (set(reference.get('schema', {})) != set(audit_only.CATEGORIES)
            or not baseline_profile.matches(reference, observed)):
        raise RuntimeError('Hosted baseline differs; no metadata changes permitted')
    if history == {'exists': True, 'versions': list(audit_only.VERSIONS)}:
        return False  # A previous successful attempt is read back, not repeated.
    if history != {'exists': False, 'versions': []}:
        raise RuntimeError('Existing or divergent history must not be overwritten')
    return True


def adoption_sql(observed):
    # Only reviewed catalog metadata is included, never application rows/secrets.
    # Hex encoding makes arbitrary SQL literals in function definitions inert.
    expected = json.dumps(observed['schema'], ensure_ascii=True).encode().hex()
    source = audit_only.CATALOG.read_text()
    start = source.index('select jsonb_build_object(')
    end = source.index("select to_regclass('supabase_migrations.schema_migrations')")
    catalog_query = source[start:end].strip().removesuffix(';')
    tables = ', '.join('public.' + table for table in audit_only.backend.TABLES)
    names = {p.name.split('_')[0]: p.stem.split('_', 1)[1]
             for p in (audit_only.ROOT / 'supabase/migrations').glob('*.sql')}
    if not all(re.fullmatch('[a-z_]+', names.get(v, '')) for v in audit_only.VERSIONS):
        raise RuntimeError('Invalid reviewed migration names')
    rows = ',\n'.join(f"('{version}', '{names[version]}', null)" for version in audit_only.VERSIONS)
    return f"""begin;
set local search_path = pg_catalog;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
select pg_advisory_xact_lock(20261021, 7001);
lock table {tables} in share mode;
do $adoption$
declare actual jsonb;
begin
  if current_user <> 'postgres' or current_database() <> 'postgres' then
    raise exception 'Unexpected adoption identity';
  end if;
  select catalog into actual from ({catalog_query}) as captured(catalog);
  if actual->>'major' <> '17' or actual->'schema' is distinct from
      convert_from(decode('{expected}', 'hex'), 'UTF8')::jsonb then
    raise exception 'Catalog changed since review';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    raise exception 'History appeared; inspect before retry';
  end if;
end $adoption$;
create schema if not exists supabase_migrations;
create table supabase_migrations.schema_migrations (
  version text not null primary key,
  statements text[],
  name text
);
revoke all on supabase_migrations.schema_migrations from public, anon, authenticated, service_role;
insert into supabase_migrations.schema_migrations (version, name, statements) values
{rows};
commit;
"""


def main(reference_path):
    validate_inputs(os.environ)
    reference = json.loads(Path(reference_path).read_text())
    env = audit_only.database_environment(os.environ['SUPABASE_DB_URL'], PROJECT)
    observed, history = audit_only.capture(env)
    print('baseline_profile: ' + ('REVIEWED_HOSTED_MATCH' if baseline_profile.matches(reference, observed) else 'NOT_MATCHED'))
    if not require_baseline(reference, observed, history):
        print('Baseline already recorded: exact prior seven; no changes made.')
        return
    # Fresh catalog is checked again under locks in the write transaction.
    write_env = dict(env, PGOPTIONS='-c statement_timeout=30000 -c lock_timeout=5000')
    print('baseline_write: starting guarded metadata-only transaction')
    result = subprocess.run(['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
        '-v', 'VERBOSITY=sqlstate'], input=adoption_sql(observed), text=True,
        capture_output=True, env=write_env, timeout=90)
    if result.returncode:
        raise RuntimeError('Metadata adoption failed; inspect before retry')
    print('baseline_write: committed; verifying catalog and exact prior-seven history')
    after, history = audit_only.capture(env)
    if (after['schema'] != observed['schema']
            or history != {'exists': True, 'versions': list(audit_only.VERSIONS)}):
        raise RuntimeError('Post-adoption verification failed; do not deploy')
    report = ('BASELINE ADOPTED: exact prior seven metadata records verified.\n'
        'Existing application schema, ACLs and functions unchanged; no application rows written.\n'
        'Historical SQL/backfills were NOT replayed or certified as historically executed.\n'
        'Planning migration remains unapplied. No backup, function or frontend deployment.\n')
    print(report, end='')
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as stream:
            stream.write(report)


if __name__ == '__main__':
    try:
        main(sys.argv[1])
    except Exception:
        print('Baseline adoption stopped. Read back history before retry; do not deploy.', file=sys.stderr)
        sys.exit(1)
