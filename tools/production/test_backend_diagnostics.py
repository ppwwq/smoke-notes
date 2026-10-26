"""Recovery inspection must not deploy or disclose subprocess/exception contents."""
import contextlib
import io
import os
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

import backend


class BackendDiagnosticTests(unittest.TestCase):
    def test_inspection_is_read_only_for_pending_and_applied_history(self):
        versions = [p.name.split('_')[0] for p in sorted(Path('supabase/migrations').glob('*.sql'))]
        env = {'SUPABASE_PROJECT_REF': 'a' * 20,
               'SUPABASE_DB_URL': 'postgresql://postgres:secret@db.' + 'a' * 20 + '.supabase.co/postgres?sslmode=require'}
        for history in (versions[:-1], versions):
            with self.subTest(history=history), patch.dict(os.environ, env), \
                 patch('sys.argv', ['backend.py', '--inspect']), \
                 patch('backend.history', return_value=history) as read, \
                 patch('backend.snapshot') as snapshot, patch('backend.preflight_function_access'), \
                 patch('backend.run') as command, contextlib.redirect_stdout(io.StringIO()):
                backend.main()
                command.assert_not_called()
                snapshot.assert_called_once()
                self.assertIn('default_transaction_read_only=on', read.call_args.args[0]['PGOPTIONS'])

    def test_safe_diagnostic_never_includes_arbitrary_error_contents(self):
        with patch('backend.stage', 'migration_apply'):
            self.assertEqual(backend.diagnostic(RuntimeError('secret user row')),
                             'stage=migration_apply error=unexpected')
            result = subprocess.CompletedProcess([], 1, 'secret row', 'unknown flag: secret-url')
            with patch('backend.subprocess.run', return_value=result), self.assertRaises(backend.BackendFailure) as caught:
                backend.run(['supabase'])
            self.assertEqual(backend.diagnostic(caught.exception),
                             'stage=migration_apply error=unsupported_cli_option')

    def test_inspection_does_not_continue_with_unknown_history(self):
        env = {'SUPABASE_PROJECT_REF': 'a' * 20,
               'SUPABASE_DB_URL': 'postgresql://postgres:secret@db.' + 'a' * 20 + '.supabase.co/postgres?sslmode=require'}
        with patch.dict(os.environ, env), patch('sys.argv', ['backend.py', '--inspect']), \
             patch('backend.history', return_value=['unknown']), patch('backend.snapshot') as snapshot, \
             patch('backend.preflight_function_access') as preflight, self.assertRaises(RuntimeError):
            backend.main()
        snapshot.assert_not_called()
        preflight.assert_not_called()


if __name__ == '__main__':
    unittest.main()
