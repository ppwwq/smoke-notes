# Task Item Layout Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make todo-note checkboxes circular and keep each checkbox on the same row as its text.

**Architecture:** Give Tiptap's live TaskItem NodeView a stable CSS class through its supported `HTMLAttributes` option. Style and test that class instead of depending on a `data-type` attribute that the NodeView does not emit.

**Tech Stack:** React, TypeScript, Tiptap 3, CSS, Vitest, Testing Library

---

### Task 1: Lock down and fix task-item styling

**Files:**

- Modify: `packages/ui/src/components/RichNoteEditor.tsx`
- Modify: `packages/ui/src/styles.css`
- Modify: `packages/ui/tests/RichNoteEditor.test.tsx`
- Modify: `packages/ui/tests/styles.test.ts`

- [ ] **Step 1: Write the failing DOM regression test**

Add an assertion to the existing task-item test that the checkbox's closest `li` has class `task-list-item`.

- [ ] **Step 2: Run the focused component test**

Run: `.\node_modules\.bin\vitest.cmd run packages/ui/tests/RichNoteEditor.test.tsx --reporter=verbose`

Expected before implementation: FAIL because the rendered `li` has no `task-list-item` class.

- [ ] **Step 3: Write the failing CSS contract test**

Assert that `.rich-note-content li.task-list-item` uses `display: flex`, and `.rich-note-content li.task-list-item input[type="checkbox"]` uses `border-radius: 50%`.

- [ ] **Step 4: Run the focused style test**

Run: `.\node_modules\.bin\vitest.cmd run packages/ui/tests/styles.test.ts --reporter=verbose`

Expected before implementation: FAIL because the stylesheet still uses the absent `data-type` selector.

- [ ] **Step 5: Implement the minimal class-based fix**

Configure `TaskItem` with `HTMLAttributes: { class: "task-list-item" }`, then replace task-item `data-type` selectors in `styles.css` with `.task-list-item` selectors.

- [ ] **Step 6: Verify focused tests**

Run: `.\node_modules\.bin\vitest.cmd run packages/ui/tests/RichNoteEditor.test.tsx packages/ui/tests/styles.test.ts --reporter=verbose`

Expected: all focused tests pass.

- [ ] **Step 7: Verify the project**

Run: `.\node_modules\.bin\vitest.cmd run`, `.\node_modules\.bin\tsc.cmd -b`, and `corepack pnpm@10.19.0 --filter @smoke-notes/desktop build`.

Expected: tests, type checking, and desktop build exit successfully.
