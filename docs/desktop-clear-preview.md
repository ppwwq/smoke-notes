# Clear desktop note preview

Implemented locally from main `2032276` on `desktop/clear-note-local-preview`.
This is an isolated test build, not a production release. A separate unsigned
Windows test installer is now available; see
[installation and rollback](desktop-preview-install-and-rollback.md).

## Desktop behavior

- New note windows default to 320 × 400 with a narrow draggable bar, faint border,
  and background opacity 28%. Existing stored geometry and opacity remain intact.
- Electron's transparent native window reveals the actual windows beneath it.
  Text stays opaque. This mode does not apply live background blur or Mica.
- The pin shows its current state and toggles always-on-top. The slider changes
  only the background (20–100%). Tools contain formatting, note colors, deletion,
  and recent notes. New ordinary notes and task lists use the existing editor.
- Blank paragraphs remain visible. Save-before-close, switching, recovery, and
  repository persistence follow the existing desktop implementation.

## Isolated local preview

With project dependencies and an already trusted Electron runtime available:

```powershell
$env:SMOKENOTES_ELECTRON = 'PATH_TO_EXISTING_ELECTRON\electron.exe'
pnpm --filter @smoke-notes/desktop preview:desktop
```

The launcher uses an existing executable only and fails if none is available;
it does not download Electron. `preview:build` does not read environment files.
The `--preview` option is accepted only by an unpackaged development app.
It sets userData and sessionData to this checkout's `work/desktop-preview`
before the instance lock and any data access, uses a separate preview database,
seeds example content, disables cloud configuration and external renderer
requests, and avoids the tray and launch-at-login changes. The normal main
renderer stays hidden to provide the real repository and saving workflow.
Closing the last note saves and exits the preview. Reopening retains only this
isolated example profile. No installed application is replaced.

## Validation and limits

Automated checks cover opacity normalization, geometry, full-width hit testing,
menu access, save/switch/delete behavior, and preview storage/network/lifecycle
isolation. The Windows preview was exercised with real repository writes,
Chinese text, visible empty paragraphs, task lists, formatting and colors,
opacity and pin controls, switching, closing, and reopening.

The final screenshot captures only the native note over a controlled
background and is saved in Library as `SmokeNotes-integrated-clear.png`.
Physical multi-monitor DPI transitions and an actual IME composition
session have not been manually tested. Chromium composition and 100%, 125%,
150% renderer zoom tests pass; these are not OS input-method or physical DPI tests.
The separate packaged preview also passed immediate-save, full-exit and reopen
verification using its own sample profile. No installer was run, and no startup
entry, system setting, real note data or account credentials were changed.
