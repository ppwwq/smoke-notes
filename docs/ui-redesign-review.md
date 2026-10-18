# SmokeNotes Web redesign review

Base: `5e669b2278a42733baaf3126b0b9c4472b8b732e` (main when work began). Branch: `codex/smoke-notes-ui-redesign`. Draft PR #2. This review covers the entire branch, including earlier presentation and mobile revisions. PR #1 remains separate and untouched.

## Design and interaction

The web application uses the verified video's ivory `#FBFAF8`, near-black `#111111`, lilac `#C4BBFE`, lime `#D4E73E`, heavy sans-serif headings, rounded cards, stacked notebooks and a black capsule navigation. Todo progress turns green `#C5E882` at 75%, and completion feedback follows successful local persistence. Motion is limited to useful state changes; reduced motion is supported, with no scroll animation loop or new animation dependency.

The redesign preserves capabilities, not old screen positions or operation paths:

- Notes and tasks open/edit/complete directly; record More actions hold deletion and notebook renaming. Soft deletion retains undo and recovery.
- Notes and tasks have explicit Organize modes, exposing their existing touch/pointer/keyboard drag handles only when needed.
- On mobile, the notebook collection's Manage action opens focused notebook management. Desktop uses its notebook sidebar. The labelled mobile dock has a reserved area below scrolling content.
- The editor opens directly into title and content. Format expands existing commands; More → Note appearance opens six named colors. Text/highlight colors and app themes have separate entries. No editor instance is replaced when opening tools, appearance or app settings.
- Settings has Appearance, Sync and Recently Deleted sections, with a count of recoverable records. Mobile dialogs fit their content and available viewport.
- Save failures retain the draft. Action failures retain a retry path. Pending deletes/restores/completions block duplicate writes. Nested dialogs own Tab/Escape and restore focus to surviving controls after deletion.

[The interaction map](ui-interaction-map.md) maps each preserved capability to its new entry and records primary-source research supporting progressive disclosure.

Reference evidence was the parent's direct video inspection and supplied measurements. The seven reference image metadata records were accessible, but their byte downloads failed in this environment. This is a reference-led adaptation, not a claimed pixel-for-pixel source-image comparison. Actual desktop/mobile implementation screenshots were visually inspected, including narrow color palettes, mobile management, settings, compact editing, task feedback and notebook stacks. Visual review caught and corrected a palette clipping issue that earlier document-overflow checks alone missed.

No applicable repository AGENTS.md or local engineering/design SKILL.md was found. The Library and React best-practices skills were read when available; the single-file static preview workflow was inspected and excluded because this is a multi-file repository project.

## Feature preservation checklist

Checked means preserved by code review and local regression evidence; it does not mean live production/cloud acceptance.

- [x] Existing workspace/device keys and `smoke-notes-web` IndexedDB schema unchanged. No data reset or migration.
- [x] Notebook create, rename, select, pointer/touch/keyboard reorder, cascading trash, undo and restore reuse original repository methods and record identities.
- [x] Normal/checklist note creation, opening, title/body editing, six stored colors, previews, ordering, deletion, undo and Recently Deleted recovery.
- [x] Tiptap bold, italic, underline, strike, task lists, text/highlight palettes and clear actions; undo and IME behavior retained. Stored colors are unchanged; light-theme display remains legible.
- [x] Autosave, manual save, status/error/retry, save-before-navigation, background save and unsaved-unload warning retain the original serialized editor write logic.
- [x] Draft protection against stale reads, remote refresh/deletion, save races, IME, viewport changes and conflict copies remains covered by original core/editor regressions.
- [x] Standalone task create, edit-on-blur, complete/reopen, all/open/done filters, progress, reorder, delete/undo/restore and failed-draft retention. Completion success is announced only after the write succeeds.
- [x] Pairing code/URL gate, anonymous authentication, workspace persistence, loading/error handling, cloud adapter and backend contracts unchanged. Existing bootstrap/pairing/sync tests pass.
- [x] Settings still reaches pairing. Existing limitation: web bootstrap does not provide a code-generation controller; desktop generates QR/codes. The sample preview reports the existing unavailable state rather than simulating cloud success.
- [x] Offline-first repository, operation queue/retries/realtime/conflict/status contracts unchanged. Actual normal PWA build reloads offline, opens the cached lazy editor, saves and survives another reload.
- [x] Default/paper/glass themes and browser-local persistence, reduced transparency, forced-color fallback and reduced motion retained. Theme changes preserve editor identity and draft.
- [x] Mobile safe areas, compact keyboard viewport, labelled navigation and focus/Escape behavior. Notes retain scroll position across editor return and tab changes; task filters and notebook expansion remain stable during navigation.
- [x] Native desktop bridge/window state/recent tabs/transparency/pin/startup/tray/quit-save contracts unchanged. Desktop controls keep their existing defaults and regressions/build pass. Shared action failure guards are documented below.

## Verification

