# Daily planner and mobile refinements — review, 2026-10-20

Branch: `feat/dock-directional-stretch`. Main baseline remains `43820f0f0aec48c9adf8ad60d62e9f0f8c7b66db`. This supersedes the earlier 35% dock review: the current maximum capsule width is 130%.

## Delivered behavior

- Existing dock capsule trails motion, stretches at most 30%, and settles softly on release. Only the background deforms; labels and icons retain geometry. Pages change on release. Cancellation, Escape, keyboard navigation and reduced motion remain supported.
- The recording's orange contact ring was a test overlay. The product's yellow/blue rectangle was a programmatic `:focus-visible` outline, with its color inverted over the white capsule by existing difference blending. Pointer interaction now suppresses that outline; keyboard input restores visible focus. New recordings contain no contact-marker or caption overlays.
- Existing note-header stacking now puts the new-note menu above paper cards. Mobile compact editing also handles cramped portrait viewports. Save was already reachable in the baseline simulation and remains reachable; usable text height improves from 156 to 233px in the tested viewport. Card/group spacing and text contrast improve; text line spacing and genuine paper-stack offsets are retained.
- Existing Todo page now offers Today, All and History, quick create with optional date/repetition/notes, completed counts and collapsible completed/skipped groups. Completion has undo and is separate from recoverable deletion.
- Local repository supports once/daily/weekdays/selected weekdays, Hong Kong midnight or 04:00, deterministic daily instances, launch/resume catch-up, overdue one-time rescheduling, skip today, next-day rule changes/pause/resume/stop and preserved history. Legacy records remain intact; their display date falls back to their existing updatedAt Hong Kong date because no due date existed.
- IndexedDB/outbox/Supabase protocol implements independent-field conflict merging, revision/event retention, stale offline-rule reconciliation and capability gating. All todos remain recoverable beyond the old trash-expiration window. Local-only, pending and sync failure states are not represented as synced.

## Validation

- Full Vitest suite: **425 passed, 45 files**; includes 149 core tests and UI integration tests for Hong Kong midnight and persisted 04:00 settings.
- `pnpm typecheck`, `pnpm lint`, changed-file Prettier and `git diff --check`: passed.
- Web production, desktop renderer/Electron and isolated review build: passed. Existing bundle-size and future Vite config-loader advisories remain non-failing. No installer built.
- Real PostgreSQL 17 temporary-container mutation regression: **31 passed**. Edge validation/schema tests: **12 passed**, also included in full Vitest run. No hosted service was mutated.
- Real Chromium dock acceptance at 320/390/430/1440px plus reduced motion: slow/fast/reverse/boundaries/cancel/Escape/release-only/focus/keyboard all passed. 2,126 sampled frames remained within bounds and at or below 130%; reduced-motion width stayed 100%. Labels/icons did not deform.
- Mobile note UI at 320/390/430/1194px: menu hit testing, ordinary/todo creation, simulated keyboard viewport and persisted saves passed. Existing five-cycle mobile/desktop paper-stack motion/identity/depth/scroll regression passed.
- Actual planner UI recording/test: create once/daily/weekdays/notes, complete/undo, skip, reschedule, pause/resume/stop, offline Hong Kong midnight, multi-day catch-up/reopen without duplication, history categories and persisted 04:00 settings passed. Five dates were materialized once each; prior completion and stopped-series history remained. No browser page errors.
- Multi-device/offline conflict coverage uses real local databases and test adapters; PostgreSQL tests cover server concurrency. Hosted Supabase Auth/PostgREST/Realtime/Edge end-to-end testing remains pending. Physical mobile/Safari keyboard behavior has not been tested; viewport keyboard tests are simulations.

## Review assets

Clean mobile videos and original before/after screenshots are under `/workspace/shared/planner-release/deliverables/`. Raw browser outputs are under `/workspace/shared/dock-trailing-30/`, `/workspace/shared/planner-release/` and `/workspace/shared/mobile-refinement/`.

User-supplied reference image metadata was accessible but signed materialization failed; those original pixels were not inspected. The menu obstruction and focus-outline causes were independently reproduced and inspected in the browser.

## Release boundary

**Code review ready; not ready to publish planned cloud synchronization directly.** See [backend migration and release order](todo-planning-backend.md). The additive database migration and updated Edge Function must be deployed through a separately authorized release, then tested on the hosted stack with two devices before client release. This task did not attempt that deployment and did not obtain new credentials or permissions. Main was not merged or deployed; the user's offline computer was not accessed; no installer was regenerated.
