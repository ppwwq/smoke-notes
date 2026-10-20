"""Offline safety tests only. Never connect to GitHub/Supabase/Cloudflare."""
import datetime as dt
import contextlib
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import backend
import guard
import pages

SHA = 'a' * 40
NOW = dt.datetime(2026, 10, 20, 3, tzinfo=dt.timezone.utc)


class ReleaseSafetyTests(unittest.TestCase):
    def setUp(self):
        self.context = {'RELEASE_SHA': SHA, 'GITHUB_REPOSITORY': guard.REPO,
            'GITHUB_EVENT_NAME': 'workflow_dispatch', 'GITHUB_REF': 'refs/heads/main',
            'GITHUB_WORKFLOW_REF': guard.REPO + '/' + guard.WORKFLOW + '@refs/heads/main',
            'GITHUB_SHA': SHA, 'GITHUB_WORKFLOW_SHA': SHA}
        self.record = {'release_sha': SHA, 'project_ref': 'a' * 20, 'evidence_id': 'backup_123',
            'restore_verified': True, 'retained': True, 'isolated_restore_target': 'isolated-project',
            'reviewer': 'independent-reviewer', 'backup_sha256': 'b' * 64,
            'backup_at': '2026-10-20T01:00:00+00:00', 'restore_verified_at': '2026-10-20T02:00:00+00:00',
            'retained_until': '2026-11-20T00:00:00+00:00'}

    def test_exact_main_context(self):
        guard.validate_context(self.context, SHA)
        for field, value in [('GITHUB_REF', 'refs/heads/feature'), ('GITHUB_REF', 'refs/tags/main'),
            ('GITHUB_EVENT_NAME', 'push'), ('GITHUB_REPOSITORY', 'attacker/fork'),
            ('GITHUB_WORKFLOW_SHA', 'b' * 40), ('RELEASE_SHA', 'main; echo unsafe')]:
            with self.subTest(field=field, value=value), self.assertRaises(RuntimeError):
                guard.validate_context(dict(self.context, **{field: value}), SHA)
        with self.assertRaises(RuntimeError):
            guard.validate_context(self.context, 'b' * 40)

    def test_protected_environment(self):
        config = {'can_admins_bypass': False, 'deployment_branch_policy': {'custom_branch_policies': True},
            'protection_rules': [{'type': 'required_reviewers', 'reviewers': [{'type': 'User'}], 'prevent_self_review': True}]}
        branches = [{'name': 'main', 'type': 'branch'}]
        guard.validate_environment(config, branches)
        for broken in [dict(config, can_admins_bypass=True), dict(config, protection_rules=[]),
                       dict(config, deployment_branch_policy=None)]:
            with self.assertRaises(RuntimeError):
                guard.validate_environment(broken, branches)
        with self.assertRaises(RuntimeError):
            guard.validate_environment(config, [{'name': '*', 'type': 'branch'}])
        with self.assertRaises(RuntimeError):
            guard.validate_environment(config, [{'name': 'main', 'type': 'tag'}])

    def test_manual_backup_binding_freshness_and_retention(self):
        guard.validate_attestation(self.record, SHA, 'backup_123', 'a' * 20, NOW)
        for field, value in [('release_sha', 'b' * 40), ('project_ref', 'c' * 20),
            ('restore_verified', False), ('retained', False), ('backup_at', '2026-10-18T00:00:00+00:00'),
            ('restore_verified_at', '2026-10-21T00:00:00+00:00'),
            ('retained_until', '2026-10-21T00:00:00+00:00'), ('backup_sha256', '')]:
            with self.subTest(field=field), self.assertRaises(RuntimeError):
                guard.validate_attestation(dict(self.record, **{field: value}), SHA, 'backup_123', 'a' * 20, NOW)

    def test_database_target_tls_and_pooler_mode(self):
        project = 'a' * 20
        good = f'postgresql://postgres:placeholder@db.{project}.supabase.co:5432/postgres?sslmode=require'
        self.assertEqual(backend.db_environment(good, project)['PGSSLMODE'], 'require')
        for bad in [good.replace(project, 'b' * 20), good.replace('require', 'disable'),
                    good.replace(':5432/', ':6543/'), good.replace('.supabase.co', '.example.com')]:
            with self.assertRaises(RuntimeError):
                backend.db_environment(bad, project)

    def test_dist_rejects_environment_source_symlink_and_worker(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'index.html').write_text('<html></html>')
            self.assertEqual(len(pages.validate_dist(root)), 1)
            for name in ['.env', 'key.pem', 'app.js.map', '_worker.js', 'package.json']:
                with self.subTest(name=name):
                    (root / name).write_text('do not upload')
                    with self.assertRaises(RuntimeError):
                        pages.validate_dist(root)
                    (root / name).unlink()
            (root / 'link.js').symlink_to(root / 'index.html')
            with self.assertRaises(RuntimeError):
                pages.validate_dist(root)

    def test_command_failure_does_not_leak_subprocess_output(self):
        import subprocess
        result = subprocess.CompletedProcess([], 1, 'secret-token', 'private-database-url')
        with patch('backend.subprocess.run', return_value=result), self.assertRaises(RuntimeError) as caught:
            backend.run(['unused'])
        self.assertNotIn('secret-token', str(caught.exception))
        self.assertNotIn('private-database-url', str(caught.exception))

    def test_migration_digest_matches_reviewed_file(self):
        import hashlib
        root = Path(__file__).resolve().parents[2]
        self.assertEqual(hashlib.sha256((root / 'supabase/migrations' / backend.MIGRATION).read_bytes()).hexdigest(), backend.DIGEST)

