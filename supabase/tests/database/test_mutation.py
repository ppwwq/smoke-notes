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
            logs = subprocess.run(
                ["docker", "logs", cls.container], capture_output=True, text=True,
            )
            # The image starts a temporary server during initialization, then
            # stops it. pg_isready alone can mistake that server for the final one.
            initialized = "PostgreSQL init process complete" in logs.stdout + logs.stderr
            if initialized and ready.returncode == 0:
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
        for migration in sorted((ROOT / "supabase/migrations").glob("*.sql")):
            try:
                cls.sql(migration.read_text())
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

    def test_extended_colors_round_trip_without_changing_other_records(self):
        other_before = self.sql(f"select to_jsonb(n) from public.notes n where id='{OTHER_NOTE}';").stdout
        colors = ('amber', 'rose', 'sage', 'sky', 'violet', 'graphite',
                  'lavender', 'mauve', 'mist', 'dustyrose', 'peach', 'clay')
        version = 1
        for color in colors:
            with self.subTest(color=color):
                result = self.call(version=version, row=self.row(color=color))
                self.assertEqual(result['status'], 'applied')
                stored = self.sql(f"select color from public.notes where id='{NOTE}';").stdout.strip()
                self.assertEqual(stored, color)
                version += 1
        rejected = self.sql(f"update public.notes set color='not-a-color' where id='{NOTE}';", check=False)
        self.assertNotEqual(rejected.returncode, 0)
        self.assertIn('notes_color_check', rejected.stderr)
        self.assertEqual(self.sql(f"select to_jsonb(n) from public.notes n where id='{OTHER_NOTE}';").stdout, other_before)

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

    def planned_row(self, entity_id=None, **planning):
        return {
            "id": entity_id or str(uuid.uuid4()), "workspace_id": WORKSPACE,
            "text": "Daily reading", "completed": False, "rank": 1,
            "deleted_at": None,
            "planning": {"version": 1, "kind": "task", "date": "2026-10-20",
                         "status": "open", "notes": "Keep this note", **planning},
        }

    def planned_call(self, row, version=0, **kwargs):
        return self.call(entity="todo", entity_id=row["id"], version=version, row=row, **kwargs)

    def test_planning_capability_requires_authentication(self):
        query = "select public.workspace_sync_capabilities();"
        result = self.sql(self.authenticated_sql(query))
        self.assertEqual(json.loads(result.stdout), {"todoPlanning": 1})
        for role, user, error in [("anon", USER, "permission denied"), ("authenticated", "", "authentication_required")]:
            result = self.sql(f"set role {role}; set request.jwt.claim.sub = {literal(user)}; {query}", check=False)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn(error, result.stderr)

    def test_planning_roundtrip_conflict_and_retry_keep_metadata(self):
        row = self.planned_row(clocks={"notes": {"at": "2026-10-20T00:00:00Z", "id": "edit-1"}})
        operation = str(uuid.uuid4())
        created = self.planned_call(row, operation=operation)
        self.assertEqual(created["record"]["planning"], row["planning"])
        self.assertEqual(created["todoPlanningVersion"], 1)
        self.assertEqual(self.planned_call(row, operation=operation), created)
        changed = {**row, "completed": True, "planning": {**row["planning"], "status": "completed", "completedAt": "2026-10-20T01:00:00Z"}}
        updated = self.planned_call(changed, version=1)
        stale = self.planned_call(row, version=1)
        self.assertEqual(stale["status"], "conflict")
        self.assertEqual(stale["record"], updated["record"])
        self.assertEqual(stale["todoPlanningVersion"], 1)

    def test_legacy_client_cannot_erase_existing_planning(self):
        row = self.planned_row()
        self.planned_call(row)
        legacy = {key: value for key, value in row.items() if key != "planning"}
        legacy.update(completed=True, text="old client edit")
        self.assert_error("todo_planning_client_required", entity="todo", entity_id=row["id"], version=1, row=legacy)
        saved = json.loads(self.sql(f"select to_jsonb(todos) from public.todos where id={literal(row['id'])}").stdout)
        self.assertEqual(saved["planning"], row["planning"])
        self.assertFalse(saved["completed"])
        self.assertEqual(saved["version"], 1)
        self.assertEqual(self.sql("select count(*) from public.applied_operations").stdout.strip(), "1")

    def test_two_devices_generate_one_instance_and_do_not_erase_completion(self):
        row = self.planned_row(kind="occurrence", seriesId=str(uuid.uuid4()), generated=True)
        queries = [self.call_sql(entity="todo", entity_id=row["id"], version=0, row=row, user=user) for user in [USER, MEMBER]]
        results = [json.loads(result) for result in self.concurrent_sql("todo:" + row["id"], queries)]
        self.assertEqual(sorted(result["status"] for result in results), ["applied", "conflict"])
        self.assertEqual(results[0]["record"], results[1]["record"])
        completed = {**row, "completed": True, "planning": {**row["planning"], "status": "completed", "generated": False}}
        self.planned_call(completed, version=1)
        replay = self.planned_call(row, user=MEMBER)
        self.assertEqual(replay["status"], "conflict")
        self.assertTrue(replay["record"]["completed"])
        self.assertEqual(replay["record"]["planning"]["status"], "completed")
        self.assertEqual(self.sql("select count(*) from public.todos").stdout.strip(), "1")

    def test_instance_date_unique_even_after_soft_delete(self):
        row = self.planned_row(kind="occurrence", seriesId=str(uuid.uuid4()))
        self.planned_call(row)
        self.planned_call({**row, "deleted_at": "2026-10-20T01:00:00Z"}, version=1)
        duplicate = {**row, "id": str(uuid.uuid4())}
        self.assert_error("todos_series_date_unique", entity="todo", entity_id=duplicate["id"], version=0, row=duplicate)
        self.assertEqual(self.sql("select count(*) from public.todos").stdout.strip(), "1")

    def test_occurrence_identity_cannot_be_reassigned(self):
        row = self.planned_row(kind="occurrence", seriesId=str(uuid.uuid4()))
        self.planned_call(row)
        for changes in [{"date": "2026-10-21"}, {"seriesId": str(uuid.uuid4())}, {"kind": "task"}]:
            changed = {**row, "planning": {**row["planning"], **changes}}
            self.assert_error("invalid_todo_planning", entity="todo", entity_id=row["id"], version=1, row=changed)
        self.assertEqual(self.sql("select count(*) from public.applied_operations").stdout.strip(), "1")

    def test_series_revisions_settings_and_audit_roundtrip(self):
        revision = {"id": "original", "effectiveFrom": "2026-10-19", "changedAt": "2026-10-19T00:00:00Z",
                    "text": "Read", "notes": "A book", "repeat": {"kind": "weekly", "weekdays": [1, 3, 5]},
                    "paused": False, "stopped": False}
        series = self.planned_row(kind="series", revisions=[revision])
        self.planned_call(series)
        revised = {**series, "planning": {**series["planning"], "revisions": [revision, {**revision, "id": "paused", "effectiveFrom": "2026-10-21", "paused": True}]}}
        updated = self.planned_call(revised, version=1)
        self.assertEqual(updated["record"]["planning"]["revisions"], revised["planning"]["revisions"])
        occurrence = self.planned_row(kind="occurrence", seriesId=series["id"], events=[
            {"id": "done", "at": "2026-10-20T00:00:00Z", "status": "completed", "completedAt": "2026-10-20T00:00:00Z"},
            {"id": "undo", "at": "2026-10-20T00:01:00Z", "status": "open", "completedAt": None},
        ])
        stored = self.planned_call(occurrence)
        self.assertEqual(stored["record"]["planning"], occurrence["planning"])
        settings = self.planned_row(kind="settings", settings={"timeZone": "Asia/Hong_Kong", "dayBoundaryHour": 0})
        self.planned_call(settings)
        later = {**settings, "planning": {**settings["planning"], "settings": {"timeZone": "Asia/Hong_Kong", "dayBoundaryHour": 4}}}
        self.assertEqual(self.planned_call(later, version=1)["record"]["planning"]["settings"]["dayBoundaryHour"], 4)
        duplicate = {**settings, "id": str(uuid.uuid4())}
        self.assert_error("todos_planning_settings_unique", entity="todo", entity_id=duplicate["id"], version=0, row=duplicate)

    def test_planning_migration_keeps_legacy_data_and_receipts(self):
        # Recreate the pre-migration column shape only inside this disposable DB.
        self.sql("alter table public.todos drop column planning;")
        entity_id = str(uuid.uuid4())
        self.sql(f"insert into public.todos(id,workspace_id,text,completed,rank,version) values ('{entity_id}','{WORKSPACE}','Existing task',true,42,7);")
        receipt = self.call()
        old_row = json.loads(self.sql(f"select to_jsonb(todos) from public.todos where id='{entity_id}'").stdout)
        self.sql((ROOT / "supabase/migrations/202610200001_todo_planning.sql").read_text())
        new_row = json.loads(self.sql(f"select to_jsonb(todos) from public.todos where id='{entity_id}'").stdout)
        self.assertIsNone(new_row.pop("planning"))
        self.assertEqual(new_row, old_row)
        self.assertEqual(json.loads(self.sql("select result from public.applied_operations").stdout), receipt)

    def test_invalid_planning_does_not_write_or_issue_receipt(self):
        valid = self.planned_row()
        for planning in [None, {}, {"kind": "task"}, {"version": 2, "kind": "task"},
                         {"version": 1, "kind": "task", "date": "2026-02-30"},
                         {"version": 1, "kind": "settings", "settings": {"timeZone": "Asia/Hong_Kong"}},
                         {"version": 1, "kind": "occurrence", "date": "2026-10-20", "status": "open", "seriesId": None}]:
            with self.subTest(planning=planning):
                row = {**valid, "planning": planning}
                self.assert_error("invalid_todo_planning", entity="todo", entity_id=row["id"], version=0, row=row)
        self.assertEqual(self.sql("select count(*) from public.todos").stdout.strip(), "0")
        self.assertEqual(self.sql("select count(*) from public.applied_operations").stdout.strip(), "0")

    def test_populated_planning_workspace_is_isolated_from_non_member(self):
        row = self.planned_row()
        self.planned_call(row)
        query = f"select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.todos t where workspace_id = '{WORKSPACE}';"
        owner = json.loads(self.sql(self.authenticated_sql(query)).stdout)
        self.assertEqual(len(owner), 1)
        self.assertEqual(owner[0]["id"], row["id"])
        outsider = json.loads(self.sql(self.authenticated_sql(query, user=OTHER_USER)).stdout)
        self.assertEqual(outsider, [])
        result = self.sql(self.call_sql(entity="todo", entity_id=row["id"], version=1,
            row={**row, "text": "unauthorized edit"}, user=OTHER_USER), check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("workspace_forbidden", result.stderr)
        self.assertEqual(json.loads(self.sql(self.authenticated_sql(query)).stdout), owner)
        self.assertEqual(json.loads(self.sql(self.authenticated_sql(query, user=MEMBER)).stdout), owner)

        other = {**row, "workspace_id": OTHER_WORKSPACE}
        self.assert_error("workspace_forbidden", entity="todo", entity_id=row["id"], version=1, row=other)


if __name__ == "__main__":
    unittest.main(verbosity=2)
