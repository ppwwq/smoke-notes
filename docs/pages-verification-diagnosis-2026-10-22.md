# Pages verification diagnosis — 2026-10-22

Local main was fast-forwarded from `b6bf2c2` to `ab385bbc880c6b4e35e4d39f6d911b147f419b6c`. The existing untracked account-migration document was preserved with its SHA-256 unchanged. Current source package version is `0.1.11-rc.5`; this does not identify the installed desktop version.

## Failure and fix

GitHub run `39630249671`, job `119327070571`, reports:

```text
Pages verification failed: stage=compare_public_assets kind=http http_status=403.
```

That stage occurs after the existing production deployment ID, branch, SHA and successful deploy stage have been checked. The failed run did not redeploy.

On this machine, Python urllib requests reproduced HTTP 403 with `error code: 1010`, with or without the release query string. The same Python request to the same asset succeeded after changing only User-Agent to `SmokeNotesReleaseVerifier/1.0 (+https://github.com/ppwwq/smoke-notes)`. The response matched the source icon bytes. Cloudflare documents 1010 as browser-signature blocking: https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1010/

The local fix adds that explicit application identity to public asset requests. It preserves no-cache, exact SHA-256 checks, and immediate failure on HTTP denial. It does not modify Cloudflare settings, deployment identity checks, credentials, retries or deployment behavior.

## Verification

- Regression assertions failed before the fix and all 9 Pages orchestration tests passed afterward. Both release and verify-only public fetch paths check the explicit User-Agent and no-cache header.
- Web build passed using the installed Vite executable directly. The pnpm launcher failed in its sandbox-managed package cache; dependencies and lockfile were not changed. Existing large-chunk warning remains.
- Live `release.json` identifies `2733cdc8e1fb6965f1e4475ceeee6d294ecad48f`. Application sources at that commit and local HEAD are identical; only release workflow/diagnostics changed afterward.
- All 14 built static assets returned HTTP 200. After temporarily matching Linux LF entry-file endings during the build and restoring the original checkout bytes, 13 matched byte-for-byte. The Service Worker differs only in precache entry order; entry URLs/revisions and the remaining script match. This cross-platform reconstruction is not a replacement for the workflow's strict byte verification.
- Local public-asset evidence is in `work/pages-diagnosis-20261022/public-assets.json` (ignored, not committed).
- `git diff --check` passed. No GitHub workflow was dispatched, no deployment was performed, no desktop installer was run, and no Cloudflare policy changed. The fix is local and the remote workflow remains failed pending review/push and a separately executed verification run.

Desktop installation acceptance remains as described in `desktop-release-0.1.11.md`: use an isolated Windows environment with synthetic data for install/upgrade/uninstall/reinstall, and cover DPI round trips, native IME interruption and physical phone/PWA behavior. This investigation did not execute those checks.
