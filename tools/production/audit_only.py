"""Read catalog metadata only; never repair history, mutate rows, or deploy."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys

import backend

ROOT = Path(__file__).resolve().parents[2]
CATALOG = Path(__file__).parent / 'audit/catalog.sql'
VERSIONS = ('202608280001', '202608280002', '202608290001', '202609050001',
            '202609050002', '202610150001', '202610150002')
CATEGORIES = ('client_roles', 'tables', 'columns', 'constraints', 'indexes', 'policies',
              'table_grants', 'functions', 'triggers', 'publication', 'extensions')


def database_environment(url, project):
    if not re.fullmatch('[a-z]{20}', project):
        raise RuntimeError('Invalid target')
    validated = backend.db_environment(url, project)
    # No inherited tokens, raw URL, psqlrc, services or libpq overrides.
    allowed = ('PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE',
               'PGSSLMODE', 'PGCONNECT_TIMEOUT')
    result = {k: validated[k] for k in allowed}
    result.update(PATH=os.defpath, LC_ALL='C',
                  PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=30000 -c lock_timeout=3000')
    return result


def parse_capture(output):
    lines = output.splitlines()
    if len(lines) != 2:
        raise RuntimeError('Invalid audit response')
    catalog, history = map(json.loads, lines)
    if catalog.get('read_only') != 'on' or catalog.get('database') != 'postgres':
        raise RuntimeError('Read-only session was not confirmed')
    if set(catalog.get('schema', {})) != set(CATEGORIES):
        raise RuntimeError('Incomplete catalog response')
    if type(history.get('exists')) is not bool or not isinstance(history.get('versions'), list):
        raise RuntimeError('Invalid history response')
    return catalog, history


def capture(env):
    result = subprocess.run(['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'],
        input=CATALOG.read_text(), text=True, capture_output=True, env=env, timeout=90)
    if result.returncode:
        raise RuntimeError('Read-only query failed; server output suppressed')
    return parse_capture(result.stdout)


def compare(reference, observed, history):
    if observed.get('tls') is not True or observed.get('major') != reference.get('major'):
        raise RuntimeError('TLS or reference PostgreSQL version mismatch')
    if reference.get('major') != 17 or set(reference.get('schema', {})) != set(CATEGORIES):
        raise RuntimeError('Unsupported reference')
    report = ['AUDIT ONLY: no migration, history repair, application write, backup or deployment.']
    matching = True
    for category in CATEGORIES:
        same = reference['schema'][category] == observed['schema'][category]
        matching = matching and same
        report.append(f'{category}: ' + ('MATCH' if same else 'REVIEW_REQUIRED'))
    planning = any(c.get('table_name') == 'todos' and c.get('name') == 'planning'
                   for c in (observed['schema']['columns'] or []))
    report.append('planning: ' + ('PRESENT_REVIEW_REQUIRED' if planning else 'ABSENT'))
    versions = history['versions']
    if history['exists'] and versions == list(VERSIONS):
        state = 'EXACT_PRIOR_SEVEN'
    elif not history['exists'] and versions == []:
        state = 'MISSING_REVIEW_REQUIRED'
    elif history['exists'] and versions == []:
        state = 'EMPTY_REVIEW_REQUIRED'
    else:
        state = 'DIVERGENT_REVIEW_REQUIRED'
    report.extend(['history: ' + state,
        'Historical data backfill and hosted RLS behavior: NOT VERIFIED by this catalog audit.',
        'No automatic repair or release approval. Review the observations before any write.'])
    return '\n'.join(report) + '\n', matching and not planning and state == 'EXACT_PRIOR_SEVEN'


def main(reference_path):
    if os.environ.get('AUDIT_OPERATION') != 'audit_only':
        raise RuntimeError('Explicit audit_only operation required')
    reference = json.loads(Path(reference_path).read_text())
    env = database_environment(os.environ['SUPABASE_DB_URL'], os.environ['SUPABASE_PROJECT_REF'])
    observed, history = capture(env)
    report, matched = compare(reference, observed, history)
    # Only fixed literals/category labels leave memory. Never serialize observations.
    print(report, end='')
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as stream:
            stream.write(report)
    return 0 if matched else 2


def entrypoint():
    try:
        if len(sys.argv) != 2:
            raise RuntimeError('Expected reference path')
        return main(sys.argv[1])
    except Exception:
        print('Read-only audit failed; details suppressed. No repair or deployment attempted.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(entrypoint())
