"""Only the reviewed planning migration; no reset, history repair or rollback."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import urlparse, unquote, parse_qs

MIGRATION = '202610200001_todo_planning.sql'
DIGEST = '5fe5115274fb3ed05742b9c257d850d3513d9b343e55b469bbe905692d238f96'
TABLES = ('workspaces', 'workspace_members', 'notebooks', 'notes', 'todos', 'pairing_codes', 'pairing_attempts', 'applied_operations')


def run(args, *, sql=None, env=None):
    result = subprocess.run(args, input=sql, text=True, capture_output=True, env=env, timeout=600)
    if result.returncode:
        raise RuntimeError('Backend command failed; outputs suppressed to protect credentials/data')
    return result.stdout


def db_environment(url, project):
    parsed = urlparse(url)
    if parsed.scheme not in ('postgres', 'postgresql') or not parsed.password:
        raise RuntimeError('Use the approved password-bearing PostgreSQL connection URL')
    host = parsed.hostname or ''
    user = unquote(parsed.username or '')
    direct = host == f'db.{project}.supabase.co' and parsed.port in (None, 5432)
    pool = host.endswith('.pooler.supabase.com') and user.endswith('.' + project) and parsed.port == 5432
    if not (direct or pool) or parsed.path != '/postgres':
        raise RuntimeError('Wrong project or connection type; use direct/session pooler, not transaction pooler')
    if parse_qs(parsed.query).get('sslmode') != ['require']:
        raise RuntimeError('Connection URL must explicitly require TLS')
    env = dict(os.environ, PGHOST=host, PGPORT=str(parsed.port or 5432), PGUSER=user,
               PGPASSWORD=unquote(parsed.password), PGDATABASE='postgres', PGSSLMODE='require',
               PGCONNECT_TIMEOUT='20', PGOPTIONS='-c statement_timeout=120000 -c lock_timeout=15000')
    return env


def snapshot(env):
    # Aggregate hashes only; no user row contents or database dump in Actions logs/artifacts.
    queries = []
    for table in TABLES:
        row = "to_jsonb(t) || jsonb_build_object('planning', to_jsonb(t)->'planning')" if table == 'todos' else 'to_jsonb(t)'
        queries.append(f"select json_build_object('table','{table}','count',count(*),'hash',md5(coalesce(string_agg(md5(({row})::text),'' order by md5(({row})::text)),''))) from public.{table} t;")
    output = run(['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'],
                 sql='begin isolation level repeatable read read only;\n' + '\n'.join(queries) + '\ncommit;', env=env)
    return [json.loads(line) for line in output.splitlines() if line]


def main():
    project = os.environ['SUPABASE_PROJECT_REF']
    if not re.fullmatch('[a-z]{20}', project):
        raise RuntimeError('Invalid project reference')
    url = os.environ['SUPABASE_DB_URL']
    env = db_environment(url, project)
    migrations = sorted(Path('supabase/migrations').glob('*.sql'))
    path = Path('supabase/migrations') / MIGRATION
    if migrations[-1] != path or hashlib.sha256(path.read_bytes()).hexdigest() != DIGEST:
        raise RuntimeError('Migration set changed; review this release workflow first')
    versions = [p.name.split('_')[0] for p in migrations]
    remote = run(['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'],
        sql='select version from supabase_migrations.schema_migrations order by version;', env=env).splitlines()
    if remote not in (versions[:-1], versions):
        raise RuntimeError('Remote migration history differs: manual audit required; never auto-repair')
    # Snapshot is preservation detection, NOT a restorable backup. The prior manual gate is mandatory.
    before = snapshot(env)
    if remote == versions[:-1]:
        run(['supabase', 'db', 'push', '--db-url', url, '--skip-vault', '--dry-run'], env=env)
        run(['supabase', 'db', 'push', '--db-url', url, '--skip-vault', '--yes'], env=env)
    after = snapshot(env)
    if before != after:
        raise RuntimeError('Rows changed during migration window. Stop for review; never auto-rollback')
    run(['supabase', 'functions', 'deploy', 'apply-mutation', '--project-ref', project, '--use-api'], env=env)
    print('Migration/history checked, original row hashes unchanged, apply-mutation deployed.')
    print('No database rollback or permanent deletion was performed.')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Backend release failed. Inspect privately; do not retry blindly or roll back the database.', file=sys.stderr)
        sys.exit(1)
