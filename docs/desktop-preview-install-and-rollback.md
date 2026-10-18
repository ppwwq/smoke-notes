# SmokeNotes Clear Preview: Windows test package

This is a separate, unsigned Windows x64 test build of the real SmokeNotes
desktop code. It is not a production update. The installer has been generated
but has not been installed on this computer.

## Files and isolation

- Installer: `SmokeNotes-Clear-Preview-Setup-0.1.10-clear-preview.1.exe`
- Product: **SmokeNotes Clear Preview**
- Application ID: `com.smokenotes.clearpreview`
- Data/session directory: `%APPDATA%\SmokeNotes Clear Preview`
- Sample database: `smoke-notes-preview`

The dedicated product identity activates offline preview mode even without
command-line flags. It opens sample notes, disables cloud connections, tray
residency and launch-at-login changes, and exits after its last note closes.
The install is per-user, does not request elevation, does not automatically
launch after setup, and does not create a desktop shortcut. A separate Start
menu shortcut is available. Do not choose the production app's install folder.

## Installation decision

Installation is a separate user action. Verify the accompanying SHA-256 before
running it. This local build has no publisher signature. If Windows or security
software displays a warning or block, stop there; do not disable protection or
bypass the warning. A signed distribution is required before wider release.

## Revert without touching production notes

1. Close the preview note using its close button so its sample draft is saved.
2. If the test build was installed, uninstall **SmokeNotes Clear Preview** from
   Windows Installed apps. Do not select the production **SmokeNotes/烟笺** app.
3. The uninstaller retains the preview data directory. If sample data is no
   longer wanted, separately remove only `%APPDATA%\SmokeNotes Clear Preview`
   after confirming its exact name. Never remove another SmokeNotes directory.
4. The original production installation and its data need no rollback because
   this test package does not replace them.

The development preview's separate data is in this checkout's
`work/desktop-preview`; it is not the installed preview's directory.

## Rebuild with existing tools

From the repository root:

```powershell
pnpm --filter @smoke-notes/desktop preview:build
cd apps/desktop
$env:ELECTRON_BUILDER_OFFLINE = 'true'
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
pnpm exec electron-builder --win nsis --x64 --config electron-builder.preview.json '-c.electronDist=PATH_TO_EXISTING_ELECTRON_DIST' --publish never
```

Use a trusted existing Electron 44 runtime and cached NSIS dependencies. This
workflow did not install new tooling or download a new runtime. Do not silently
download missing executables or weaken security settings if rebuilding fails.
