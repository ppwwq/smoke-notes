# SmokeNotes 0.1.11-rc.1 Windows release candidate

Status: candidate built and tested locally on 2026-10-18; not approved for public release. This is the full application, with the existing main window, notebooks, settings, pairing, sync runtime and trash recovery. It is not the separate Clear Preview product.

## Changes

- Creating a desktop note opens its native 320 × 400 window while retaining the main editor. Explicit saved sizes and positions remain unchanged.
- Notes use a transparent native window and a translucent colored background, initially 28% opaque. Text stays opaque. The narrow bar provides tools, minimize, explicit pin state, opacity and close. Formatting, colors, recent notes and deletion remain available.
- This implementation is transparency, not live blur of windows behind it. It does not present Mica or a CSS blur as native background blur.
- Main-window sync status now reflects the sync runtime instead of reporting a cloud connection merely because the network is online.
- Release builds require HTTPS cloud/web endpoints and a public Supabase key. Missing/sample settings and secret/service-role keys fail the release build. Existing development and isolated preview workflows remain available.
- The NSIS installer retains the existing `com.smokenotes.desktop` identity and `烟笺` product name. It does not automatically launch at completion and does not delete application data on uninstall.
- An explicit absolute `--user-data-dir` isolates both Electron profile and session data before initialization. This mode retains the full UI and sync code but suppresses all launch-at-login changes. Without this argument, normal application behavior is preserved.

## Validation completed

- 40 test files / 361 tests passed, plus `pnpm typecheck` and `pnpm lint`.
- A synthetic version-1 IndexedDB fixture upgrades to the existing version-3 schema, preserving note identity, Chinese text, blank paragraphs, trashed records and queued operations. This change adds no database schema version.
- The packaged full application was tested with an explicit workspace-only synthetic profile and an application-only localhost proxy blocking external access. Preview mode was false; main window, settings and native note windows worked. No real notes, credentials or cloud accounts were used.
- Normal creation, editing, native 320 × 400 bounds, opacity, pin on/off, deletion and restoration of the same note ID, position persistence and save-before-quit passed.
- After full exit, the synthetic profile was copied to a backup and a second restore directory. The final candidate reopened the restored copy and preserved the same note ID, exact title/body, 320 × 400 dimensions, position and 28% opacity. Its blocked cloud connection correctly displayed sync failure, not a successful connection.
- Chromium composition events and renderer zoom at 100%, 125% and 150% passed. These do not constitute physical Windows IME or Windows DPI acceptance.
- The production public configuration was recovered from the existing public deployment at `https://smoke-notes-philipwwq.pages.dev`. A read-only Supabase auth-settings request returned HTTP 200. No anonymous signup, pairing or cloud write was performed.

## Build

Provide `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_WEB_APP_URL` via the established deployment environment or ignored local configuration. Only public browser configuration belongs in a desktop bundle. Then run:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @smoke-notes/desktop package
```

The local candidate used the already installed Electron 44.0.0 distribution and cached builder/NSIS tools. Signing was explicitly disabled for that local build only; production configuration does not disable signing. The candidate is unsigned and must not be represented as a signed release. Do not bypass Windows warnings to validate it.

## Backup, upgrade and rollback procedure

Run this procedure first in a dedicated Windows VM or test user with synthetic data. Do not run the candidate installer against the user's installed 0.1.10 during development.

1. Record the installed version and actual Electron user-data directory; do not guess its path from the translated product name. Close the application using tray Quit and verify its processes have exited.
2. Copy the entire application user-data directory to a separate backup, preserving IndexedDB, Local Storage and window preferences together. Do not copy an open database. Keep backups private because a real profile can contain notes and session credentials.
3. Install the candidate and verify synthetic notes, notebooks, trash, pending sync queue, main settings, native windows and startup preference. Verify shortcuts, installer version metadata and a second launch.
4. Quit, uninstall and confirm application data is retained. Reinstall and verify the same data. Confirm no launch-at-login entry was added or changed by the test procedure.
5. For rollback, quit fully, keep a separate copy of the candidate profile, reinstall the prior trusted version, and restore the complete pre-upgrade backup. Do not merge individual database files. Cloud changes would require separate reconciliation; local backup does not undo server writes.

## Required release gates

- Installer install/upgrade/uninstall/reinstall on isolated Windows: pending. The current computer already has 0.1.10 installed; Windows Sandbox and Hyper-V tooling were not available. The candidate installer was built but not executed on that account.
- Physical Chinese Windows IME candidate selection, interruption, focus changes and rapid quit: pending user/device acceptance. Synthetic composition is not a substitute.
- Actual Windows scaling at 100%, 125% and 150%, second-monitor movement and unplug/reconnect: pending. Current observed display is one 2560 × 1440 monitor at scale factor 1.
- Live desktop/mobile pairing, two-client sync, offline reconnection, concurrent conflict recovery and pending-write quit: pending an authorized isolated cloud workspace/accounts. Public endpoint HTTP 200 does not prove these flows.
- Signing and distribution trust: no current-user code-signing certificate or existing repository release workflow was found. Obtain an authorized signing route and verify signature/timestamp before formal publication; do not purchase or bypass warnings automatically.

No main-branch merge, formal GitHub Release, replacement of the installed application, new startup entry or system-setting change is part of this candidate work.
