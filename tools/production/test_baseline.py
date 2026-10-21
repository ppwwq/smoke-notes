"""Fail-closed hosted comparison, explicit consent and metadata-only SQL."""
import copy
import hashlib
import os
import unittest
from unittest.mock import patch

import adopt_baseline
import audit_details
import audit_only
import baseline_profile


class BaselineTests(unittest.TestCase):
    def setUp(self):
        self.schema = {key: [] for key in audit_only.CATEGORIES}
        self.function = {'owner': 'postgres',
            'definition': 'CREATE OR REPLACE FUNCTION public.is_workspace_member()\n RETURNS boolean\n LANGUAGE sql\nAS $function$select true;$function$\n',
            'acl': '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'}
        self.schema['functions'] = [self.function]
        self.reference = {'major': 17, 'schema': copy.deepcopy(self.schema),
                          'hosted_schema': copy.deepcopy(self.schema)}
        self.observed = {'major': 17, 'schema': copy.deepcopy(self.schema), 'client_tls': True}
        sha, project = 'a' * 40, adopt_baseline.PROJECT
        self.env = {'RELEASE_SHA': sha, 'SUPABASE_PROJECT_REF': project,
            'BASELINE_OPERATION': 'adopt_baseline', 'RELEASE_MODE': 'no_backup',
            'BASELINE_ACK': f'ADOPT_PRIOR_SEVEN_KEEP_DATA:{sha}:{project}',
            'NO_BACKUP_RISK_ACK': f'I_ACCEPT_DATA_LOSS_WITHOUT_BACKUP:{sha}:{project}'}

    def test_explicit_target_operation_and_risk_ack_before_any_connection(self):
        adopt_baseline.validate_inputs(self.env)
        for key in self.env:
            with self.subTest(key=key), patch.dict(os.environ, dict(self.env, **{key: 'wrong'}), clear=True), \
                    patch('audit_only.capture') as capture, self.assertRaises(RuntimeError):
                adopt_baseline.main('not-read')
            capture.assert_not_called()
        with self.assertRaises(RuntimeError):
            adopt_baseline.validate_inputs(dict(self.env, BACKUP_EVIDENCE_ID='fabricated'))

    def test_every_category_tls_and_version_remain_enforced(self):
        self.assertTrue(baseline_profile.matches(self.reference, self.observed))
        for category in audit_only.CATEGORIES:
            changed = copy.deepcopy(self.observed)
            changed['schema'][category] = [{'unexpected': 'must-not-be-accepted'}]
            self.assertFalse(baseline_profile.matches(self.reference, changed), category)
        for change in ({'client_tls': False}, {'major': 16}, {'schema': {}}):
            self.assertFalse(baseline_profile.matches(self.reference, dict(self.observed, **change)))

    def test_acl_order_and_final_newline_are_not_permission_or_code_changes(self):
        other = copy.deepcopy(self.function)
        other['acl'] = '{service_role=X/postgres,authenticated=X/postgres,postgres=X/postgres}'
        other['definition'] = other['definition'].rstrip('\n')
        self.assertTrue(baseline_profile.functions_match([self.function], [other]))
        for acl in (None, '{}', other['acl'].replace('authenticated=X', 'anon=X'),
                    other['acl'].replace('service_role=X', 'service_role=X*')):
            self.assertFalse(baseline_profile.functions_match([self.function], [dict(other, acl=acl)]))

    def test_only_exact_reviewed_body_pair_can_differ(self):
        other = copy.deepcopy(self.function)
        other['definition'] = other['definition'].replace('select true;', 'select\ntrue;')
        self.assertFalse(baseline_profile.functions_match([self.function], [other]))
        pair = tuple(hashlib.sha256(body.encode()).hexdigest() for body in ('select true;', 'select\ntrue;'))
        with patch.dict(audit_details.REVIEWED_FORMAT_PAIRS, {'is_workspace_member': pair}):
            self.assertTrue(baseline_profile.functions_match([self.function], [other]))
            other['definition'] = other['definition'].replace('true', 'false')
            self.assertFalse(baseline_profile.functions_match([self.function], [other]))
        for key, value in [('owner', 'anon'), ('definition', self.function['definition'].replace('boolean', 'text'))]:
            self.assertFalse(baseline_profile.functions_match([self.function], [dict(self.function, **{key: value})]))

    def test_missing_history_requires_separate_adoption_exact_history_is_idempotent(self):
        missing = {'exists': False, 'versions': []}
        exact = {'exists': True, 'versions': list(audit_only.VERSIONS)}
        self.assertTrue(adopt_baseline.require_baseline(self.reference, self.observed, missing))
        self.assertFalse(adopt_baseline.require_baseline(self.reference, self.observed, exact))
        self.assertFalse(audit_only.compare(self.reference, self.observed, missing)[1])
        for history in ({'exists': True, 'versions': []},
                        {'exists': True, 'versions': list(audit_only.VERSIONS[:-1])},
                        {'exists': True, 'versions': list(audit_only.VERSIONS) + ['202610200001']}):
            with self.assertRaises(RuntimeError):
                adopt_baseline.require_baseline(self.reference, self.observed, history)

    def test_sql_rechecks_catalog_under_locks_and_only_writes_new_ledger(self):
        sql = adopt_baseline.adoption_sql(self.observed)
        self.assertLess(sql.index('lock table'), sql.index('Catalog changed since review'))
        self.assertLess(sql.index('History appeared'), sql.index('create table supabase_migrations'))
        for version in audit_only.VERSIONS:
            self.assertIn(f"('{version}',", sql)
        self.assertNotIn('202610200001', sql)
        for forbidden in ('update public.', 'insert into public.', 'delete from', 'truncate ',
                          'create or replace function', 'grant all', 'alter table'):
            self.assertNotIn(forbidden, sql.lower())
        self.assertIn('commit;', sql)

    def test_baseline_workflow_is_separate_from_audit_and_release(self):
        text = (audit_only.ROOT / '.github/workflows/release-production.yml').read_text()
        section = text.split('\n  baseline:\n', 1)[1].split('\n  backend:\n', 1)[0]
        self.assertIn("inputs.operation == 'adopt_baseline'", section)
        self.assertIn('environment: production-backend', section)
        self.assertEqual(section.count('secrets.'), 1)
        self.assertIn('secrets.SUPABASE_DB_URL', section)
        self.assertLess(section.index('validate_inputs'), section.index('secrets.SUPABASE_DB_URL'))
        for forbidden in ('backend.py', 'pages.py', 'RELEASE_ENABLED', 'SUPABASE_ACCESS_TOKEN',
                          'CLOUDFLARE', 'upload-artifact', 'supabase db'):
            self.assertNotIn(forbidden, section)


if __name__ == '__main__':
    unittest.main()
