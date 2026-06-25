# Git Diff & Changes Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or inline execution with checkpoints.

**Goal:** Compact CM diff hunks, Changes toolbar ⋯ menu, split layout, ignore-ws, word wrap, collapse all, refresh, basic push.

**Architecture:** `git-diff-prefs-store` feeds refactored `GitDiffView`; `git-changes-overflow-menu` in toolbar; `git-store` collapse/clearDiffs; main `git push` IPC.

**Tech Stack:** `@codemirror/merge` 6.11+, Zustand persist, Electron IPC.

**Spec:** `docs/superpowers/specs/2026-06-23-git-diff-toolbar-spec.md`

---

## Phase 1 — Prefs + compact unified diff

- [ ] `src/renderer/stores/git-diff-prefs-store.ts`
- [ ] `src/renderer/lib/git/diff-display.ts` — `COLLAPSE_UNCHANGED`, `trimLinesForWsDiff`
- [ ] `git-diff-view.tsx` — `collapseUnchanged`, prefs hooks, word wrap compartment
- [ ] `diff-overrides.ts` — collapsed-unchanged widget styles
- [ ] `git-store.ts` — `collapseAllChanges`, `clearAllDiffs`

## Phase 2 — Overflow menu + shortcuts

- [ ] `git-changes-overflow-menu.tsx`
- [ ] `git-toolbar.tsx` — mount menu before actions
- [ ] `use-right-area-shortcuts.ts` — ⌘R when `focusedMode === "git"`

## Phase 3 — Split layout

- [ ] `git-diff-view.tsx` — `MergeView` branch when `layout === "split"`
- [ ] CSS for split in inline rows

## Phase 4 — Ignore whitespace

- [ ] Apply `trimLinesForWsDiff` to diff inputs when pref on
- [ ] Toggle clears diffs via `clearAllDiffs`

## Phase 5 — Push

- [ ] `main/services/git.ts` — `pushBranch`
- [ ] `main/ipc/git.ts`, preload, `electron.d.ts`
- [ ] Overflow menu Push item + `git-store.pushRemote`

## Tests

- [ ] `tests/renderer/git-diff-display.test.ts`
- [ ] `tests/main/git-push.test.ts` (mock exec if pattern exists)

## Verify

```bash
cd prism-next && npx tsc --noEmit
pnpm exec vitest run tests/renderer/git-diff-display.test.ts
```
