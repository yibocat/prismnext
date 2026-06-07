# Unified Git Worktree — Design Spec

**Date:** 2026-06-06
**Status:** Approved — ready for implementation plan

## Goal

Replace the federated multi-unit worktree orchestration with a **standard, unified git worktree** system. One project = one git repo = standard `git worktree add/remove/merge`. No backward compatibility needed.

## Motivation

### Current (federated) problems

- Each unit folder has its own `.git/` → N git repos to manage
- "Worktree" requires N × `git worktree add` + collection root assembly
- Collection root is NOT a git repo — AI's cwd is a filesystem fiction
- No cross-unit atomic commits or merges
- Merge = N independent merges, partial failure risk
- `syncWorktree()` patches, rollback logic, non-Git unit fallback — all complexity that shouldn't exist
- ~2600 lines of orchestration code for what git does natively

### What we gain

- Standard `git worktree` — one command, full git semantics
- AI cwd IS a real git repo — `git status`, `git diff`, `git log` all work
- Atomic commits and merges across all files
- Service layer: 350→80 lines
- Zero orchestration code — git handles everything

## Architecture

### Physical layout

```
projectRoot/                              ← The ONE git repo
├── .git/
├── .gitignore                            ← ignores .prismnext/compile/, .prismnext/worktrees/
├── chapter1/                             ← unit folder (organizational concept, preserved)
│   └── main.tex
├── chapter2/
│   └── intro.tex
├── figures/
├── references.bib
├── main.tex
└── .prismnext/
    ├── compile/                           ← gitignored
    └── worktrees/
        └── calm-owl/                      ← standard git worktree (gitignored)
            ├── .git → ../../../.git       ← auto-created by git
            ├── chapter1/
            ├── chapter2/
            ├── figures/
            └── ...
```

**Key principles:**

1. ONE git repo at projectRoot — no unit-level git management
2. Standard `git worktree add -b wt-<name> .prismnext/worktrees/<name>` — one command
3. AI cwd = the worktree path — a real git repo
4. Unit folders are an **organizational concept** (preserved for future extensibility), NOT a version control boundary
5. No collection root assembly, no symlinks, no sync, no rollback orchestration

## Data Flow

### Flow 1: Create Worktree

```
User clicks "New worktree" → auto-named "calm-owl"

git -C projectRoot worktree add -b wt-calm-owl .prismnext/worktrees/calm-owl

AI cwd = .prismnext/worktrees/calm-owl/
```

### Flow 2: AI Edit → Accept

```
1. use-cli-events.ts captures tool_use → changesStore.addChange({
     id, filePath (relative to worktree root),
     absolutePath (worktree path), oldContent, newContent, toolName
   })

2. User clicks Accept:
   cd <worktree-root>
   git add <filePath>
   git commit -m "AI edit: ..."
   → Commit on wt-calm-owl branch
   → projectRoot main branch UNCHANGED
```

### Flow 3: Merge Worktree → Main

```
1. git log main..wt-calm-owl --oneline   → show ahead commits
2. git checkout main && git merge wt-calm-owl   → atomic merge
3. Conflict? Standard git merge conflict — user resolves in editor + Git Panel
4. Success? git branch -d wt-calm-owl; git worktree remove <path>
```

### Flow 4: Delete Worktree (abandon)

```
git worktree remove --force .prismnext/worktrees/<name>
git branch -D wt-<name>
```

## Service Layer

### `worktree.ts` — simplified (~80 lines)

```typescript
// Types (simplified — no units, no nonGitUnits)
interface WorktreeInfo {
  name: string;
  path: string;        // absolute path
  branch: string;      // "wt-calm-owl"
  head: string;        // latest commit SHA
  aheadCount: number;
  createdAt: number;
}

interface MergeStatus {
  branch: string;
  aheadCount: number;
  commits: { hash: string; message: string }[];
}

// Functions (4 total)
createWorktree(projectRoot, name?)   → git worktree add -b wt-<name> ...
removeWorktree(projectRoot, name)    → git worktree remove --force + branch -D
listWorktrees(projectRoot)           → git worktree list --porcelain → parse
getMergeStatus(projectRoot, name)    → git log main..wt-<name> --oneline
```

**Removed:** `detectGitUnits()`, `syncWorktree()`, `copyDirVisible()`, rollback logic, non-Git unit handling, collection root assembly.

### `git.ts` — small adjustments

- **Remove** `commitInWorktree()` — use existing `commit()` directly on worktree path
- **Keep** `mergeBranch()`, `getLog()`, `getStatus()`, `getBranches()` — all work correctly when cwd = worktree path
- **Add** `getWorktreeList(projectRoot)` — parse `git worktree list --porcelain`

### IPC — same channels, simplified types

