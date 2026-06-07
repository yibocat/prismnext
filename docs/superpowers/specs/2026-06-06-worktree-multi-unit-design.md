# Multi-Unit Git Worktree Orchestration — Design Spec

**Date:** 2026-06-06
**Status:** Draft — awaiting user review

## Goal

Replace the project-level Git worktree hack with a **multi-unit worktree orchestration system**. Each unit folder that has `.git/` gets its own standard git worktree. The system orchestrates `git worktree add/remove/merge` across all unit repos, presenting a unified collection view to the AI. The AI's `cwd` points to a merged collection root assembled via symlinks.

## Motivation

### Current problems

- Project-level Git exists solely to support `git worktree add`, creating a double-layer Git architecture that leaks into the UI
- `*/ **` in `.gitignore` causes the fundamental contradiction between clean `git status` and worktree file completeness
- Snapshot hacks, temporary `.gitignore` modifications, and main-branch pollution
- No Git history for AI edits — changes are written directly to projectRoot via `fsWrite`, bypassing unit Git entirely

### What we gain

- Standard git worktrees with full Git semantics per unit: branches, commits, diff, revert, merge
- AI edits are versioned — each Accept creates a commit on a `wt-<name>` branch
- ProjectRoot files (main branch) unchanged until explicit merge
- User Git panel unaffected throughout — continues to show unit main branches
- No project-level Git, no `.gitignore` contradictions, no snapshot hacks

## Architecture

### Physical layout

```
projectRoot/                              ← No .git at this level
├── chapter1/
│   ├── .git/                             ← Unit Git (main branch lives here)
│   ├── .prismnext/worktrees/
│   │   └── calm-owl/                     ← chapter1's git worktree (wt-calm-owl branch)
│   │       └── main.tex                  ← checked out from chapter1/.git
│   ├── main.tex                          ← main branch file (projectRoot view)
│   └── ...
├── chapter2/
│   ├── .git/                             ← Unit Git
│   ├── .prismnext/worktrees/
│   │   └── calm-owl/                     ← chapter2's git worktree (wt-calm-owl branch)
│   ├── intro.tex                         ← main branch file
│   └── ...
└── .prismnext/
    └── worktrees/
        └── calm-owl/                     ← AI cwd — collection root (symlink assembly)
            ├── chapter1/    → symlink → ../../chapter1/.prismnext/worktrees/calm-owl/
            ├── chapter2/    → symlink → ../../chapter2/.prismnext/worktrees/calm-owl/
            └── (root-level visible files, copied)
```

**Key design decisions:**

- Each unit's worktree lives at `<unit>/.prismnext/worktrees/<name>/` — git's `worktree add` places it there naturally
- The collection root at `.prismnext/worktrees/<name>/` is an assembly via **symlinks** pointing to each unit's worktree
- No `.git` at the collection root — it's a plain directory, not a git repo
- Root-level files (not in any unit) are **copied** into the collection root; they don't participate in the worktree mechanism

### Unit Git vs Non-Git Units

- **Git units** (have `.git/`): get a full `git worktree add`, branch `wt-<name>`, all git operations
- **Non-Git units** (no `.git/`): their files are copied to the collection root as plain files. AI edits to these files go through the old `fsWrite` path (write back to projectRoot on Accept)

## Data Flow

### Flow 1: Create Worktree "calm-owl"

```
User clicks "New worktree" → auto-named "calm-owl"

For each unit with .git/:
  git -C chapter1 worktree add -b wt-calm-owl .prismnext/worktrees/calm-owl
  git -C chapter2 worktree add -b wt-calm-owl .prismnext/worktrees/calm-owl

Assemble collection root:
  mkdir -p .prismnext/worktrees/calm-owl/
  ln -s ../../chapter1/.prismnext/worktrees/calm-owl .prismnext/worktrees/calm-owl/chapter1
  ln -s ../../chapter2/.prismnext/worktrees/calm-owl .prismnext/worktrees/calm-owl/chapter2
  Copy root-level visible files (not starting with "."; skip compile artifacts)

For non-Git units:
  Copy their files into collection root (like existing copyProjectToWorktree logic)

AI cwd = .prismnext/worktrees/calm-owl/
```

### Flow 2: AI Edits → Accept

```
AI edits .prismnext/worktrees/calm-owl/chapter1/main.tex
  → File is physically at chapter1/.prismnext/worktrees/calm-owl/main.tex
     (the symlink resolves transparently)

use-cli-events.ts captures tool_use:
  → oldContent: captured from the worktree file before edit
  → newContent: derived from Edit/Write/MultiEdit input
  → changesStore.addChange({
      id: toolUseId,
      filePath: "chapter1/main.tex",
      absolutePath: worktree/chapter1/main.tex,   ← worktree path!
      unitName: "chapter1",                        ← which unit owns this
      oldContent, newContent, toolName
    })

User clicks Accept:
  → For Git units:
    git -C chapter1 add main.tex
    git -C chapter1 commit -m "AI edit: ..."
    Commit lands on chapter1's wt-calm-owl branch
    ProjectRoot chapter1/main.tex is UNCHANGED (still main branch content)
  → For non-Git units:
    fsWrite(projectRoot/<path>, newContent)   ← fallback to old path
```

### Flow 3: Merge Worktree → Main

