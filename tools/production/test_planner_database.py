"""Real PostgreSQL planner protocol with hosted default grants; synthetic only."""
import json
from pathlib import Path
import unittest
import uuid
from audit_reference import isolated_database

USER = '11111111-1111-4111-8111-111111111111'
OTHER = '22222222-2222-4222-8222-222222222222'
WORKSPACE = '33333333-3333-4333-8333-333333333333'


class PlannerDatabaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        context = isolated_database(hosted=True)
        _, sql = context.__enter__()
        cls.addClassCleanup(context.__exit__, None, None, None)
        cls.sql = staticmethod(sql)
        root = Path(__file__).resolve().parents[2]
        sql((root / 'supabase/migrations/202610250001_planner_sync.sql').read_text())
        sql(f"insert into auth.users(id) values('{USER}'),('{OTHER}');"
            f"insert into workspaces(id) values('{WORKSPACE}');"
            f"insert into workspace_members(workspace_id,user_id) values('{WORKSPACE}','{USER}');")

    def setUp(self):
        self.id = str(uuid.uuid4())
        self.event = dict(id=self.id, workspaceId=WORKSPACE, title='Synthetic planner test',
                          start='2026-10-25T09:00', end='2026-10-25T10:00', allDay=False,
                          timeZone='Asia/Hong_Kong', color='purple', notes='', location='', url='',
                          deletedAt=None, exceptions={})

    def as_user(self, query, user=USER):
        return self.sql(f"set role authenticated; set request.jwt.claim.sub='{user}';" + query).strip()

    def mutate(self, version, payload=None, operation=None, user=USER):
        value = json.dumps(self.event if payload is None else payload).replace("'", "''")
        return json.loads(self.as_user(
            f"select apply_planner_mutation('{operation or uuid.uuid4()}','{WORKSPACE}',"
            f"'event','{self.id}',{version},'{value}'::jsonb);", user))

    def test_hosted_defaults_do_not_grant_truncate_or_direct_mutation(self):
        for role in ('anon', 'authenticated'):
            for table in ('planner_records', 'planner_receipts'):
                for privilege in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'):
                    self.assertEqual(self.sql(f"select has_table_privilege('{role}','{table}','{privilege}');").strip(), 'f')

    def test_retry_binds_payload_and_cas_preserves_remote_edit(self):
        op = str(uuid.uuid4())
        first = self.mutate(0, operation=op)
        self.assertEqual(first, self.mutate(0, operation=op))
        changed = dict(self.event, title='Changed offline')
        with self.assertRaises(RuntimeError):
            self.mutate(0, changed, op)
        self.assertEqual(self.mutate(1, changed)['status'], 'applied')
        conflict = self.mutate(1)
        self.assertEqual(conflict['status'], 'conflict')
        self.assertEqual(conflict['record']['payload']['title'], 'Changed offline')

    def test_non_member_cannot_read_or_replay_receipt(self):
        op = str(uuid.uuid4())
        self.mutate(0, operation=op)
        self.assertEqual(self.as_user(f"select count(*) from planner_records where workspace_id='{WORKSPACE}';", OTHER), '0')
        with self.assertRaises(RuntimeError):
            self.mutate(0, operation=op, user=OTHER)

    def test_tombstone_cannot_be_overwritten_by_stale_client(self):
        self.mutate(0)
        self.mutate(1, dict(self.event, deletedAt='2026-10-25T00:00:00Z'))
        stale = self.mutate(1)
        self.assertEqual(stale['status'], 'conflict')
        self.assertTrue(stale['record']['payload']['deletedAt'])

    def test_invalid_event_never_creates_row(self):
        with self.assertRaises(RuntimeError):
            self.mutate(0, dict(self.event, end=self.event['start']))
        self.assertEqual(self.as_user(f"select count(*) from planner_records where id='{self.id}';"), '0')


if __name__ == '__main__':
    unittest.main()
