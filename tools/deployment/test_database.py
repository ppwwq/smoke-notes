import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from database import (GuardError, PROJECT, command, connection_environment,
                      local_migrations, main, pending_versions, verify_baseline)


class DeploymentSafetyTests(unittest.TestCase):
    @patch.dict(os.environ, {"SUPABASE_DB_URL": f"postgresql://postgres:fake@db.{PROJECT}.supabase.co:5432/postgres?sslmode=require"})
    @patch("sys.argv", ["database.py", "migrate"])
    @patch("database.check_append_only")
    @patch("database.local_migrations", return_value=(["001", "002"], 2))
    @patch("database.history", return_value=[])
    @patch("database.command")
    def test_migrate_cannot_call_cli_when_history_is_missing(self, run, history, local, append):
        with self.assertRaisesRegex(GuardError, "do not replay"):
            main()
        run.assert_not_called()

    def test_manual_database_is_not_treated_as_new_database(self):
        with self.assertRaisesRegex(GuardError, "do not replay"):
            pending_versions(["001", "002"], [], 2)

    def test_only_new_suffix_is_pending(self):
        self.assertEqual(pending_versions(["001", "002", "003"], ["001", "002"], 2), ["003"])
        self.assertEqual(pending_versions(["001", "002"], ["001", "002"], 2), [])

    def test_unknown_reordered_and_gapped_history_stop_release(self):
        for remote in (["001", "004"], ["002", "001"], ["001", "003"], ["001", "002", "004"]):
            with self.subTest(remote=remote), self.assertRaises(GuardError):
                pending_versions(["001", "002", "003"], remote, 2)

    def test_wrong_database_and_transaction_pooler_are_rejected(self):
        valid = f"postgresql://postgres:fake%40password@db.{PROJECT}.supabase.co:5432/postgres?sslmode=require"
        env = connection_environment(valid)
        self.assertEqual(env["PGPASSWORD"], "fake@password")
        self.assertIn("default_transaction_read_only=on", env["PGOPTIONS"])
        for url in (valid.replace(PROJECT, "other"), valid.replace("5432", "6543"),
                    valid.replace("require", "disable"), valid + "&options=unsafe",
                    valid.replace("/postgres?", "/other?"), ""):
            with self.subTest(url=url), self.assertRaises(GuardError):
                connection_environment(url)
        pooler = f"postgresql://postgres.{PROJECT}:fake@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require"
        self.assertEqual(connection_environment(pooler)["PGUSER"], f"postgres.{PROJECT}")

    def test_frozen_files_cannot_be_edited_or_backfilled(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            name = "202610150001_initial.sql"
            (folder / name).write_text("select 1;\n", encoding="utf-8")
            manifest = folder / "baseline.json"
            manifest.write_text(json.dumps({"migrations": {name: hashlib.sha256(b"select 1;\n").hexdigest()}}))
            self.assertEqual(local_migrations(folder, manifest), (["202610150001"], 1))
            (folder / "202610140001_backfill.sql").write_text("select 1;")
            with self.assertRaises(GuardError):
                local_migrations(folder, manifest)
            (folder / "202610140001_backfill.sql").unlink()
            (folder / name).write_text("drop table public.notes;", encoding="utf-8")
            with self.assertRaises(GuardError):
                local_migrations(folder, manifest)

    @patch("database.history", return_value=[])
    @patch("database.command", return_value="alter table public.notes drop column body;")
    def test_schema_difference_never_becomes_repair(self, run, history):
        with self.assertRaisesRegex(GuardError, "differs"):
            verify_baseline("hidden-url", {}, ["001"], 1)
        self.assertEqual(run.call_count, 1)
        self.assertEqual(run.call_args.args[0][1:3], ["db", "diff"])

    @patch("database.history", return_value=[])
    @patch("database.command", return_value="-- no differences\n")
    @patch("database.sql", return_value="f")
    def test_privilege_mismatch_blocks_baseline(self, sql, run, history):
        with self.assertRaisesRegex(GuardError, "privilege"):
            verify_baseline("hidden-url", {}, ["001"], 1)

    def test_child_failure_does_not_echo_credentials(self):
        import sys
        with self.assertRaises(GuardError) as failure:
            command([sys.executable, "-c", "import sys; print('fake-secret-value', file=sys.stderr); sys.exit(1)"])
        self.assertNotIn("fake-secret-value", str(failure.exception))


if __name__ == "__main__":
    unittest.main()
