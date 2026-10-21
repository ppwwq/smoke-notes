# Remaining catalog differences after TLS recovery

Run 39612626686 reached the catalog comparison with client TLS confirmed.
Client roles, tables, columns, constraints, indexes, policies, triggers,
publication and extensions matched. Table grants and functions need review.
Planning is absent and the migration history table is missing.

The audit now describes these two mismatching categories using fixed, reviewed
identifiers only. Grant differences identify one of the eight application
tables, known roles, known privilege types and grant-option state. Function
details report owner/header/body/ACL equality and known-role execute grants.
Unknown metadata is suppressed, never echoed. Function bodies, raw ACL text,
connection details and application rows are not printed or exported.

Three exact historical function body hash pairs were independently reviewed
locally on 2026-10-21 as whitespace-only differences. The diagnostic can label
those exact pairs `PREVIOUSLY_REVIEWED_FORMAT_ONLY`. This label does not accept
drift, change the strict comparison, repair history, or approve release. An
unrecognized body remains `REVIEW_REQUIRED`.

Keep this next run in `audit_only`. No grant, function, migration ledger,
release flag, credential or environment protection is changed by this patch.
Review the actual resulting differences before preparing any necessary write.
