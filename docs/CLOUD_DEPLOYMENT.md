# SmokeNotes cloud deployment

This proposal targets only `ppwwq/smoke-notes`, Supabase project
`koundrkjeambrcodxkdd`, and Cloudflare Pages project `smoke-notes-philipwwq` in
account `86eac8fedb92cf5e11c160669b5605b7`. The production URL is
<https://smoke-notes-philipwwq.pages.dev>.

## Current state and default behavior

Production was manually verified at commit
`5e669b2278a42733baaf3126b0b9c4472b8b732e` on 2026-10-17. Both October 15 SQL
migrations and the updated `apply-mutation` / `create-pairing` functions are
already deployed. **The production migration history table is absent.** Do not
run an unguarded `supabase db push`: that would treat the historical migrations
as pending. The frozen manifest is a local reference, not evidence that all
production schema objects have been compared.

At preparation time, GitHub had no workflows, environments or repository Actions
secrets. This PR does not create credentials, change account access, configure
environment protection, or enable unattended deployment. Merging it runs checks
but skips the production job while `SMOKE_PRODUCTION_DEPLOY_ENABLED` is unset or
`false`.

Pull requests run frontend/unit tests, TypeScript checks, a web build, deployment
guard tests, and the existing PostgreSQL integration tests. The latter create a
disposable Docker database with no published ports and never connect to Supabase.
No production secrets are available to that job. Workflows use pinned action
commits and read-only repository permissions; no `pull_request_target` is used.

## Access to approve and enter securely

Approve each destination and scope before creating or storing any credential.
Enter values directly into the provider/GitHub secure UI; never paste them into
chat, source files, workflow inputs or command history. Existing local interactive
login credentials must not be copied into ongoing CI access.

Create a GitHub environment named `production` in this repository, restrict its
deployment branches explicitly to `main`, and require an owner reviewer. Keep
review approval during initial rollout. Protect `main` with the Validate check
and review of changes to workflows, deployment scripts and migrations. Changing
these repository security settings also requires the owner's approval.

| Destination                       | Name                              | Requested scope / value                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `production` environment secret   | `SUPABASE_ACCESS_TOKEN`           | Scoped Supabase PAT for **only** project `koundrkjeambrcodxkdd`: Project Settings Read and Edge Functions Read/Write. The workflow does not retrieve API key secrets, set function secrets, or manage organizations. Validate these scopes with the read-only plan before activation.                                                                                                                                               |
| `production` environment secret   | `SUPABASE_DB_URL`                 | Existing project Postgres connection, database `postgres`, direct host `db.koundrkjeambrcodxkdd.supabase.co` or session pooler host `*.pooler.supabase.com` with username `postgres.koundrkjeambrcodxkdd`, port 5432, `sslmode=require`. Password must be percent-encoded. This credential has broad DDL/data privileges in this project; it is not limited by PAT scopes. Do not reset an unknown database password automatically. |
| `production` environment secret   | `CLOUDFLARE_API_TOKEN`            | Account → Cloudflare Pages → Edit, restricted to account `86eac8fedb92cf5e11c160669b5605b7`. Cloudflare's permission covers Pages projects in that account, not just this one; the workflow separately fixes the project name.                                                                                                                                                                                                      |
| `production` environment variable | `VITE_SUPABASE_PUBLISHABLE_KEY`   | Public publishable key, or legacy `anon` JWT for this Supabase project. Never a `service_role` or `sb_secret_` key.                                                                                                                                                                                                                                                                                                                 |
| Repository Actions variable       | `SMOKE_PRODUCTION_DEPLOY_ENABLED` | Leave unset/`false` until baseline repair and a successful plan are approved. `true` permits main pushes and manual deploys to enter the protected environment.                                                                                                                                                                                                                                                                     |

The other two `VITE_*` values, project ref and Cloudflare account ID are public
identifiers fixed in the workflow. The existing server-side `WEB_APP_URL` must
remain the production site URL; the workflow does not read or rewrite its value.
Do not grant more scope just to bypass a 401/403: identify the failing read or
deployment permission first and obtain separate approval if a scope is missing.

