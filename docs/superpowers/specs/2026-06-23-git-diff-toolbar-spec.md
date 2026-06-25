# Git Diff & Changes Toolbar Spec

**Date:** 2026-06-23  
**Status:** Approved for implementation

## Goal

Bring prism-next Git Changes UX closer to Cursor: compact hunks-only diffs, toolbar overflow actions, optional split layout, and basic remote push—without GitHub OAuth integration.

## Non-Goals

- Find in Changes (⌘F across all diffs) — deferred
- GitHub login / PR UI
- Blocking branch switch on unstaged changes (Git decides)

## Features

### F1 — Compact diff (collapse unchanged)

- All `GitDiffView` instances use CodeMirror `collapseUnchanged: { margin: 3, minSize: 4 }`
- Applies to Changes main list, History commit files, and any future consumers
- Unchanged regions show as fold widgets (*N unmodified lines*), expandable via CM

### F2 — Changes toolbar overflow (⋯)

Visible when `sidebarView === "changes"` and git repo, left of Commit / Merge actions.

| Item | Behavior |
|------|----------|
| Layout → Unified | Default; inline merge view |
| Layout → Split | Side-by-side `MergeView` |
| Ignore Whitespace | Toggle; re-diff with line-trim comparison |
| Word Wrap | Toggle `EditorView.lineWrapping` (default on) |
| Collapse All | `expandedChangeIds = []` |
| Refresh Changes | `refreshStatus` + `refreshBranches`; ⌘R in git mode |
| Push | `git push` (see F5) |

### F3 — Diff preferences store

- `git-diff-prefs-store.ts` (Zustand + `localStorage` persist)
- Fields: `layout`, `wordWrap`, `ignoreWhitespace`
- Toggling `ignoreWhitespace` clears cached file diffs in `git-store`

### F4 — Split layout

- `MergeView` from `@codemirror/merge` for split mode
- Same themes, collapse, word wrap, read-only as unified
- Inline list rows (`fillViewport=false`): auto height, no nested scroll trap

### F5 — Push (basic)

- Main: `git push` / `git push -u origin <branch>` when no upstream
- IPC `git:push`; toast on success/failure
- Menu item **Push** in overflow (local checkout only, not worktree merge flow)

## Architecture

```
git-diff-prefs-store ──► GitDiffView (unified | split)
                      └──► git-changes-overflow-menu

git-store ◄── Collapse All / Refresh / clear diffs on ws toggle
git.ts (main) ◄── git:push
```

## Acceptance

- [ ] Expanded diff shows folded unchanged blocks with ~3 lines context
- [ ] ⋯ menu toggles layout / wrap / ignore-ws; Collapse All works
- [ ] ⌘R refreshes git status in git mode
- [ ] Split shows left-old / right-new for a changed file
- [ ] Push runs `git push` and surfaces errors in toast
- [ ] `tsc` + targeted vitest pass
