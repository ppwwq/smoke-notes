# SmokeNotes Web redesign review

Base: `main` at `5e669b2278a42733baaf3126b0b9c4472b8b732e`. Dedicated branch: `codex/smoke-notes-ui-redesign`. PR #1 is unrelated and untouched.

## Reference and scope

Web only, responsive desktop and mobile. Verified Douyin reference: warm off-white canvas, heavy black sans-serif titles, generous space, large softly rounded pastel/lilac cards, near-black action cards, lime action buttons, light separators, black floating capsule navigation with a white selected pill. Motion chapters: completion feedback, linked checkboxes, stacked expansion, snapping cards, inertia, circular reveal. Apply only where the existing notes workflow benefits. No timer, finance, or unrelated dashboard features.

No applicable repository AGENTS.md or local engineering/design SKILL.md was found (dependency guidance does not apply to application code); cloud skills are unavailable in this execution environment.

## Feature preservation checklist (verified from code)

- [ ] Existing workspace/device localStorage keys and `smoke-notes-web` IndexedDB schema remain unchanged. No data reset or migration.
- [ ] Notebook create, rename, select, drag/keyboard reorder, delete with cascading trash, restore.
- [ ] Normal and checklist notes: create, open, edit title/body, six note colors, preview, reorder, delete, immediate undo, Recently Deleted restore.
- [ ] Tiptap rich text: bold, italic, underline, strike, task list, text color/highlight palettes and clear actions; keyboard editing/undo and IME composition.
- [ ] Debounced autosave, explicit save, save status/error/retry, flush before navigation, background save, unsaved unload warning.
- [ ] Preserve drafts during stale reads, remote updates, delete/restore, save races, IME and viewport changes; conflict copy behavior unchanged.
- [ ] Standalone todos: create, edit on blur, complete/reopen, all/open/done filters, progress, drag/keyboard reorder, delete/undo/restore, failed drafts retained.
- [ ] Web pairing gate: numeric code, URL code, anonymous auth, workspace persistence and existing error/loading handling.
- [ ] Pairing settings entry/error state retained. Current web bootstrap does not supply a pairing-generation controller (existing limitation); desktop generates QR/codes. Do not falsely claim web generates codes.
- [ ] Offline-first rendering before network auth; sync queue, retries, realtime refresh, conflict handling, sync status. PWA manifest/service worker/cache behavior retained.
- [ ] Default/paper/glass background choices, browser persistence, reduced transparency and system preferences retained.
- [ ] Mobile drawer focus trap, Escape/outside close, focus restoration; dialog focus behavior; compact keyboard editing and safe-area support.
- [ ] Desktop bridge, window state, recent tabs, transparency, pin, startup, tray and quit-save coordination remain untouched; shared regressions run.

## Regression coverage and boundaries

Existing suite: 36 files / 341 tests documented on main; baseline rerun passed: 36 files / 341 tests. Includes core repository/domain/content/merge/cloud/sync/runtime tests; UI editor/drafts/IME/viewport/dialog/navigation/reorder/todos/pairing/status tests; Electron window lifecycle/quit tests; web offline/auth bootstrap tests. PostgreSQL integration tests exist but no backend changes are planned, and this task must not access a production database.

Browser validation uses isolated example data on a separate preview origin. Live hosted auth, real paired devices and native Windows behavior are not asserted by local browser tests.

## Delivery

Implementation, checks, screenshots, and preview verification will be recorded here after completion. No merge or production deployment is authorized.

## Safe checkpoint for xhigh continuation

- Baseline verified with `pnpm_config_verify_deps_before_run=false pnpm test` (the environment supplies pnpm 11, whose default dependency check tries to reinstall the existing pnpm 10 tree; the environment-only flag avoids that and does not change repo configuration).
- Initial web-only presentation markup added: four-action capsule navigation; notebook summary and quick-capture cards; todo progress card. Desktop rendering retains existing markup branches.
- **Not visually finished**: `apps/web/src/redesign.css` still needs to be implemented and imported after `glass.css`. No screenshots or accessible preview have yet been delivered. No branch push, PR, merge, deployment, database, credentials or CI changes.
- Python Playwright and `/usr/bin/chromium` are installed. Use real browser automation with isolated sample data for screenshots. Node Playwright is not available at repo root. Browser artifacts should be saved under `/workspace/shared` and uploaded through Library tools, returning `library_file_id` per user request.
- Available hosting tools discovered are Sites and Vercel; Sites tool documentation explicitly calls all its URLs production, so do not use it for this no-production task. Inspect alternative preview support or a temporary tunnel, and verify accessibility before claiming delivery.
- Verified reference updates received: warm off-white / cream background, heavy black sans serif Today / Focus headings, ample whitespace, large round lilac progress card; near-black Focus card with lime Done button and little stacked-books illustration; black floating capsule dock with four white icons and a white selected capsule; flat cards, subtle shadows, compact black/white rows and fine gray separators. Parent may send further screenshots.
- User prioritizes actual desktop/mobile webpage screenshots, including main screens and expanded states; upload full-resolution originals to Library. Keep production untouched until review.

Additional verified reference: Lists uses full-width large-round cards (lilac Home, lime Work, white Learn, near-black Travel), stacked when collapsed and separated vertically when expanded; small uppercase subtitles, task rows, right-aligned counts. Plan uses a narrow vertical timeline and rounded time blocks with orange selection. Remind uses oversized time, two-column wheel, lavender selected capsule and black full-width pill action. Habits uses near-black canvas with lime figures/dots and thin lilac/lime/orange progress bars. These are visual/interaction references only, not authorization to add unrelated modules. No official demo URL was verified in the video description.
