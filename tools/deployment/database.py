"""Fail-closed migration checks. No credentials or SQL output are logged.

Production is never reset or seeded. Baseline repair is an explicit, separate
operator action after schema comparison, never part of the release workflow.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import parse_qs, unquote, urlsplit

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "supabase/migrations"
BASELINE = ROOT / "supabase/migration-baseline.json"
PROJECT = "koundrkjeambrcodxkdd"


class GuardError(Exception):
    pass


def command(args, *, env=None, input=None, timeout=900):
    # Child errors can contain connection strings, decoded passwords or SQL.
    # Never print them, even on failure. Inspect failures in the secure console.
    try:
        result = subprocess.run(args, cwd=ROOT, env=env, input=input,
                                capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired):
        raise GuardError(f"{Path(args[0]).name} could not complete; output withheld") from None
    if result.returncode:
        raise GuardError(f"{Path(args[0]).name} failed ({result.returncode}); output withheld")
    return result.stdout


def local_migrations(directory=MIGRATIONS, baseline_path=BASELINE):
    baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
    files = sorted(directory.glob("*.sql"))
    names = [path.name for path in files]
    versions = []
    for path in files:
        match = re.fullmatch(r"(\d{12,14})_[a-z0-9_]+\.sql", path.name)
        if not match:
            raise GuardError(f"Invalid migration name: {path.name}")
        versions.append(match[1])
    if len(set(versions)) != len(versions):
        raise GuardError("Duplicate migration versions")
    frozen = baseline["migrations"]
    if names[:len(frozen)] != list(frozen):
        raise GuardError("Frozen baseline was removed, renamed, or backfilled")
    for name, expected in frozen.items():
        source = (directory / name).read_text(encoding="utf-8").replace("\r\n", "\n")
        if hashlib.sha256(source.encode()).hexdigest() != expected:
            raise GuardError(f"Frozen migration changed: {name}")
    return versions, len(frozen)


def check_append_only():
    base = os.environ.get("BASE_SHA", "")
    if not base or set(base) == {"0"}:
        return
    if not re.fullmatch(r"[0-9a-f]{40}", base):
        raise GuardError("Invalid comparison commit")
    changes = command(["git", "diff", "--name-status", "--no-renames", base, "HEAD", "--",
                       "supabase/migrations", "supabase/migration-baseline.json"])
    for line in changes.splitlines():
        status, path = line.split("\t", 1)
        if status != "A":
            raise GuardError(f"Applied migration/baseline must be immutable: {path}")


def connection_environment(url):
    try:
        parsed = urlsplit(url)
        username = unquote(parsed.username or "")
        host = parsed.hostname or ""
        direct = host == f"db.{PROJECT}.supabase.co" and username == "postgres"
        pooler = (re.fullmatch(r"[a-z0-9-]+\.pooler\.supabase\.com", host) is not None
                  and username == f"postgres.{PROJECT}")
        if (parsed.scheme not in ("postgres", "postgresql") or not (direct or pooler)
                or parsed.port not in (None, 5432) or parsed.path != "/postgres"
                or not parsed.password or parsed.fragment
                or parse_qs(parsed.query) != {"sslmode": ["require"]}):
            raise ValueError()
    except ValueError:
        raise GuardError("DB URL must target the approved project, database postgres, port 5432, sslmode=require") from None
    env = {k: v for k, v in os.environ.items() if not k.startswith("PG")}
    env.update(PGHOST=host, PGPORT="5432", PGDATABASE="postgres", PGUSER=username,
               PGPASSWORD=unquote(parsed.password), PGSSLMODE="require", PGCONNECT_TIMEOUT="20",
               PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=60000")
    return env


def sql(query, env):
    return command(["psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], env=env,
                   input="begin read only;\n" + query + "\nrollback;", timeout=90).strip()


def history(env):
    exists = sql("select to_regclass('supabase_migrations.schema_migrations') is not null;", env)
    if exists == "f":
        return []
    if exists != "t":
        raise GuardError("Could not determine migration history")
    return json.loads(sql("select coalesce(json_agg(version order by version), '[]'::json) "
                          "from supabase_migrations.schema_migrations;", env))


def pending_versions(local, remote, baseline_count):
    if len(remote) < baseline_count:
        raise GuardError("Production baseline is not recorded; do not replay historical migrations")
    if remote != local[:len(remote)]:
        raise GuardError("Remote history is unknown, out of order, or contains a gap")
    return local[len(remote):]


def verify_baseline(url, env, local, baseline_count):
    if len(local) != baseline_count:
        raise GuardError("Reconcile on the frozen baseline checkout, before adding migrations")
    remote = history(env)
    if len(set(remote)) != len(remote) or not set(remote).issubset(local):
        raise GuardError("Unexpected history; automatic baseline repair is unsafe")
    diff = command(["supabase", "db", "diff", "--db-url", url, "--schema", "public", "--use-migra"])
    # A nonempty diff is review evidence, never SQL to apply to production.
    remaining = re.sub(r"/\*.*?\*/|--[^\n]*", "", diff, flags=re.S).strip()
    if remaining:
        raise GuardError("Public schema differs from the baseline; reconcile differences in a separate reviewed change")
    checks = (ROOT / "tools/deployment/baseline-check.sql").read_text(encoding="utf-8")
    if sql(checks, env) != "t":
        raise GuardError("Baseline function, RLS, privilege, or realtime checks failed")
    return [version for version in local if version not in remote]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["check-local", "plan", "migrate", "baseline"])
    parser.add_argument("--record", action="store_true", help="Explicitly record verified baseline history only")
    parser.add_argument("--confirm-project", default="")
    args = parser.parse_args()
    local, baseline_count = local_migrations()
    check_append_only()
    if args.operation == "check-local":
        print(f"Validated {len(local)} immutable/append-only migrations")
        return
    url = os.environ.get("SUPABASE_DB_URL", "")
    env = connection_environment(url)
    if args.operation == "baseline":
        if args.record and args.confirm_project != PROJECT:
            raise GuardError("Recording history requires explicit project confirmation")
        missing = verify_baseline(url, env, local, baseline_count)
        print(f"Baseline schema verified; {len(missing)} history entries missing")
        if args.record and missing:
            command(["supabase", "migration", "repair", *missing, "--status", "applied", "--db-url", url, "--yes"])
            if history(env) != local:
                raise GuardError("Baseline history verification failed")
            print("Baseline history recorded; application SQL was not replayed")
        return
    pending = pending_versions(local, history(env), baseline_count)
    print("Pending migrations: " + (", ".join(pending) or "none"))
    command(["supabase", "db", "push", "--db-url", url, "--dry-run", "--yes"])
    if args.operation == "migrate" and pending:
        # Recheck after the plan; external operators must also honor the rollout lock.
        if pending_versions(local, history(env), baseline_count) != pending:
            raise GuardError("History changed during planning; retry from a new plan")
        command(["supabase", "db", "push", "--db-url", url, "--yes"])
    if args.operation == "migrate" and history(env) != local:
        raise GuardError("Post-migration history does not match this release")
    print("Migration checks passed")


if __name__ == "__main__":
    try:
        main()
    except (GuardError, ValueError, KeyError) as error:
        # Only our own GuardError messages are safe to print.
        print(str(error) if isinstance(error, GuardError) else "Invalid migration metadata", file=sys.stderr)
        sys.exit(1)
