"""Build a synthetic seven-migration reference without production credentials."""
import contextlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import uuid

import audit_only

IMAGE = 'postgres@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24'
FIXTURE = """
create role anon;
create role authenticated;
create schema auth;
create table auth.users(id uuid primary key, aud text, role text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema auth to anon, authenticated;
create publication supabase_realtime;
"""


def command(args, sql=None):
    result = subprocess.run(args, input=sql, text=True, capture_output=True, timeout=120)
    if result.returncode:
        raise RuntimeError('Synthetic reference command failed')
    return result.stdout


@contextlib.contextmanager
def isolated_database():
    if any(os.environ.get(k) for k in ('SUPABASE_DB_URL', 'SUPABASE_ACCESS_TOKEN', 'PGPASSWORD')):
        raise RuntimeError('Reference setup must not receive production credentials')
    name = 'smoke-audit-' + uuid.uuid4().hex[:12]
    command(['docker', 'run', '--rm', '--detach', '--network', 'none', '--name', name,
             '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', IMAGE, '-c', 'wal_level=logical'])
    try:
        for _ in range(100):
            logs = command(['docker', 'logs', name])
            ready = subprocess.run(['docker', 'exec', name, 'pg_isready', '-U', 'postgres'], capture_output=True)
            if 'PostgreSQL init process complete' in logs and ready.returncode == 0:
                break
            time.sleep(.2)
        else:
            raise RuntimeError('Synthetic reference not ready')
        def sql(text):
            return command(['docker', 'exec', '-i', name, 'psql', '-U', 'postgres',
                            '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], text)
        sql(FIXTURE)
        migrations = sorted((audit_only.ROOT / 'supabase/migrations').glob('*.sql'))
        prior = [p for p in migrations if p.name.split('_')[0] in audit_only.VERSIONS]
        if [p.name.split('_')[0] for p in prior] != list(audit_only.VERSIONS):
            raise RuntimeError('Unexpected baseline migration set')
        for path in prior:
            sql(path.read_text())
        yield name, sql
    finally:
        command(['docker', 'rm', '-fv', name])


def main(path):
    with isolated_database() as (_, sql):
        catalog, _ = audit_only.parse_capture(sql(audit_only.CATALOG.read_text()))
        if catalog['major'] != 17:
            raise RuntimeError('Unexpected reference PostgreSQL major')
    # This is repository-derived synthetic metadata, never a production export.
    Path(path).write_text(json.dumps(catalog))
    print('Synthetic prior-seven catalog reference ready.')


if __name__ == '__main__':
    try:
        main(sys.argv[1])
    except Exception:
        print('Synthetic reference preparation failed.', file=sys.stderr)
        sys.exit(1)
