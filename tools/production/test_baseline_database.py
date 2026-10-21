"""Real isolated PostgreSQL: default ACL profile and atomic ledger adoption."""
import json
import subprocess
import unittest

import adopt_baseline
import audit_only
import audit_reference
import baseline_profile


class BaselineDatabaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.database = audit_reference.isolated_database(hosted=True)
        cls.name, sql = cls.database.__enter__()
        cls.sql = staticmethod(sql)
        cls.addClassCleanup(cls.database.__exit__, None, None, None)
        cls.reference, _ = audit_only.parse_capture(cls.sql(audit_only.CATALOG.read_text()))
        cls.reference['hosted_schema'] = cls.reference['schema']

    def observation(self):
        catalog, history = audit_only.parse_capture(self.sql(audit_only.CATALOG.read_text()))
        catalog['client_tls'] = True  # synthetic socket only; production capture enforces TLS
        return catalog, history

    def run_sql(self, sql):
        return subprocess.run(['docker', 'exec', '-i', self.name, 'psql', '-U', 'postgres',
            '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], input=sql, text=True, capture_output=True)

    def test_hosted_defaults_preserve_explicit_revokes_and_match_observed_profile(self):
        observed, _ = self.observation()
        self.assertTrue(baseline_profile.matches(self.reference, observed))
        grants = observed['schema']['table_grants']
        self.assertFalse(any(g['table_name'] == 'pairing_attempts' and g['grantee'] in ('anon', 'authenticated') for g in grants))
        self.assertTrue(any(g['table_name'] == 'todos' and g['grantee'] == 'anon' and g['privilege_type'] == 'TRUNCATE' for g in grants))
        changed = json.loads(json.dumps(observed))
        changed['schema']['table_grants'].pop()
        self.assertFalse(baseline_profile.matches(self.reference, changed))

    def test_atomic_adoption_preserves_rows_schema_and_does_not_mark_planning(self):
        self.sql("insert into public.workspaces(id) values ('00000000-0000-0000-0000-000000000001');")
        try:
            before, missing = self.observation()
            rows_before = self.sql('select row_to_json(w) from public.workspaces w;')
            self.assertTrue(adopt_baseline.require_baseline(self.reference, before, missing))
            self.sql(adopt_baseline.adoption_sql(before))
            after, history = self.observation()
            self.assertFalse(adopt_baseline.require_baseline(self.reference, after, history))
            self.assertEqual(history['versions'], list(audit_only.VERSIONS))
            self.assertEqual(before['schema'], after['schema'])
            self.assertEqual(rows_before, self.sql('select row_to_json(w) from public.workspaces w;'))
            self.assertEqual(self.sql("select has_table_privilege('anon','supabase_migrations.schema_migrations','SELECT');"), 'f\n')
            # A raced/repeated SQL write must reject the existing ledger.
            self.assertNotEqual(self.run_sql(adopt_baseline.adoption_sql(before)).returncode, 0)
            self.assertEqual(self.observation()[1], history)
        finally:
            self.sql("drop schema if exists supabase_migrations cascade; delete from public.workspaces where id='00000000-0000-0000-0000-000000000001';")

    def test_raced_schema_change_rolls_back_without_creating_ledger(self):
        before, _ = self.observation()
        self.sql('alter table public.todos disable row level security;')
        try:
            result = self.run_sql(adopt_baseline.adoption_sql(before))
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('Catalog changed since review', result.stderr)
            self.assertEqual(self.sql("select to_regclass('supabase_migrations.schema_migrations') is null;"), 't\n')
        finally:
            self.sql('alter table public.todos enable row level security;')


if __name__ == '__main__':
    unittest.main()
