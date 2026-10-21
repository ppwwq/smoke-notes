"""Read catalog metadata only; never repair history, mutate rows, or deploy."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys

import backend
import audit_details

ROOT = Path(__file__).resolve().parents[2]
CATALOG = Path(__file__).parent / 'audit/catalog.sql'
CATALOG_MARKER = 'SMOKE_AUDIT_CATALOG_START'
VERSIONS = ('202608280001', '202608280002', '202608290001', '202609050001',
            '202609050002', '202610150001', '202610150002')
CATEGORIES = ('client_roles', 'tables', 'columns', 'constraints', 'indexes', 'policies',
              'table_grants', 'functions', 'triggers', 'publication', 'extensions')
STAGES = frozenset(('invocation', 'reference', 'target', 'query', 'parse', 'compare', 'summary'))
ERROR_CLASSES = frozenset(('invalid_input', 'missing_input', 'invalid_json', 'invalid_response',
    'client_missing', 'timeout', 'io_error', 'connection_failed', 'query_failed',
    'tls_unconfirmed', 'version_mismatch', 'unsupported_reference', 'unexpected'))
# Only reviewed constants may reach logs, even if stderr contains arbitrary data.
SQLSTATES = frozenset(('08000', '08001', '08003', '08004', '08006', '08P01',
    '25006', '28000', '28P01', '3D000', '3F000', '42501', '42601', '42703',
    '42883', '42P01', '53300', '53400', '57014', '57P01', '57P02', '57P03'))


class AuditFailure(RuntimeError):
    def __init__(self, stage, category, sqlstate='UNAVAILABLE'):
        self.stage = stage if stage in STAGES else 'invocation'
        self.category = category if category in ERROR_CLASSES else 'unexpected'
        self.sqlstate = sqlstate if sqlstate in SQLSTATES else 'UNAVAILABLE'
        super().__init__('Read-only audit failed')

    def diagnostic(self):
        return f'stage={self.stage} error={self.category} sqlstate={self.sqlstate}'


def at_stage(stage, operation, *args):
    try:
        return operation(*args)
    except AuditFailure:
        raise
    except Exception as error:
        # Never serialize error text, type names, paths, command arguments or payloads.
        category = 'unexpected'
        if isinstance(error, subprocess.TimeoutExpired):
            category = 'timeout'
        elif isinstance(error, FileNotFoundError):
            category = 'client_missing' if stage == 'query' else 'missing_input'
        elif isinstance(error, json.JSONDecodeError):
            category = 'invalid_json'
        elif isinstance(error, KeyError):
            category = 'missing_input'
        elif isinstance(error, OSError):
            category = 'io_error'
        elif isinstance(error, (ValueError, RuntimeError)):
            category = 'invalid_response' if stage == 'parse' else 'invalid_input'
        raise AuditFailure(stage, category) from None


def query_sqlstate(stderr):
    # VERBOSITY=sqlstate emits severity + code only for server query errors.
    # Do not search arbitrary message bodies for five-character substrings.
    codes = re.findall(r'^(?:ERROR|FATAL|PANIC):  ([0-9A-Z]{5})\s*$', stderr, re.MULTILINE)
    return codes[0] if len(codes) == 1 and codes[0] in SQLSTATES else 'UNAVAILABLE'


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
    sql = at_stage('reference', CATALOG.read_text)
    # pg_stat_ssl describes the server-facing connection, which can be the
    # pooler's connection rather than ours. Inspect this same psql session's
    # libpq TLS status; keep connection details in memory and never log them.
    sql = '\\conninfo\n\\echo ' + CATALOG_MARKER + '\n' + sql
    result = at_stage('query', lambda: subprocess.run(
        ['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate'],
        input=sql, text=True, capture_output=True, env=env, timeout=90))
    if result.returncode:
        category = 'connection_failed' if result.returncode == 2 else 'query_failed'
        raise AuditFailure('query', category, query_sqlstate(result.stderr))
    return at_stage('parse', parse_client_capture, result.stdout)


def parse_client_capture(output):
    connection, separator, catalog_output = output.partition('\n' + CATALOG_MARKER + '\n')
    if not separator:
        raise RuntimeError('Missing connection status boundary')
    catalog, history = parse_capture(catalog_output)
    # LC_ALL=C fixes the psql message language. Unknown/new output formats,
    # unencrypted sessions and obsolete TLS versions all fail closed.
    tls_lines = [line for line in connection.splitlines() if line.startswith('SSL connection ')]
    catalog['client_tls'] = len(tls_lines) == 1 and re.fullmatch(
        r'SSL connection \(protocol: TLSv1\.[23], cipher: [A-Za-z0-9_-]+, '
        r'compression: off(?:, ALPN: [A-Za-z0-9_-]+)?\)', tls_lines[0]) is not None
    return catalog, history


def compare(reference, observed, history):
    if observed.get('client_tls') is not True:
        raise AuditFailure('compare', 'tls_unconfirmed')
    if observed.get('major') != reference.get('major'):
        raise AuditFailure('compare', 'version_mismatch')
    if reference.get('major') != 17 or set(reference.get('schema', {})) != set(CATEGORIES):
        raise AuditFailure('compare', 'unsupported_reference')
    report = ['AUDIT ONLY: no migration, history repair, application write, backup or deployment.']
    matching = True
    for category in CATEGORIES:
        same = reference['schema'][category] == observed['schema'][category]
        matching = matching and same
        report.append(f'{category}: ' + ('MATCH' if same else 'REVIEW_REQUIRED'))
        if not same and category == 'table_grants':
            report.extend(audit_details.grant_differences(reference['schema'][category], observed['schema'][category]))
        if not same and category == 'functions':
            report.extend(audit_details.function_differences(reference['schema'][category], observed['schema'][category]))
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
        raise AuditFailure('invocation', 'invalid_input')
    reference = at_stage('reference', lambda: json.loads(Path(reference_path).read_text()))
    env = at_stage('target', lambda: database_environment(
        os.environ['SUPABASE_DB_URL'], os.environ['SUPABASE_PROJECT_REF']))
    observed, history = capture(env)
    report, matched = at_stage('compare', compare, reference, observed, history)
    # Only fixed literals/category labels leave memory. Never serialize observations.
    print(report, end='')
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        at_stage('summary', append_summary, report)
    return 0 if matched else 2


def append_summary(report):
    with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as stream:
        stream.write(report)


def entrypoint():
    try:
        if len(sys.argv) != 2:
            raise AuditFailure('invocation', 'invalid_input')
        return main(sys.argv[1])
    except AuditFailure as error:
        print('Read-only audit failed; ' + error.diagnostic()
              + '. No repair or deployment attempted.', file=sys.stderr)
        return 1
    except Exception:
        print('Read-only audit failed; stage=invocation error=unexpected sqlstate=UNAVAILABLE.'
              ' No repair or deployment attempted.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(entrypoint())
