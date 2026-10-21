"""No production connection: workflow routing, leakage and target rejection."""
import contextlib
import copy
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import audit_only as audit
import audit_reference


class AuditSafetyTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {}, clear=True)
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.reference = {'major': 17, 'schema': {k: [] for k in audit.CATEGORIES}}
        self.observed = dict(copy.deepcopy(self.reference), tls=True)
        self.history = {'exists': True, 'versions': list(audit.VERSIONS)}
        self.project = 'a' * 20
        self.url = f'postgresql://postgres:test-only@db.{self.project}.supabase.co:5432/postgres?sslmode=require'

    def test_validated_target_and_read_only_environment(self):
        with patch.dict(os.environ, {'PGHOSTADDR': 'evil', 'PGSERVICE': 'evil',
                'PGOPTIONS': '-c default_transaction_read_only=off', 'GH_TOKEN': 'secret',
                'SUPABASE_ACCESS_TOKEN': 'secret', 'SUPABASE_DB_URL': self.url}):
            env = audit.database_environment(self.url, self.project)
        self.assertEqual(env['PGHOST'], f'db.{self.project}.supabase.co')
        self.assertEqual(env['PGSSLMODE'], 'require')
        self.assertIn('default_transaction_read_only=on', env['PGOPTIONS'])
        self.assertEqual(set(env), {'PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE',
            'PGSSLMODE','PGCONNECT_TIMEOUT','PGOPTIONS','PATH','LC_ALL'})
        for url in (self.url.replace('require','disable'), self.url + '&host=evil',
                    self.url.replace(self.project, 'b'*20), self.url.replace('5432','6543')):
            with self.assertRaises(RuntimeError):
                audit.database_environment(url, self.project)

    def test_psql_only_and_no_url_in_arguments(self):
        observed = dict(self.observed, read_only='on', database='postgres')
        output = json.dumps(observed) + '\n' + json.dumps(self.history) + '\n'
        with patch('audit_only.subprocess.run', return_value=subprocess.CompletedProcess([],0,output,'')) as run:
            audit.capture(audit.database_environment(self.url,self.project))
        args = run.call_args
        self.assertEqual(args.args[0], ['psql','-X','-qAt','-v','ON_ERROR_STOP=1',
                                      '-v','VERBOSITY=sqlstate'])
        self.assertNotIn(self.url, repr(args.args))
        self.assertEqual(args.kwargs['input'], audit.CATALOG.read_text())

    def test_missing_empty_partial_unknown_and_premarked_history_never_pass(self):
        cases = [{'exists':False,'versions':[]}, {'exists':True,'versions':[]},
                 {'exists':True,'versions':list(audit.VERSIONS[:-1])},
                 {'exists':True,'versions':['secret-unexpected-version']},
                 {'exists':True,'versions':list(audit.VERSIONS)+['202610200001']}]
        for history in cases:
            report, passed = audit.compare(self.reference,self.observed,history)
            self.assertFalse(passed)
            self.assertNotIn('secret-unexpected-version',report)
        self.assertTrue(audit.compare(self.reference,self.observed,self.history)[1])

    def test_every_catalog_difference_is_reported_without_values(self):
        for category in audit.CATEGORIES:
            observed = copy.deepcopy(self.observed)
            observed['schema'][category] = [{'unexpected':'secret-catalog-value'}]
            report, passed = audit.compare(self.reference,observed,self.history)
            self.assertFalse(passed)
            self.assertIn(category + ': REVIEW_REQUIRED',report)
            self.assertNotIn('secret-catalog-value',report)

    def test_tls_and_version_fail_closed(self):
        for changes in ({'tls':False},{'major':16},{'major':18}):
            with self.assertRaises(RuntimeError):
                audit.compare(self.reference,dict(self.observed,**changes),self.history)

    def test_requires_explicit_mode_before_any_connection(self):
        with patch('audit_only.capture') as capture, self.assertRaises(RuntimeError):
            audit.main('/nonexistent')
        capture.assert_not_called()

    def test_response_must_confirm_read_only_and_exact_shape(self):
        catalog = dict(self.observed, read_only='on', database='postgres')
        for changes in ({'read_only':'off'},{'database':'other'},{'schema':{}}):
            output = json.dumps(dict(catalog,**changes))+'\n'+json.dumps(self.history)
            with self.assertRaises(RuntimeError):
                audit.parse_capture(output)
        for output in ('private server error',json.dumps(catalog)):
            with self.assertRaises((RuntimeError,ValueError)):
                audit.parse_capture(output)

    def test_failed_subprocess_output_is_suppressed(self):
        with patch('audit_only.subprocess.run',return_value=subprocess.CompletedProcess(
                [],1,'private-stdout','private-stderr')), self.assertRaises(RuntimeError) as caught:
            audit.capture({})
        self.assertNotIn('private',str(caught.exception))

    def test_errors_and_summary_never_echo_server_payload(self):
        with tempfile.TemporaryDirectory() as folder:
            reference = Path(folder)/'reference.json'
            summary = Path(folder)/'summary'
            reference.write_text(json.dumps(self.reference))
            env = {'AUDIT_OPERATION':'audit_only','SUPABASE_PROJECT_REF':self.project,
                   'SUPABASE_DB_URL':self.url,'GITHUB_STEP_SUMMARY':str(summary)}
            with patch.dict(os.environ,env), patch('audit_only.capture',return_value=(self.observed,self.history)), \
                 contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(audit.main(reference),0)
            self.assertEqual(output.getvalue(),summary.read_text())
            self.assertNotIn(self.url,summary.read_text())
            with patch.dict(os.environ,env), patch('sys.argv',['audit_only.py',str(reference)]), \
                 patch('audit_only.capture',side_effect=RuntimeError('secret-server-body')), \
                 contextlib.redirect_stderr(io.StringIO()) as error:
                self.assertEqual(audit.entrypoint(),1)
            self.assertNotIn('secret-server-body',error.getvalue())

    def test_reference_refuses_production_credentials(self):
        with patch.dict(os.environ,{'SUPABASE_DB_URL':'secret'}), patch('audit_reference.command') as run:
            with self.assertRaises(RuntimeError), audit_reference.isolated_database():
                self.fail('Unexpected reference setup')
        run.assert_not_called()

    def test_diagnostics_only_emit_reviewed_constants(self):
        for payload in ('private-url', 'TOKEN', '28P01\n::error::private', 'secret-password'):
            failure = audit.AuditFailure(payload, payload, payload)
            self.assertEqual(failure.diagnostic(),
                'stage=invocation error=unexpected sqlstate=UNAVAILABLE')
        for raw in ('ERROR:  TOKEN\n', 'private ERROR:  28P01\n',
                    'ERROR:  28P01: secret-password\n', 'ERROR:  28P01\nERROR:  42501\n'):
            self.assertEqual(audit.query_sqlstate(raw), 'UNAVAILABLE')
        self.assertEqual(audit.query_sqlstate('ERROR:  42501\n'), '42501')

    def test_client_failures_have_safe_stage_and_category(self):
        cases = [
            (FileNotFoundError('private-path'), 'client_missing'),
            (subprocess.TimeoutExpired(['private-url'], 90,
                output='private-data', stderr='private-password'), 'timeout'),
            (OSError('private-token'), 'io_error'),
            (Exception('private-error'), 'unexpected'),
        ]
        for error, category in cases:
            with self.subTest(category=category), patch('audit_only.subprocess.run', side_effect=error), \
                 self.assertRaises(audit.AuditFailure) as caught:
                audit.capture({})
            self.assertEqual(caught.exception.diagnostic(),
                f'stage=query error={category} sqlstate=UNAVAILABLE')

    def test_entrypoint_failure_paths_suppress_payload_and_leave_summary_empty(self):
        with tempfile.TemporaryDirectory() as folder:
            reference = Path(folder) / 'reference.json'
            summary = Path(folder) / 'summary'
            reference.write_text(json.dumps(self.reference))
            env = {'AUDIT_OPERATION': 'audit_only', 'SUPABASE_PROJECT_REF': self.project,
                   'SUPABASE_DB_URL': self.url, 'GITHUB_STEP_SUMMARY': str(summary)}
            good = dict(self.observed, read_only='on', database='postgres')
            def response(catalog):
                return json.dumps(catalog) + '\n' + json.dumps(self.history) + '\n'
            cases = [
                (2, 'private-data', 'private connection password',
                 'stage=query error=connection_failed sqlstate=UNAVAILABLE'),
                (3, 'private-data', 'ERROR:  42501\n',
                 'stage=query error=query_failed sqlstate=42501'),
                (0, 'private-data', '', 'stage=parse error=invalid_response sqlstate=UNAVAILABLE'),
                (0, 'private-data\n{}\n', '', 'stage=parse error=invalid_json sqlstate=UNAVAILABLE'),
                (0, response(dict(good, tls=False)), '',
                 'stage=compare error=tls_unconfirmed sqlstate=UNAVAILABLE'),
                (0, response(dict(good, major=16)), '',
                 'stage=compare error=version_mismatch sqlstate=UNAVAILABLE'),
            ]
            for code, stdout, stderr, expected in cases:
                with self.subTest(expected=expected), patch.dict(os.environ, env), \
                     patch('sys.argv', ['audit_only.py', str(reference)]), \
                     patch('audit_only.subprocess.run', return_value=subprocess.CompletedProcess(
                         [], code, stdout, stderr)), contextlib.redirect_stderr(io.StringIO()) as error, \
                     contextlib.redirect_stdout(io.StringIO()) as output:
                    self.assertEqual(audit.entrypoint(), 1)
                self.assertEqual(error.getvalue(), 'Read-only audit failed; ' + expected
                                 + '. No repair or deployment attempted.\n')
                self.assertEqual(output.getvalue(), '')
                self.assertFalse(summary.exists())

    def test_reference_target_and_summary_failures_are_distinguishable(self):
        cases = [('reference', json.JSONDecodeError('private', 'private', 0), 'invalid_json'),
                 ('reference', FileNotFoundError('private'), 'missing_input'),
                 ('target', KeyError('private'), 'missing_input'),
                 ('target', ValueError('private'), 'invalid_input'),
                 ('summary', PermissionError('private'), 'io_error')]
        for stage, error, category in cases:
            with self.subTest(stage=stage, category=category), self.assertRaises(audit.AuditFailure) as caught:
                audit.at_stage(stage, lambda: (_ for _ in ()).throw(error))
            self.assertEqual(caught.exception.diagnostic(),
                             f'stage={stage} error={category} sqlstate=UNAVAILABLE')

    def test_workflow_audit_has_no_release_commands_or_other_secrets(self):
        # Sections bounded by top-level jobs; does not require third-party YAML in runner.
        text = (audit.ROOT/'.github/workflows/release-production.yml').read_text()
        section = text.split('\n  audit:\n',1)[1].split('\n  backend:\n',1)[0]
        self.assertIn("inputs.operation == 'audit_only'",section)
        self.assertIn('environment: production-backend',section)
        self.assertIn('secrets.SUPABASE_DB_URL',section)
        self.assertEqual(section.count('secrets.'),1)
        for forbidden in ('backend.py','pages.py','hosted_sync.py','--release','--backup',
                          'RELEASE_ENABLED','supabase db','upload-artifact'):
            self.assertNotIn(forbidden,section)
        for name, end in [('backend','web'),('web',None)]:
            job = text.split('\n  '+name+':\n',1)[1]
            if end:
                job = job.split('\n  '+end+':\n',1)[0]
            self.assertIn("inputs.operation == 'release'",job.split('steps:',1)[0])
        self.assertIn('default: audit_only',text)


if __name__ == '__main__':
    unittest.main()
