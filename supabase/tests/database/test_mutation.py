"""Run real PostgreSQL mutation tests in an isolated, disposable Docker container.

Usage: python3 supabase/tests/database/test_mutation.py
Requires Docker and the official postgres:17-alpine image. No ports are exposed;
Supabase's auth roles/uid function are represented by a minimal local fixture.
"""

import concurrent.futures
import json
import pathlib
import subprocess
import time
import unittest
import uuid


ROOT = pathlib.Path(__file__).resolve().parents[3]
USER = "00000000-0000-0000-0000-000000000001"
OTHER_USER = "00000000-0000-0000-0000-000000000002"
MEMBER = "00000000-0000-0000-0000-000000000003"
WORKSPACE = "10000000-0000-0000-0000-000000000001"
OTHER_WORKSPACE = "10000000-0000-0000-0000-000000000002"
NOTEBOOK = "20000000-0000-0000-0000-000000000001"
OTHER_NOTEBOOK = "20000000-0000-0000-0000-000000000002"
NOTE = "30000000-0000-0000-0000-000000000001"
OTHER_NOTE = "30000000-0000-0000-0000-000000000002"


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


class AtomicMutationTests(unittest.TestCase):
    container = "smoke-notes-db-test-" + uuid.uuid4().hex[:12]

    @classmethod
    def sql(cls, query, *, check=True):
        return subprocess.run(
            ["docker", "exec", "-i", cls.container, "psql", "-U", "postgres",
             "-v", "ON_ERROR_STOP=1", "-qAt"],
            input=query, capture_output=True, text=True, check=check,
        )

    @classmethod
    def setUpClass(cls):
        subprocess.run(
            ["docker", "run", "--rm", "--detach", "--network", "none",
             "--name", cls.container, "--env", "POSTGRES_HOST_AUTH_METHOD=trust",
             "postgres:17-alpine", "-c", "wal_level=logical"],
            check=True, capture_output=True, text=True,
        )
        cls.addClassCleanup(
            subprocess.run, ["docker", "rm", "-f", cls.container],
            capture_output=True, check=False,
        )
        for _ in range(60):
            ready = subprocess.run(
                ["docker", "exec", cls.container, "pg_isready", "-U", "postgres"],
                capture_output=True,
            )
            if ready.returncode == 0:
                break
            time.sleep(0.25)
        else:
            raise RuntimeError("Local PostgreSQL did not start")
        cls.sql("""
          create role anon;
          create role authenticated;
          create schema auth;
          create table auth.users(id uuid primary key, aud text, role text);
          create function auth.uid() returns uuid language sql stable as $$
            select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
          $$;
          grant usage on schema auth to anon, authenticated;
          create publication supabase_realtime;
        """)
        baseline = json.loads((ROOT / "supabase/migration-baseline.json").read_text())
        baseline_end = list(baseline["migrations"])[-1]
        for migration in sorted((ROOT / "supabase/migrations").glob("*.sql")):
            try:
                cls.sql(migration.read_text())
                if migration.name == baseline_end:
                    result = cls.sql((ROOT / "tools/deployment/baseline-check.sql").read_text())
                    if result.stdout.strip() != "t":
                        raise RuntimeError("Frozen baseline catalog checks failed in local PostgreSQL")
            except subprocess.CalledProcessError as error:
                raise RuntimeError(f"{migration.name}: {error.stderr}") from error

    def setUp(self):
        self.sql(f"""
          truncate auth.users, public.workspaces cascade;
          insert into auth.users(id) values ('{USER}'), ('{OTHER_USER}'), ('{MEMBER}');
          insert into public.workspaces(id) values ('{WORKSPACE}'), ('{OTHER_WORKSPACE}');
          insert into public.workspace_members(workspace_id, user_id, role) values
            ('{WORKSPACE}', '{USER}', 'owner'), ('{WORKSPACE}', '{MEMBER}', 'member'),
            ('{OTHER_WORKSPACE}', '{OTHER_USER}', 'owner');
          insert into public.notebooks(id, workspace_id, name, rank) values
            ('{NOTEBOOK}', '{WORKSPACE}', 'Notebook', 1),
            ('{OTHER_NOTEBOOK}', '{OTHER_WORKSPACE}', 'Private notebook', 1);
          insert into public.notes(id, notebook_id, title, body, rank) values
            ('{NOTE}', '{NOTEBOOK}', '', 'original', 1),
            ('{OTHER_NOTE}', '{OTHER_NOTEBOOK}', '', 'private', 1);
        """)

    def row(self, **overrides):
        return {
            "id": NOTE, "notebook_id": NOTEBOOK, "title": "", "body": "saved",
            "content_json": {"type": "doc", "content": [{"type": "paragraph"}]},
            "color": "amber", "kind": "note", "conflict_of": None,
            "rank": 1, "deleted_at": None, **overrides,
        }

    def call_sql(self, operation=None, *, entity="note", entity_id=NOTE,
                 version=1, row=None, user=USER):
        row = self.row() if row is None else row
        return f"""
          set role authenticated;
          set request.jwt.claim.sub = {literal(user)};
          select public.apply_workspace_mutation(
            {literal(operation or uuid.uuid4())}, {literal(entity)},
            {literal(entity_id)}, {version}, {literal(json.dumps(row))}::jsonb
          );
        """

    def call(self, *args, **kwargs):
        return json.loads(self.sql(self.call_sql(*args, **kwargs)).stdout)

    def assert_error(self, expected, *args, **kwargs):
        result = self.sql(self.call_sql(*args, **kwargs), check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(expected, result.stderr)

    def authenticated_sql(self, query, *, user=USER):
        return f"set role authenticated; set request.jwt.claim.sub = {literal(user)}; {query}"

    def concurrent_sql(self, lock_key, queries):
        blocker = subprocess.Popen(
            ["docker", "exec", "-i", self.container, "psql", "-U", "postgres", "-qAt"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True,
        )
        try:
            blocker.stdin.write(f"begin; select pg_advisory_xact_lock(hashtextextended({literal(lock_key)}, 0)); select 'locked';\n")
            blocker.stdin.flush()
            while blocker.stdout.readline().strip() != "locked":
                if blocker.poll() is not None:
                    self.fail("Could not hold the advisory lock")
            with concurrent.futures.ThreadPoolExecutor(max_workers=len(queries)) as pool:
                pending = [pool.submit(self.sql, query) for query in queries]
                for _ in range(100):
                    waiting = int(self.sql("select count(*) from pg_stat_activity where wait_event = 'advisory'").stdout)
                    if waiting >= len(queries):
                        break
                    time.sleep(0.05)
                blocker.stdin.write("commit;\n")
                blocker.stdin.close()
                blocker.wait(timeout=10)
                results = [future.result(timeout=10).stdout.strip() for future in pending]
            self.assertGreaterEqual(waiting, len(queries))
            return results
        finally:
            if not blocker.stdin.closed:
                blocker.stdin.close()
            blocker.wait(timeout=10)
            blocker.stdout.close()
            blocker.stderr.close()

    def rotate_sql(self, code_hash, *, workspace=WORKSPACE, user=USER):
        return self.authenticated_sql(
            f"select public.rotate_pairing_code({literal(workspace)}, {literal(code_hash)});",
            user=user,
        )

    def test_pairing_collision_preserves_previous_valid_code(self):
        old_hash, historical_hash = "a" * 64, "b" * 64
        self.sql(self.rotate_sql(old_hash))
        self.sql(f"""
          insert into public.pairing_codes(workspace_id, code_hash, created_by, expires_at, redeemed_at)
          values ('{OTHER_WORKSPACE}', '{historical_hash}', '{OTHER_USER}', now() - interval '1 day', now());
        """)
        result = self.sql(self.rotate_sql(historical_hash), check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("duplicate key", result.stderr)
        self.assertEqual(self.sql(f"select code_hash from public.pairing_codes where workspace_id = '{WORKSPACE}' and redeemed_at is null").stdout.strip(), old_hash)
        # The previous code remains redeemable after a failed replacement.
        redeemed = self.sql(self.authenticated_sql(f"select public.redeem_pairing_code('{old_hash}');", user=OTHER_USER))
        self.assertEqual(redeemed.stdout.strip(), WORKSPACE)

    def test_pairing_success_retires_only_previous_workspace_codes(self):
        self.sql(self.rotate_sql("a" * 64))
        self.sql(self.rotate_sql("b" * 64, workspace=OTHER_WORKSPACE, user=OTHER_USER))
        expiry = self.sql(self.rotate_sql("c" * 64)).stdout.strip()
        self.assertEqual(self.sql(f"select count(*) from public.pairing_codes where redeemed_at is null and expires_at > now()").stdout.strip(), "2")
        self.assertEqual(self.sql(f"select code_hash from public.pairing_codes where workspace_id = '{WORKSPACE}' and redeemed_at is null").stdout.strip(), "c" * 64)
        self.assertEqual(self.sql(f"select {literal(expiry)}::timestamptz > now() and {literal(expiry)}::timestamptz <= now() + interval '5 minutes'").stdout.strip(), "t")

    def test_pairing_retirement_failure_rolls_back_insert(self):
        self.sql(self.rotate_sql("a" * 64))
        self.sql("""
          create function public.reject_test_retirement() returns trigger language plpgsql as $$
          begin raise exception 'simulated_retirement_failure'; end; $$;
          create trigger reject_test_retirement before update on public.pairing_codes
            for each row execute function public.reject_test_retirement();
        """)
        try:
            result = self.sql(self.rotate_sql("b" * 64), check=False)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("simulated_retirement_failure", result.stderr)
            self.assertEqual(self.sql("select count(*) from public.pairing_codes").stdout.strip(), "1")
            self.assertEqual(self.sql("select code_hash from public.pairing_codes where redeemed_at is null").stdout.strip(), "a" * 64)
        finally:
            self.sql("drop trigger reject_test_retirement on public.pairing_codes; drop function public.reject_test_retirement();")

    def test_concurrent_pairing_rotations_leave_one_active_code(self):
        queries = [self.rotate_sql(character * 64) for character in "abcdef"]
        self.concurrent_sql("pairing:" + WORKSPACE, queries)
        self.assertEqual(self.sql("select count(*) from public.pairing_codes").stdout.strip(), "6")
        self.assertEqual(self.sql("select count(*) from public.pairing_codes where redeemed_at is null").stdout.strip(), "1")

    def test_pairing_rotation_validates_auth_membership_and_hash(self):
        cases = [
            (self.rotate_sql("a" * 64, user=""), "authentication_required"),
            (self.rotate_sql("a" * 64, user=OTHER_USER), "workspace_forbidden"),
            (self.rotate_sql("bad"), "invalid_code_hash"),
            (self.rotate_sql("a" * 64).replace("set role authenticated", "set role anon"), "permission denied"),
        ]
        for query, expected in cases:
            with self.subTest(expected=expected):
                result = self.sql(query, check=False)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(expected, result.stderr)
        self.assertEqual(self.sql("select count(*) from public.pairing_codes").stdout.strip(), "0")

    def test_concurrent_bootstrap_creates_one_workspace(self):
        self.sql(f"delete from public.workspace_members where user_id = '{USER}';")
        query = self.authenticated_sql("select public.bootstrap_workspace();")
        results = self.concurrent_sql(USER, [query] * 6)
        self.assertEqual(len(set(results)), 1)
        self.assertEqual(self.sql(f"select count(*) from public.workspace_members where user_id = '{USER}'").stdout.strip(), "1")
        self.assertEqual(self.sql("select count(*) from public.workspaces").stdout.strip(), "3")
        self.assertEqual(self.sql(query).stdout.strip(), results[0])

    def test_bootstrap_reuses_membership_and_rejects_missing_auth(self):
        query = "select public.bootstrap_workspace();"
        self.assertEqual(self.sql(self.authenticated_sql(query, user=MEMBER)).stdout.strip(), WORKSPACE)
        result = self.sql(self.authenticated_sql(query, user=""), check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("authentication_required", result.stderr)
        result = self.sql("set role anon; " + query, check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("permission denied", result.stderr)

    def test_lost_response_retry_returns_same_applied_result(self):
        operation = str(uuid.uuid4())
        first = self.call(operation)
        retried = self.call(operation)
        self.assertEqual(first, retried)
        self.assertEqual(first["status"], "applied")
        self.assertEqual(first["record"]["version"], 2)
        self.assertEqual(first["record"]["body"], "saved")
        self.assertEqual(self.sql("select count(*) from public.applied_operations").stdout.strip(), "1")

    def test_concurrent_identical_retries_have_one_applied_receipt(self):
        operation = str(uuid.uuid4())
        # Hold the operation lock so all calls overlap before they can read it.
        blocker = subprocess.Popen(
            ["docker", "exec", "-i", self.container, "psql", "-U", "postgres", "-qAt"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True,
        )
        blocker.stdin.write(f"begin; select pg_advisory_xact_lock(hashtextextended('operation:{operation}', 0)); select 'locked';\n")
        blocker.stdin.flush()
        while blocker.stdout.readline().strip() != "locked":
            if blocker.poll() is not None:
                self.fail("Could not hold the operation lock")
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            pending = [pool.submit(self.call, operation) for _ in range(6)]
            # Release only once all six sessions are blocked at an advisory lock.
            for _ in range(100):
                waiting = int(self.sql("select count(*) from pg_stat_activity where wait_event = 'advisory'").stdout)
                if waiting >= 6:
                    break
                time.sleep(0.05)
            blocker.stdin.write("commit;\n")
            blocker.stdin.close()
            blocker.wait(timeout=10)
            blocker.stdout.close()
            blocker.stderr.close()
            results = [future.result(timeout=10) for future in pending]
        self.assertGreaterEqual(waiting, 6)
        self.assertTrue(all(result == results[0] for result in results))
        self.assertEqual(results[0]["status"], "applied")
        self.assertEqual(results[0]["record"]["version"], 2)
        self.assertEqual(self.sql("select count(*) from public.applied_operations").stdout.strip(), "1")

    def test_concurrent_distinct_edits_preserve_a_real_conflict(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda text: self.call(row=self.row(body=text)), ["edit a", "edit b"]))
        self.assertEqual(sorted(result["status"] for result in results), ["applied", "conflict"])
        self.assertEqual(results[0]["record"], results[1]["record"])
        self.assertEqual(results[0]["record"]["version"], 2)

    def test_receipt_failure_rolls_back_note_change(self):
        self.sql("""
          create function public.reject_test_receipt() returns trigger language plpgsql as $$
          begin raise exception 'simulated_receipt_failure'; end;
          $$;
          create trigger reject_test_receipt before insert on public.applied_operations
            for each row execute function public.reject_test_receipt();
        """)
        try:
            self.assert_error("simulated_receipt_failure")
            saved = self.sql(f"select body || ':' || version from public.notes where id = '{NOTE}'").stdout.strip()
            self.assertEqual(saved, "original:1")
            self.assertEqual(self.sql("select count(*) from public.applied_operations").stdout.strip(), "0")
        finally:
            self.sql("drop trigger reject_test_receipt on public.applied_operations; drop function public.reject_test_receipt();")
        self.assertEqual(self.call()["status"], "applied")

    def test_conflict_retry_keeps_original_snapshot(self):
        self.call()
        operation = str(uuid.uuid4())
        conflict = self.call(operation)
        self.assertEqual(conflict["status"], "conflict")
        self.call(version=2, row=self.row(body="later edit"))
        self.assertEqual(self.call(operation), conflict)

    def test_cross_workspace_access_and_move_are_rejected(self):
        self.assert_error("workspace_forbidden", row=self.row(notebook_id=OTHER_NOTEBOOK))
        self.assert_error("workspace_forbidden", entity_id=OTHER_NOTE, row=self.row(id=OTHER_NOTE))
        self.assert_error("workspace_forbidden", entity_id=OTHER_NOTE, row=self.row(id=OTHER_NOTE, notebook_id=OTHER_NOTEBOOK))
        self.assert_error("workspace_forbidden", row=self.row(conflict_of=OTHER_NOTE))
        self.assertEqual(self.sql(f"select body from public.notes where id = '{OTHER_NOTE}'").stdout.strip(), "private")

    def test_operation_id_cannot_disclose_other_users_result(self):
        operation = str(uuid.uuid4())
        self.call(operation)
        self.assert_error("operation_id_conflict", operation, user=MEMBER)
        self.assert_error("operation_id_conflict", operation, user=OTHER_USER)

    def test_reused_operation_id_does_not_write_a_second_entity(self):
        operation = str(uuid.uuid4())
        first = self.call(operation)
        second_id = str(uuid.uuid4())
        reused = self.call(operation, entity_id=second_id, version=0, row=self.row(id=second_id))
        self.assertEqual(reused, first)
        self.assertEqual(self.sql(f"select count(*) from public.notes where id = '{second_id}'").stdout.strip(), "0")

    def test_client_cannot_forge_receipts(self):
        result = self.sql(f"""
          set role authenticated;
          set request.jwt.claim.sub = '{USER}';
          insert into public.applied_operations(id, user_id, result)
            values ('{uuid.uuid4()}', '{USER}', '{{"status":"applied"}}');
        """, check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("permission denied", result.stderr)

    def test_anonymous_and_missing_auth_are_rejected(self):
        anonymous = self.call_sql().replace("set role authenticated;", "set role anon;")
        result = self.sql(anonymous, check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("permission denied", result.stderr)
        self.assert_error("authentication_required", user="")

    def test_create_update_delete_and_server_owned_version(self):
        note_id = str(uuid.uuid4())
        created = self.call(entity_id=note_id, version=0, row=self.row(id=note_id, kind="todo", version=99))
        self.assertEqual(created["record"]["version"], 1)
        self.assertEqual(created["record"]["kind"], "todo")
        deleted = self.call(entity_id=note_id, row=self.row(id=note_id, deleted_at="2026-10-15T00:00:00Z"))
        self.assertEqual(deleted["record"]["version"], 2)
        self.assertIsNotNone(deleted["record"]["deleted_at"])

    def test_concurrent_create_is_idempotent(self):
        operation, note_id = str(uuid.uuid4()), str(uuid.uuid4())
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            pending = [pool.submit(self.call, operation, entity_id=note_id, version=0, row=self.row(id=note_id)) for _ in range(4)]
            results = [future.result() for future in pending]
        self.assertTrue(all(result == results[0] for result in results))
        self.assertEqual(results[0]["record"]["version"], 1)

    def test_notebooks_and_todos_use_same_atomic_path(self):
        for entity, row in [
            ("notebook", {"name": "New notebook"}),
            ("todo", {"text": "New todo", "completed": False}),
        ]:
            with self.subTest(entity=entity):
                entity_id, operation = str(uuid.uuid4()), str(uuid.uuid4())
                row.update(id=entity_id, workspace_id=WORKSPACE, rank=2, deleted_at=None)
                created = self.call(operation, entity=entity, entity_id=entity_id, version=0, row=row)
                self.assertEqual(created["record"]["version"], 1)
                self.assertEqual(self.call(operation, entity=entity, entity_id=entity_id, version=0, row=row), created)
                updated = self.call(entity=entity, entity_id=entity_id, row={**row, "rank": 3})
                self.assertEqual(updated["record"]["rank"], 3)
                self.assertEqual(updated["record"]["version"], 2)
                self.assert_error("workspace_forbidden", entity=entity, entity_id=entity_id, version=2, row={**row, "workspace_id": OTHER_WORKSPACE})

    def test_invalid_input_does_not_create_receipt(self):
        self.assert_error("invalid_operation", entity="unknown")
        self.assert_error("invalid_operation", row=self.row(id=OTHER_NOTE))
        self.assert_error("invalid_version", version=-1)
        self.assert_error("invalid_rank", row=self.row(rank="Infinity"))
        missing_id = str(uuid.uuid4())
        self.assert_error("missing_remote_record", entity_id=missing_id, row=self.row(id=missing_id))
        self.assertEqual(self.sql("select count(*) from public.applied_operations").stdout.strip(), "0")


if __name__ == "__main__":
    unittest.main(verbosity=2)
