"""Synthetic catalog/RLS drift and actual READ ONLY enforcement, network none."""
import subprocess
import unittest
from unittest.mock import patch

import audit_only as audit
import audit_reference


class AuditDatabaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.database = audit_reference.isolated_database()
        cls.name, sql = cls.database.__enter__()
        cls.sql = staticmethod(sql)
        cls.addClassCleanup(cls.database.__exit__,None,None,None)
        cls.reference, _ = audit.parse_capture(cls.sql(audit.CATALOG.read_text()))

    def observation(self):
        observed, history = audit.parse_capture(self.sql(audit.CATALOG.read_text()))
        # Isolated Unix socket has no TLS. Production comparison rejects this;
        # mark only the in-memory synthetic fixture for schema comparison tests.
        self.assertFalse(observed['tls'])
        observed['tls'] = True
        return observed, history

    def test_baseline_missing_history_is_observed_not_repaired(self):
        observed, history = self.observation()
        report, passed = audit.compare(self.reference,observed,history)
        self.assertFalse(passed)
        self.assertIn('history: MISSING_REVIEW_REQUIRED',report)
        self.assertNotIn(': REVIEW_REQUIRED',report)
        self.assertEqual(self.sql("select to_regclass('supabase_migrations.schema_migrations') is null;"),'t\n')

    def test_history_exact_partial_and_new_version(self):
        self.sql('create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key);')
        try:
            observed, history = self.observation()
            self.assertIn('EMPTY_REVIEW_REQUIRED',audit.compare(self.reference,observed,history)[0])
            for version in audit.VERSIONS:
                self.sql(f"insert into supabase_migrations.schema_migrations values ('{version}');")
            observed, history = self.observation()
            self.assertTrue(audit.compare(self.reference,observed,history)[1])
            self.sql("insert into supabase_migrations.schema_migrations values ('202610200001');")
            observed, history = self.observation()
            self.assertFalse(audit.compare(self.reference,observed,history)[1])
        finally:
            self.sql('drop schema supabase_migrations cascade;')

    def test_rls_grant_constraint_function_and_planning_drift(self):
        cases = [
            ('alter table public.todos disable row level security;', 'tables'),
            ('grant delete on public.applied_operations to authenticated;', 'table_grants'),
            ('alter table public.todos drop constraint todos_text_check;', 'constraints'),
            ("create or replace function public.bootstrap_workspace() returns uuid language sql as $$select null::uuid;$$;",'functions'),
            ('alter table public.todos add column planning jsonb;', 'columns'),
            ('drop policy todos_member_all on public.todos;', 'policies'),
            ('drop index public.todos_workspace_rank_idx;', 'indexes'),
            ('alter publication supabase_realtime drop table public.todos;', 'publication'),
            ('alter role authenticated bypassrls;', 'client_roles'),
        ]
        # Each synthetic alteration is rolled back on the same session after capture.
        for change, category in cases:
            with self.subTest(category=category):
                query = audit.CATALOG.read_text().replace('begin isolation level repeatable read read only;',
                    'begin;\n' + change + "\nset local default_transaction_read_only=on;")
                # This fixture transaction wrote synthetic DDL, so cannot become READ ONLY.
                query = query.replace("current_setting('transaction_read_only')", "'on'")
                observed, history = audit.parse_capture(self.sql(query))
                observed['tls'] = True
                report, passed = audit.compare(self.reference,observed,history)
                self.assertFalse(passed)
                self.assertIn(category + ': REVIEW_REQUIRED',report)
        unchanged, _ = self.observation()
        self.assertEqual(unchanged['schema'],self.reference['schema'])

    def test_read_only_transaction_rejects_ddl_dml_and_ledger_creation(self):
        for statement in ('alter table public.todos add column forbidden text;',
                          "insert into public.workspaces default values;",
                          'create schema supabase_migrations;',
                          'delete from public.todos;'):
            with self.subTest(statement=statement):
                result = subprocess.run(['docker','exec','-i',self.name,'psql','-U','postgres',
                    '-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],
                    input='begin read only;\n'+statement+'\nrollback;',text=True,capture_output=True)
                self.assertNotEqual(result.returncode,0)
                # Prove PostgreSQL rejected writes because of READ ONLY, not a SQL error.
                self.assertIn('25006',result.stderr)
        self.assertEqual(self.sql('select count(*) from public.workspaces;'),'0\n')

    def test_real_psql_errors_produce_safe_sqlstate_diagnostics(self):
        cases = [('begin read only; create schema diagnostic_probe;', '25006'),
                 ('select secret_diagnostic_column;', '42703'),
                 ('set role anon; select * from public.applied_operations;', '42501')]
        for sql, state in cases:
            with self.subTest(state=state):
                result = subprocess.run(['docker', 'exec', '-i', self.name, 'psql',
                    '-U', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
                    '-v', 'VERBOSITY=sqlstate'], input=sql, text=True, capture_output=True)
                self.assertEqual(result.returncode, 3)
                self.assertEqual(audit.query_sqlstate(result.stderr), state)
                self.assertNotIn('secret_diagnostic_column', result.stderr)
                with patch('audit_only.subprocess.run', return_value=result), \
                     self.assertRaises(audit.AuditFailure) as caught:
                    audit.capture({})
                self.assertEqual(caught.exception.diagnostic(),
                    f'stage=query error=query_failed sqlstate={state}')


if __name__ == '__main__':
    unittest.main()
