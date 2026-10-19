# SmokeNotes 0.1.11-rc.2 Windows candidate

Updated 2026-10-18. This is the full SmokeNotes application, including notebooks, settings, pairing, synchronization, trash recovery and independent desktop notes. It is an unsigned release candidate, not a completed or publicly published production release. No installed copy of 0.1.10 was installed over, uninstalled or modified.

## Behavior and fixes

- New desktop notes open at 320 × 400 with a native transparent window, 28% background opacity, a weak border and opaque text. Existing explicitly saved sizes remain supported. Formatting, colors, recent notes, pinning and deletion remain accessible through the compact bar. This is transparency, not native background blur.
- A quit requested while a document initializes waits for its save handler. A 30-second readiness timeout cancels the request without discarding drafts or quitting unexpectedly later. Failure to restore a window no longer leaves surviving editors permanently unable to quit. Save failures still cancel exit.
- Automatic-save failures are visible even when formatting controls are folded; successful recovery clears the warning. The pin button waits for initial saved window state, avoiding a toggle based on an uninitialized value.
- The tools menu remains inside 250, 286, 300 and 320 pixel windows. The previous menu was clipped at narrower widths.
- Main-window cloud status reflects the sync runtime. Release builds validate HTTPS endpoints and public browser keys. Explicit absolute `--user-data-dir` isolates the whole test profile and suppresses login-item changes.
- The NSIS identity remains `com.smokenotes.desktop`, product name `烟笺`. Installer configuration retains application data on uninstall and does not automatically launch after installation. These configuration facts do not constitute an executed installer lifecycle test.

## Evidence

Current source passed **367 tests across 40 files**, `pnpm typecheck`, and `pnpm lint`. Full diff review covered base `2032276` through the final working tree. Additional regressions cover startup restoration failure, pending initialization quit, visible autosave failure/recovery, and pin state initialization.

| Check                               | Observed result                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Genuine Chinese input               | Native Windows key events `nihao` and Space produced `你好` in the real editor. Trusted beforeinput/input events were recorded. Exact note ID, title and body survived full exit and the final candidate restart; pending queue was zero.                                                                                                                         |
| Quit during initialization          | In the final packaged application, a single quit was requested during an actual document's `did-start-loading` event, with `isLoading=true`. The application later emitted `will-quit` and its process exited.                                                                                                                                                    |
| Actual Windows scaling              | Windows Settings selected 125% and 150%; Electron display scale and renderer DPR matched, renderer zoom stayed 1, no horizontal overflow occurred, and pin hit testing plus both toggle directions matched native/UI/persisted state.                                                                                                                             |
| Scaling restoration                 | Original 100% and 2560 × 1440 were restored. A width change from 320 to 375 was observed after the round trip; the test note was reset to its original 320 × 400 and position. Dimension stability is not accepted as passed.                                                                                                                                     |
| Native screenshot                   | Cropped real window capture contains only fictional test content and a task-created background. Capture pinning was restored, the temporary backdrop was destroyed, the application exited, and ports 9330/9331 closed.                                                                                                                                           |
| Live sync, from the preceding run   | Exactly two already-authorized anonymous identities paired into one fictional-data workspace. Desktop→web, web→desktop, offline reconnect and concurrent body conflict preservation passed; both queues reached zero. No new identities were created in this continuation. The second endpoint was a persistent web client/mobile viewport, not a physical phone. |
| Earlier lifecycle evidence retained | Full-app note creation/edit/delete/restore, same-ID recovery, position/opacity persistence, pending queue restart, synthetic v1→v3 database upgrade and closed-profile backup/restore passed. No new database schema is introduced.                                                                                                                               |
| Artifact inspection                 | Packaged main/preload/renderer bytes match the final build. No test profiles, environment files or credentials are included. Authenticode reports NotSigned.                                                                                                                                                                                                      |

Evidence logs and JSON are included in the delivery ZIP. The two test accounts and fictional workspace remain available; they were not deleted. User accounts and real-note storage were not used.

## Remaining acceptance limits

1. **Installation, upgrade, uninstall and reinstall remain untested.** The user has 0.1.10 installed and no spare Windows environment; this installer was never executed. Validate that lifecycle using synthetic data in an isolated Windows environment before calling this a fully accepted release.
2. **DPI round-trip geometry remains a known limitation.** Controls and content passed at 125%/150%, but native window width changed on returning to 100%. Multiple active monitors, unplug/reconnect and cross-monitor movement were not tested.
3. **Native IME interruption coverage is incomplete.** Actual Chinese candidate output and save/restart passed. This IME emitted trusted text input, without observable DOM composition events. Candidate cancellation, focus interruption and quitting while a native candidate is open have not been accepted; synthetic composition regressions are separate evidence.
4. Physical-phone/PWA installation and Windows sign-out/reboot startup behavior remain outside executed acceptance.
5. The user accepted unsigned distribution. No signing credentials were created or purchased, no security warning was bypassed, and the package is not represented as signed. There was no main-branch merge, public Release, backend migration or deployment.

## Build and recovery

The build used existing Electron 44.0.0 and cached NSIS tools, with public production configuration from the established deployment. Source release configuration still allows an authorized signing setup; signing was disabled only for this local candidate command.

Before any future upgrade, quit normally and copy the **entire closed profile** to a private backup. Preserve IndexedDB, Local Storage and window preferences together. Test installation, data retention after uninstall, reinstall and rollback in an isolated account/VM first. Do not merge individual database files or copy an open database. Restoring a local backup does not undo cloud writes.

Installer: `SmokeNotes-Setup-0.1.11-rc.2.exe` (113,293,459 bytes).

SHA-256: `49c3edbc50d64c301b1691c0e2a527bee45a9ca9e78dea2ead25dea8cb004344`.
