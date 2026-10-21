"""No-backup opt-in must not weaken identity, environment or backup-mode gates."""
import contextlib
import copy
import datetime as dt
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import guard

SHA = 'a' * 40
PROJECT = 'b' * 20
NOW = dt.datetime(2026, 10, 21, 3, tzinfo=dt.timezone.utc)


class ReleasePolicyTests(unittest.TestCase):
    def setUp(self):
        self.env = {'RELEASE_SHA': SHA, 'SUPABASE_PROJECT_REF': PROJECT,
            'RELEASE_ENABLED': 'true', 'RELEASE_MODE': 'no_backup',
            'NO_BACKUP_RISK_ACK': f'I_ACCEPT_DATA_LOSS_WITHOUT_BACKUP:{SHA}:{PROJECT}',
            'BACKUP_EVIDENCE_ID': '', 'GITHUB_REPOSITORY': guard.REPO,
            'GITHUB_EVENT_NAME': 'workflow_dispatch', 'GITHUB_REF': 'refs/heads/main',
            'GITHUB_WORKFLOW_REF': f'{guard.REPO}/{guard.WORKFLOW}@refs/heads/main',
            'GITHUB_SHA': SHA, 'GITHUB_WORKFLOW_SHA': SHA}
        self.config = {'can_admins_bypass': False,
            'deployment_branch_policy': {'custom_branch_policies': True},
            'protection_rules': [{'type': 'required_reviewers', 'prevent_self_review': True,
                                  'reviewers': [{'type': 'User'}]}]}
        self.branches = {'total_count': 1, 'branch_policies': [{'name': 'main', 'type': 'branch'}]}

    def responses(self, config=None):
        config = self.config if config is None else config
        return [{'object': {'sha': SHA}}, config, self.branches, config, self.branches]

    def test_no_backup_is_honest_and_does_not_parse_or_create_attestation(self):
        env = dict(self.env, BACKUP_RESTORE_ATTESTATION='invalid old JSON is not evidence')
        with patch('guard.validate_attestation') as attestation:
            report = guard.validate_release_policy(env, NOW)
        attestation.assert_not_called()
        self.assertIn('NO BACKUP', report)
        self.assertIn('no backup or restore is claimed', report)
        self.assertNotIn(self.env['NO_BACKUP_RISK_ACK'], report)

    def test_no_backup_rejects_missing_or_wrong_ack_target_sha_and_enablement(self):
        for field, value in [('NO_BACKUP_RISK_ACK', ''), ('NO_BACKUP_RISK_ACK', 'yes'),
                ('RELEASE_SHA', 'c' * 40), ('SUPABASE_PROJECT_REF', 'd' * 20),
                ('SUPABASE_PROJECT_REF', '../wrong'), ('RELEASE_ENABLED', 'false'),
                ('BACKUP_EVIDENCE_ID', 'invented_evidence'), ('RELEASE_MODE', 'unknown')]:
            with self.subTest(field=field, value=value), self.assertRaises(RuntimeError):
                guard.validate_release_policy(dict(self.env, **{field: value}), NOW)

    def test_default_backup_mode_still_requires_real_attestation_fields(self):
        env = {k: v for k, v in self.env.items() if k not in ('RELEASE_MODE', 'NO_BACKUP_RISK_ACK')}
        with self.assertRaises(RuntimeError):
            guard.validate_release_policy(env, NOW)
        record = {'release_sha': SHA, 'project_ref': PROJECT, 'evidence_id': 'backup_123',
            'restore_verified': True, 'retained': True, 'isolated_restore_target': 'isolated',
            'reviewer': 'reviewer', 'backup_sha256': 'c' * 64,
            'backup_at': '2026-10-21T01:00:00+00:00',
            'restore_verified_at': '2026-10-21T02:00:00+00:00',
            'retained_until': '2026-11-01T00:00:00+00:00'}
        env.update(BACKUP_EVIDENCE_ID='backup_123', BACKUP_RESTORE_ATTESTATION=json.dumps(record))
        self.assertIn('Manual backup attestation accepted', guard.validate_release_policy(env, NOW))
        record['restore_verified'] = False
        env['BACKUP_RESTORE_ATTESTATION'] = json.dumps(record)
        with self.assertRaises(RuntimeError):
            guard.validate_release_policy(env, NOW)

    def test_no_backup_cannot_bypass_main_or_workflow_identity(self):
        for field, value in [('GITHUB_REF', 'refs/heads/feature'), ('GITHUB_REF', 'refs/tags/main'),
                ('GITHUB_WORKFLOW_SHA', 'c' * 40), ('GITHUB_REPOSITORY', 'other/repo'),
                ('GITHUB_EVENT_NAME', 'push')]:
            with self.subTest(field=field, value=value), \
                 patch.dict('os.environ', dict(self.env, **{field: value}), clear=True), \
                 patch('sys.argv', ['guard.py', '--release']), \
                 patch('guard.api', side_effect=self.responses()), self.assertRaises(RuntimeError):
                guard.main()

    def test_no_backup_cannot_bypass_environment_review_or_admin_rules(self):
        variants = [dict(self.config, can_admins_bypass=True), dict(self.config, protection_rules=[])]
        self_review = copy.deepcopy(self.config)
        self_review['protection_rules'][0]['prevent_self_review'] = False
        variants.append(self_review)
        for config in variants:
            with self.subTest(config=config), patch.dict('os.environ', self.env, clear=True), \
                 patch('sys.argv', ['guard.py', '--release']), \
                 patch('guard.api', side_effect=self.responses(config)), self.assertRaises(RuntimeError):
                guard.main()

    def test_success_summary_records_no_backup_without_fabricating_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            summary = Path(directory) / 'summary.md'
            with patch.dict('os.environ', dict(self.env, GITHUB_STEP_SUMMARY=str(summary)), clear=True), \
                 patch('sys.argv', ['guard.py', '--release']), \
                 patch('guard.api', side_effect=self.responses()) as api, \
                 contextlib.redirect_stdout(io.StringIO()):
                guard.main()
            self.assertEqual(api.call_count, 5)
            self.assertIn('NO BACKUP', summary.read_text())
            self.assertNotIn('attestation accepted', summary.read_text())


if __name__ == '__main__':
    unittest.main()