Provider references: [Supabase scoped tokens](https://supabase.com/docs/guides/platform/personal-access-tokens),
[Cloudflare Pages CI permissions](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/),
[GitHub deployment protection](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).

## Reconcile the existing database before enabling deployment

This is a separately approved maintenance action, never an automatic release
step. Pause other deployment operators for this project while checking/recording
the baseline. Preserve production data and use an approved, ephemeral secure
session with Supabase CLI **2.116.0**, PostgreSQL client and Docker. Docker is used
only to build a local shadow schema for comparison. Use a checkout containing
exactly the seven frozen migrations, before any later migration is added.

Inject `SUPABASE_DB_URL` through a supported secure secret mechanism, without
printing or typing the value into command history. First run:

```sh
python3 tools/deployment/database.py baseline
```

This validates the target, compares the complete `public` schema against a
shadow built from all seven migrations, and checks current RPC bodies, function
privileges, table RLS, receipt write restrictions, pairing-attempt privileges and
the realtime publication. Production reads run in read-only transactions. A
schema difference or failed check stops the action. Do not apply the generated
diff to production, weaken checks, or label the baseline complete from the
manifest alone. Review any mismatch separately in the secure environment.

Only after the comparison passes and the owner explicitly approves recording
history, run:

```sh
python3 tools/deployment/database.py baseline --record --confirm-project koundrkjeambrcodxkdd
```

The same checks run again before `supabase migration repair --status applied`
records only missing baseline versions. **It does not replay application SQL.**
Unknown history is rejected; recording is followed by an exact history check.
No reset, seed, data deletion or automatic rollback is performed. A partial
history repair can be rechecked and safely resumed by the same explicit command.
See [Supabase migration repair](https://supabase.com/docs/reference/cli/supabase-migration-repair).

## Plan, activate and verify

1. Review/merge this PR and configure only the approved environment/access above.
2. Complete the baseline comparison and separately approved history repair.
3. On `main`, dispatch **Production (gated)** with operation **plan**. It runs all
   checks, validates current main and both existing cloud targets, builds the
   frontend, and runs `db push --dry-run` after verifying history. It does not
   publish anything. An absent history still fails here, even if the enable
   variable has accidentally been set.
4. After a successful plan, explicitly approve setting the enable variable to
   `true`. Use manual **deploy** on current main for the first supervised run.
5. Approve the protected environment deployment and check its final verification.
   Future main pushes follow the same protected flow. Removing required reviewers
   to make it fully unattended is a **separate** security-setting approval.

Release ordering is: tests/build → provider and main-SHA preflight → migration
history/plan → pending migrations → all three Edge Functions → frontend upload
→ live release SHA and HTML/entry-asset hash checks. Function verification checks
a newer active version, gateway JWT configuration, CORS and rejection of
unauthenticated calls. It does not create users or mutate production notes;
authenticated pairing and cross-device sync remain a supervised acceptance check.

All pending SQL must be backward compatible with the currently running frontend
and functions. Use additive migrations first; defer removal or changed grants
until old clients/functions no longer need them. The October 15 manual rollout
already handled its receipt-grant ordering; it must not be replayed by CI.
Applied migration files are immutable; add a new timestamped migration instead
of editing or backfilling an old one. Review SQL with destructive behavior
explicitly; the script does not pretend to prove arbitrary SQL safe.

One concurrency group serializes this workflow without cancelling an active
migration. Main SHA is rechecked before database writes, function deployment and
frontend promotion. This does not lock out someone using the dashboard/CLI;
coordinate manual production work and turn the enable variable off first.

On failure, subsequent steps stop. A migration or function may already have
succeeded; there is no automatic database rollback. Leave the previous frontend
in place, inspect migration history and provider metadata securely, and resume
with a reviewed forward fix. A failure after the Pages upload means the new
frontend may be live even if verification failed. Check the provider deployment
and live release marker before taking action. Logs intentionally suppress raw
provider/CLI output that could contain credentials or SQL.

The pipeline stores no reusable desktop credentials, does not modify the saved
ChatGPT/Codex cloud environments, and does not deploy the Chinese check-in site.
