# Existing Smoke Notes baseline adoption

Run [39614930571](https://github.com/ppwwq/smoke-notes/actions/runs/39614930571)
confirmed the prior-seven table/column/constraint/index/RLS/trigger/publication/
extension definitions. Planning is absent and the migration ledger is missing.
The strict synthetic baseline did not reproduce hosted default ACLs. Six function
owners/headers match; three bodies match and three exact body hash pairs were
previously reviewed as formatting only. The function ACL difference is existing
`service_role` execute access. Function ACL order and final definition newlines
are not code changes.

## Comparison correction

Retain strict category diagnostics. Build a second isolated PostgreSQL 17 reference
with hosted default table/function grants *before* applying the seven repository
migrations, so explicit application REVOKEs remain effective. Require every
category to match that profile; only the three pinned reviewed function body hash
pairs, final definition newline, and ACL ordering can compare as equivalent.
Unknown code, owner, grant, header, RLS or structural changes still stop the run.
Missing, partial or divergent migration history never makes `audit_only` pass.

This accepts the observed deployment baseline, not a security certification.
Existing hosted ACLs include broad `anon`/`authenticated` table privileges,
including TRUNCATE; those privileges are not protected by row-level policies in
direct SQL ([PostgreSQL row security documentation](https://www.postgresql.org/docs/17/ddl-rowsecurity.html)). This operation neither grants nor revokes them. A separately reviewed
least-privilege change should test existing API/administrative consumers before
changing those permissions. No new account or database access is granted here.

## Exact metadata-only operation

`operation=adopt_baseline` is separate from audit and release. It requires:

- Current reviewed `main` SHA, successful validation including real isolated
  PostgreSQL tests, and the existing `production-backend` reviewer approval.
- `baseline_ack=ADOPT_PRIOR_SEVEN_KEEP_DATA:<SHA>:koundrkjeambrcodxkdd`.
- The user's selected `release_mode=no_backup` and exact
  `no_backup_risk_ack=I_ACCEPT_DATA_LOSS_WITHOUT_BACKUP:<SHA>:koundrkjeambrcodxkdd`.
- A fresh TLS read confirming the complete reviewed hosted profile, with a missing
  ledger. Existing partial/divergent ledgers are never overwritten.

The write transaction takes a short shared lock on the eight application tables,
rechecks the exact catalog observed immediately before it, and creates only
`supabase_migrations.schema_migrations`, with seven version/name records and NULL
statements. The seven versions are 202608280001, 202608280002, 202608290001,
202609050001, 202609050002, 202610150001 and 202610150002.

No historical SQL or notes backfill is executed. These records adopt the current
verified schema as the deployment starting point; they do not certify how or when
historical statements ran. Existing notes and other rows remain untouched.
No application grants, functions or schema are rewritten, and planning version
202610200001 is not marked applied. The new ledger is not granted to API roles.
Lock timeout is five seconds; the transaction rolls back on catalog drift or a
racing ledger creation. After commit, a fresh read verifies exact history and
unchanged application catalog. A failed/uncertain attempt must be read back before
retry; an exact already-adopted ledger results in no writes.

No backups, exports, new credentials, frontend upload or Edge Function deployment
are performed. `RELEASE_ENABLED` stays unchanged. Production release remains a
separate guarded operation after successful adoption. If a commit succeeded but
the verification connection failed, do not treat the generic error as rollback.