```
User clicks "Merge worktree" → MergeWorktreeDialog opens

Dialog scans each unit:
  git -C chapter1 log main..wt-calm-owl --oneline   → 3 commits
  git -C chapter2 log main..wt-calm-owl --oneline   → 1 commit

Display:
  ┌─────────────────────────────────────────────┐
  │ Merge Worktree: calm-owl                    │
  │                                             │
  │ chapter1    3 commits ahead of main         │
  │   a1b2c3d AI edit: main.tex                 │
  │   e4f5g6h AI edit: figures/plot.png         │
  │   i7j8k9l AI edit: references.bib           │
  │                                             │
  │ chapter2    1 commit ahead of main          │
  │   m0n1o2p AI edit: intro.tex                │
  │                                             │
  │ [Merge All]  [Cancel]                       │
  └─────────────────────────────────────────────┘

User clicks "Merge All":
  For each unit:
    1. git -C chapterX checkout main
    2. git -C chapterX merge wt-calm-owl
    3. If merge conflict → skip, mark in dialog as conflicted
    4. If success → git -C chapterX branch -d wt-calm-owl (optional)
  
  After merge:
    - projectRoot/chapterX/<files> now reflect merged state
    - Git panel (chapterX) shows new merge commit
    - User can delete the worktree collection if desired
```

## Key Data Structures

```typescript
interface WorktreeInfo {
  name: string;                    // "calm-owl"
  path: string;                    // absolute path to collection root
  units: WorktreeUnitInfo[];       // one per Git unit
  nonGitUnits: string[];           // unit names without .git (file copy)
  createdAt: number;
}

interface WorktreeUnitInfo {
  unitName: string;                // "chapter1"
  unitPath: string;                // absolute path to unit in projectRoot
  worktreePath: string;            // absolute path to this unit's worktree
  branch: string;                  // "wt-calm-owl"
  head: string;                    // latest commit SHA on wt-calm-owl
  aheadCount: number;              // commits ahead of main
}

interface ProposedChange {
  // ... existing fields ...
  unitName?: string;               // NEW: which unit owns this file
  isGitUnit?: boolean;             // NEW: whether Accept should git commit
}
```

## Files Changed

| File | Change | Description |
|------|--------|-------------|
| `main/services/worktree.ts` | **Rewrite** | `createWorktree`: `git worktree add` per unit + symlink assembly; `removeWorktree`: cleanup collection + per-unit `git worktree remove`; `listWorktrees`: scan `.prismnext/worktrees/`; `getMergeStatus`: ahead counts |
| `main/services/git.ts` | **Add** `mergeWorktreeBranch`, `getAheadCount`, `getWorktreeBranchLog` | Support merge from worktree branch to main |
| `main/ipc/worktree.ts` | **Rewrite** | Channels: `worktree:list`, `worktree:create`, `worktree:remove`, `worktree:merge` |
| `main/ipc/git.ts` | **Add** handlers | `git:mergeWorktree`, `git:aheadCount`, `git:worktreeLog` |
| `preload/index.ts` | **Modify** | Expose new worktree + git channels |
| `renderer/types/electron.d.ts` | **Modify** | Update `WorktreeInfo`, add `WorktreeUnitInfo`, update API signatures |
| `renderer/stores/worktree-store.ts` | **Rewrite** | New state: `worktrees[]`, `activeWorktree`, `mergeStatus`; actions: `createWorktree`, `removeWorktree`, `mergeWorktree`, `refreshMergeStatus` |
| `renderer/stores/changes-store.ts` | **Modify** | `acceptChange` behavior: for Git units → git commit in worktree branch; for non-Git → `fsWrite` to projectRoot |
| `renderer/components/modules/chat/worktree-selector.tsx` | **Rewrite** | Show worktree list, create, delete; remove "Setup project git" |
| `renderer/components/modules/chat/merge-worktree-dialog.tsx` | **NEW** | Merge dialog: per-unit ahead status, Merge All, conflict handling |
| `renderer/components/layout/left-main-area.tsx` | **Modify** | Add "Merge worktree" button (visible when worktree is active) |
| `renderer/hooks/use-cli-events.ts` | **Modify** | `registerProposedChange`: resolve unit name from file path; store unit info in change |
| `renderer/components/layout/right-sidebar/git-sidebar.tsx` | No change | Already patched to not show project Git |

## Error Handling

- **Worktree creation fails for one unit**: Roll back all units' worktrees created so far. Inform user which unit failed.
- **Merge conflict**: Skip the conflicted unit. Mark it in the dialog. User resolves in Git panel (standard git merge conflict resolution).
- **Symlink creation fails** (Windows without symlink permission): Fall back to directory copy for that unit.
- **Non-Git unit**: Silently handled — file copy instead of worktree; Accept uses `fsWrite`.
- **Unit has uncommitted changes on main when creating worktree**: Warn user. `git worktree add` will still work (it branches from HEAD), but main's uncommitted changes won't be in the worktree.

## Scope / Non-Goals

**In scope:**
- Create/remove/list multi-unit worktrees
- AI edits → Accept → git commit on worktree branch
- Merge worktree branch → main for all Git units
- Per-unit merge status display
- Non-Git unit fallback

**Out of scope (future):**
- Individual unit worktree operations (only one unit at a time)
- Worktree rebase (instead of merge)
- Cherry-pick individual commits from worktree branch
- Partial worktree (only some units; currently all or nothing)
- Worktree persistence across app restarts (same as current behavior)

## Verification

1. Create a test project with 2 unit folders, both `git init`-ed
2. Create a worktree via the selector — verify symlink collection root exists
3. Verify each unit has `wt-<name>` branch with worktree at `<unit>/.prismnext/worktrees/<name>/`
4. Edit a file in one unit's worktree — verify changesStore captures it
5. Accept — verify commit lands on `wt-<name>` branch; verify projectRoot file unchanged
6. Verify `git log main..wt-<name> --oneline` shows the commit
7. Open merge dialog — verify ahead counts are correct
8. Merge — verify units merge to main, projectRoot files update, Git panel shows merge commit
9. Delete worktree — verify collection root removed, per-unit worktrees removed, branches deleted