class BackendFailureTests(unittest.TestCase):
    def setUp(self):
        self.project = 'a' * 20
        self.env = {'SUPABASE_PROJECT_REF': self.project,
            'SUPABASE_DB_URL': f'postgresql://postgres:placeholder@db.{self.project}.supabase.co:5432/postgres?sslmode=require'}
        self.versions = [p.name.split('_')[0] for p in sorted(Path('supabase/migrations').glob('*.sql'))]

    def test_unknown_history_never_reaches_push_or_function_deploy(self):
        with patch.dict('os.environ', self.env), patch('backend.run', return_value='unknown\n') as run:
            with self.assertRaises(RuntimeError):
                backend.main()
            self.assertEqual(run.call_count, 1)

    def test_changed_rows_stop_before_edge_deployment(self):
        with patch.dict('os.environ', self.env), patch('backend.run', return_value='\n'.join(self.versions)) as run, \
             patch('backend.snapshot', side_effect=[[{'hash': 'before'}], [{'hash': 'after'}]]):
            with self.assertRaises(RuntimeError):
                backend.main()
            self.assertEqual(run.call_count, 1)

    def test_only_pending_reviewed_migration_is_applied(self):
        with patch.dict('os.environ', self.env), patch('backend.run', side_effect=['\n'.join(self.versions[:-1]), '', '', '']) as run, \
             patch('backend.snapshot', return_value=[{'hash': 'preserved'}]), contextlib.redirect_stdout(io.StringIO()):
            backend.main()
        calls = [call.args[0] for call in run.call_args_list]
        self.assertEqual(calls[1][1:3], ['db', 'push'])
        self.assertIn('--dry-run', calls[1])
        self.assertIn('--yes', calls[2])
        self.assertIn('--skip-vault', calls[1])
        self.assertIn('--skip-vault', calls[2])
        self.assertEqual(calls[3][1:4], ['functions', 'deploy', 'apply-mutation'])

    def test_public_configuration_rejects_service_role(self):
        import base64
        import hosted_sync
        claims = base64.urlsafe_b64encode(b'{"role":"service_role"}').decode().rstrip('=')
        with patch.dict('os.environ', {'SUPABASE_PROJECT_REF': self.project, 'SUPABASE_PUBLISHABLE_KEY': 'eyJ.' + claims + '.signature'}):
            with self.assertRaises(RuntimeError):
                hosted_sync.public_config()


if __name__ == '__main__':
    unittest.main()
