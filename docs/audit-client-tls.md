# Audit TLS verification through a session pooler

Run 39607282756 stopped at `stage=compare error=tls_unconfirmed` before
reporting the catalog comparison. Its SQL used `pg_stat_ssl` for the database
backend. With a session pooler this describes the pooler-to-Postgres connection,
not the GitHub runner-to-pooler connection.

The audit now runs `\conninfo` in the same `psql` process and connection as the
read-only catalog query. It requires the client to report TLS 1.2 or 1.3 with
compression off. `PGSSLMODE=require`, the approved target restrictions, the
read-only transaction, and all environment approvals remain enforced. Missing,
unencrypted, or unrecognized client status fails closed. The server-side `tls`
observation remains separate and cannot override the client result.

Connection details and catalog observations remain in process memory only.
Only the existing fixed diagnostic/category labels reach logs or summaries.
The synthetic reference still uses an isolated Unix socket with no TLS; its
schema tests explicitly mark synthetic fixtures, and a real psql integration
test verifies that the socket itself cannot satisfy the production TLS gate.

This change does not enable release, repair migration history, change database
or account settings, or declare the catalog baseline verified. Run `audit_only`
again on the merged SHA and inspect its actual result before a release.

References:

- [psql connection information](https://www.postgresql.org/docs/17/app-psql.html)
- [PostgreSQL SSL statistics](https://www.postgresql.org/docs/17/monitoring-stats.html#MONITORING-PG-STAT-SSL-VIEW)
- [Supabase session pooler](https://supabase.com/docs/guides/database/connecting-to-postgres)