- `worktree:list` → `WorktreeInfo[]`
- `worktree:create` → `WorktreeInfo`
- `worktree:remove` → `void`
- `worktree:mergeStatus` → `MergeStatus` (single, not array)

## Store Changes

### `worktree-store.ts`

- `mergeStatus` from `MergeStatus[] | null` → `MergeStatus | null`
- Remove all unit-related state
- Actions unchanged

### `changes-store.ts`

- Remove `unitName?: string` and `isGitUnit?: boolean` from `ProposedChange`
- Accept always = git commit in worktree (no fsWrite fallback)

### `document-store.ts`

- Remove `ensureProjectGit()` — if project has no git at creation, `git init` once

### `git-store.ts`

- Add `worktreeContext: string | null` — active worktree path, null = main
- Git queries use `worktreeContext ?? projectRoot` as cwd

## UI Changes

### `git-sidebar.tsx` — forward refactor

**Current:** Patched to hide project-level git. No worktree awareness.

**New:**
- Git root = `worktreeContext ?? projectRoot`
- When in worktree: show "Branch: wt-calm-owl [worktree]" badge
- Show ahead-of-main count with "Merge into main" button
- All git operations (stage/unstage/discard/diff) target the active context
- Standard git panel UX otherwise

### `worktree-selector.tsx`

Simplified: no unit count display, no non-Git unit indicators.

### `merge-worktree-dialog.tsx`

Single-view: one branch → one merge. Show commit list, single "Merge into main" button.

### `files-sidebar.tsx`

File tree root = `worktreeContext ?? projectRoot`. When in worktree, files reflect worktree branch state.

### `use-cli-events.ts`

Remove unit name resolution. File paths are relative to worktree root directly.

## Unit Folder Concept (preserved)

Unit folders (chapter1/, chapter2/, figures/, etc.) remain as an organizational concept:
- Currently hardcoded in some places
- Future: free creation/deletion of unit folders
- Worktree design is independent of unit folder logic — git treats them as regular directories
- Unit folder management is a separate concern (filesystem + UI), not coupled to git/worktree

## `.gitignore`

```gitignore
# LaTeX build artifacts
*.aux *.log *.out *.toc *.bbl *.blg *.synctex.gz
*.fdb_latexmk *.fls *.xdv *.nav *.snm *.vrb

# Build & cache
.prismnext/compile/

# Worktree directories
.prismnext/worktrees/

# System
.DS_Store Thumbs.db
*.swp *.swo *~
```

## Files Changed

| File | Change | Description |
|------|--------|-------------|
| `main/services/worktree.ts` | **Rewrite** | 350→80 lines, standard git worktree only |
| `main/services/git.ts` | **Adjust** | Remove `commitInWorktree`, add `getWorktreeList` |
| `main/ipc/worktree.ts` | **Adjust** | Same channels, simplified return types |
| `main/ipc/git.ts` | **Minimal** | May not need changes |
| `preload/index.ts` | **Adjust** | Type sync |
| `renderer/types/electron.d.ts` | **Simplify** | Remove `WorktreeUnitInfo`, `MergeStatus[]`→`MergeStatus` |
| `renderer/stores/worktree-store.ts` | **Simplify** | Single merge status, no units |
| `renderer/stores/changes-store.ts` | **Simplify** | Remove `unitName`, `isGitUnit` |
| `renderer/stores/document-store.ts` | **Clean** | Remove `ensureProjectGit` |
| `renderer/stores/git-store.ts` | **Add** | `worktreeContext` awareness |
| `renderer/components/layout/right-sidebar/git-sidebar.tsx` | **Refactor** | Worktree-aware git panel |
| `renderer/components/layout/right-sidebar/files-sidebar.tsx` | **Adjust** | Worktree-aware file tree |
| `renderer/components/modules/chat/worktree-selector.tsx` | **Simplify** | No unit display |
| `renderer/components/modules/chat/merge-worktree-dialog.tsx` | **Simplify** | Single merge view |
| `renderer/components/layout/left-main-area.tsx` | **Adjust** | Merge button logic |
| `renderer/hooks/use-cli-events.ts` | **Simplify** | Remove unit resolution |

## Edge Cases

1. **No git at project root**: `git init` + initial empty commit on project creation
2. **Worktree name collision**: Error, suggest different name or delete existing
3. **Zombie branch** (branch exists but worktree dir doesn't): Clean branch before creating
4. **Main has uncommitted changes**: Warn user; worktree branches from HEAD (uncommitted changes won't appear)
5. **Merge conflict**: Standard git merge conflict — user resolves via editor + Git Panel, or `git merge --abort`
6. **Pending changes in worktree when merging**: Block merge, prompt user to Accept/Reject all first
7. **Worktree dirty on delete**: `git worktree remove --force` handles it