- Baseline: 36 files / 341 tests. Current branch: **38 files / 350 tests**, all pass. No existing test cases were removed. Existing UI tests now use the changed settings/deletion/format entry points while retaining draft, persistence and theme assertions.
- Nine added test cases cover notebook identity/expansion, failed/IME creation, duplicate creation/newer drafts, failed/duplicate task completion, browsing continuity, delete failure/retry/pending guard, restore/pairing section paths, and editor identity/selected text formatting/note color save success and failure.
- TypeScript, ESLint, Prettier and `git diff --check` pass. No lint/test rule was disabled. The review output directory follows existing generated-output ignore conventions.
- Full web/PWA, desktop renderer and Electron builds pass, as does the isolated review build. Existing large-chunk warnings remain; no dependency/lockfile changes were introduced.
- `tools/review-web-ui.py`: desktop/mobile note/task/notebook CRUD, filters, save/reload, deletion/undo, keyboard ordering, paper/glass/reduced transparency, offline editing, checklist save, compact draft retention, unavailable pairing, responsive widths 320/390/768/1024/1440 and reduced motion. Zero page errors.
- `tools/review-mobile-ux.py`: fresh touch contexts at 320×568, 360×640, 390×844, 430×932; labelled 44px navigation outside content, touch drag, scrolling/tab continuity, checklist return, create/edit/save/reload, long titles, empty states, delete/undo/Recently Deleted restore, deleting every example notebook then creating again. Zero page errors.
- `tools/review-progressive-ui.py`: selected text formatting, text/highlight palette and clear action, fully visible 44px palette targets, distinct note/app appearance, unchanged editor identity, keyboard menu navigation, focus return, saved formatting/color after reload, nested modal Tab/Escape and focus after deletion. Widths 320/390/1440. Zero page errors.
- A separate fresh browser against the normal built PWA verifies installed service worker, offline reload and cached editor, offline edit and a second offline reload. Zero page errors.

Physical iOS/Android keyboards and live hosted authentication/multi-device sync remain untested. Browser tests use disposable local sample data; none read or mutate the user's production records. The review entry has no cloud client or service worker.

## Entire baseline diff audit

The complete base-to-working-tree patch, all added files and untracked files were reviewed, not just the last commit. The current branch changes 39 files, including the later icon update and its release/desktop-plan documents.

| Files                                                                                               | Purpose and preserved boundary                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/ui/src/SmokeNotesApp.tsx`                                                                 | New web notebook/dock routing, session browsing state, editor More/menu and guarded delete. Original repository/save/refresh callbacks and native bridge remain.                                                        |
| `components/NotesWorkspace.tsx`, `TodoWorkspace.tsx`                                                | Web cards/progress, explicit ordering mode and secondary actions; task completion failure/pending handling also protects the shared native component.                                                                   |
| `components/WebNotebookCollection.tsx`, `Sidebar.tsx`                                               | Existing notebook identity/selection/create reused, focused mobile management, web secondary rename/delete. Native rename/delete buttons retained.                                                                      |
| `components/RichNoteEditor.tsx`                                                                     | Optional web progressive tools and appearance panel around existing editor/save logic. Default native toolbar/color controls remain.                                                                                    |
| `components/RecordActions.tsx`, `components/glass/WebDialog.tsx`, `useMobileSidebar.ts`             | Reusable secondary actions, root-level web modal portals to avoid clipped cards, nested focus handling and focus restoration after record unmount. Native settings/pairing still use their local portal host.           |
| `components/SettingsPanel.tsx`                                                                      | Web-only settings hierarchy. Native sections remain visible. Shared restore gains pending/failure handling.                                                                                                             |
| `apps/web/src/redesign.css`, `glass.css`                                                            | Web-only visual/layout/interaction/material rules, mobile adaptations, accessible focus and motion/contrast fallback. Legacy dark glass overrides intentionally replaced with light materials. Not imported by desktop. |
| `apps/web/src/main.tsx`, `index.html`, `vite.config.ts`                                             | One CSS import and launch/theme color changes only. Auth/cloud bootstrap, manifest identity, service-worker caching and routes retained.                                                                                |
| `apps/web/review.html`, `src/review.tsx`, `src/review.css`, `vite.review.config.ts`, `package.json` | Isolated sample entry/build/scripts in a separate database. Transactional seeding counts tombstones and never resets deleted demo notebooks. No production entry or credential changes.                                 |
| Four UI test files and three browser scripts                                                        | Retained regressions plus new interaction, race/error, responsive and focus verification. Only old UI navigation paths were adapted.                                                                                    |
| `.gitignore`, `.prettierignore`, `eslint.config.js`                                                 | Ignore generated `dist-review`; no permission or rule changes.                                                                                                                                                          |
| `packages/ui/src/icons/index.tsx` and shared component icon imports                                 | Unified decorative SVG geometry and semantic variants; no callback or accessible-name changes.                                                                                                                          |
| `docs/icon-release-review.md`, `docs/desktop-transparent-note-plan.md`                              | Current Cloudflare release blocker and planning-only Windows transparent-note guidance.                                                                                                                                 |
| This review and `ui-interaction-map.md`                                                             | Feature mapping, evidence, scope audit and remaining limits.                                                                                                                                                            |

No changes under `packages/core`, `apps/desktop`, `supabase` or `.github`, no dependency/lockfile changes, no credentials/database changes. Native window layout/materials remain unchanged; shared native controls receive the same new icon glyphs as web controls. No unrelated source removal or repository-wide formatting sweep.

## Review delivery

The interaction review screenshots and three browser JSON reports are under `/workspace/shared/smoke-ui-v3/`. Updated icon screenshots and the actual component SVG catalog are under `/workspace/shared/smoke-ui-icons/`; see [icon release review](icon-release-review.md) for its complete scope and current deployment blockers. Selected desktop/mobile deliverables are saved separately to Library, with their IDs in `library-files.json` in that directory. The icon review images supersede earlier images for icon appearance.

For local interaction, run `pnpm --filter @smoke-notes/web build:review` and `pnpm --filter @smoke-notes/web preview:review`, then open `/review.html`. In this execution environment the verified sample preview is served at `http://127.0.0.1:4173/review.html`; that address is local to the environment, not a public link. The preview explicitly says it contains example data saved only in that browser.

The user subsequently authorized deployment to the existing Cloudflare Pages site. Release remains blocked by unavailable Cloudflare access and missing verified production frontend configuration; see `icon-release-review.md`. PR #1 and its pipeline activation remain separate. No production deployment, merge, credential/database change or new CI permission has occurred.
