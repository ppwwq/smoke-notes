# Local database regression tests

Run from the repository root:

```sh
docker pull postgres:17-alpine
python3 supabase/tests/database/test_mutation.py
```

The Python standard-library runner creates a disposable PostgreSQL 17 container,
applies every repository migration, and removes the container afterward. It has
no network interface or published ports and does not read Supabase credentials.
It supplies minimal `auth.users`, `auth.uid()` and role fixtures. These are real
PostgreSQL transaction and permission tests; they do not validate hosted
Supabase Auth, PostgREST, Edge Functions or Realtime end to end.

The tests cover successful-save retries, simultaneous retries (six blocked
sessions), competing edits, stable conflict receipts, transaction rollback when
receipt insertion fails, insert/update/tombstone behavior, notebook/note/todo
payloads, untrusted versions, invalid input, cross-workspace access, anonymous
access, receipt forgery and operation ID reuse across users/entities.
They also cover atomic pairing rotation, historical code collisions preserving
the old redeemable code, rollback on retirement failure, six simultaneous
rotations leaving one active code, pairing authentication/membership checks,
and six simultaneous first-time bootstrap calls creating only one workspace.

`rls.test.sql` is a separate pgTAP test for the Supabase CLI database test runner;
it is not executed by the standalone Python runner.

## Deployment order for atomic mutations

1. Apply `202610150001_atomic_mutations.sql` using the normal database migration
   workflow. The new RPC has a fixed empty `search_path`, authenticates with
   `auth.uid()`, and validates workspace membership itself.
2. Deploy `supabase/functions/apply-mutation/index.ts`, which now invokes
   `apply_workspace_mutation` with the caller's authenticated client.

The migration can coexist with the old edge function during this transition:
the old function uses the service role, whose permissions are unchanged. The
atomic-retry guarantee requires every active writer to use the new function;
existing false conflicts or old unrecorded successful writes are not repaired.
No production migration or function deployment is performed by these tests.

## Deployment order for pairing and bootstrap

1. Apply `202610150002_atomic_pairing_and_bootstrap.sql`. It adds the atomic
   `rotate_pairing_code` RPC and serializes `bootstrap_workspace` per user.
2. Deploy `supabase/functions/create-pairing/index.ts` together with `rotate.ts`.
   The function retries historical hash collisions up to ten times and uses
   the expiry returned by the database.

The migration preserves existing table permissions for compatibility. The old
edge function can run during the transition but retains the old non-atomic
behavior until all active callers use the new function. Existing duplicate
workspaces are retained; this migration does not merge or delete user data.
