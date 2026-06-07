# Branch Selector + Worktree Selector — Design Spec

**Date:** 2026-06-06
**Status:** Approved

## Goal

Split the current single worktree-selector into a **branch selector + worktree selector** dual model. Users pick a branch (the conceptual layer) and optionally create worktrees on it (the physical layer). One branch can have multiple worktrees; one worktree binds to one branch. Git panel supports branch switching with locked-branch awareness.

## Architecture

### Git Worktree Model (standard, no hacks)

```
Git repo (.git)
  ├── main worktree (projectRoot)
  │     branch: main
  │     index: independent
  │
  ├── worktree calm-owl (.prismnext/worktrees/calm-owl/)
  │     branch: wt-calm-owl  (forked from main)
  │     index: independent
  │
  └── worktree bright-fox (.prismnext/worktrees/bright-fox/)
        branch: wt-bright-fox (forked from main)
        index: independent
```

- **One branch → many worktrees**: `main` can be the base for multiple worktrees, each creating its own `wt-*` branch
- **One worktree → one branch**: a worktree is always bound to a single branch (set at creation, immutable)
- All enforced by git natively — `git worktree add -b <new> <path> <base>`

### Toolbar Layout

```
[📁 Project ▼] [🤖 Agent ▼] [🌿 main ▼] [🔀 calm-owl ▼] [Merge]
  项目选择器     Agent选择器   分支选择器    Worktree选择器   Merge按钮
                              (有git才显示)              (有worktree才显示)
```

## Data Model

### Types

```typescript
interface WorktreeInfo {
  name: string;        // "calm-owl"
  path: string;        // absolute checkout path
  branch: string;      // "wt-calm-owl" — worktree's branch
  baseBranch: string;  // "main" — branch this was forked from
  head: string;
  aheadCount: number;  // commits ahead of baseBranch
}

// Locked branches: checked out in any worktree (main or wt-*)
// Built from listWorktrees() + git branch info
interface LockedBranchSet {
  [branchName: string]: {
    worktreeName: string | null;  // null = main worktree
    path: string;                 // checkout path
  };
}
```

## Data Flow

### Flow 1: Branch Selector

```
显示条件: 项目有 git

无 worktree 时:
  ┌──────────────┐
  │ 🌿 main    ▼ │
  ├──────────────┤
  │ ● main       │  ← 当前
  │   feature-x  │  ← 空闲
  │   wt-owl [🔒]│  ← 被 worktree 占用
  └──────────────┘

worktree 激活时:
  ┌──────────────────┐
  │ 🌿 wt-calm-owl ▼ │
  ├──────────────────┤
  │   main     [🔒]  │  ← 被主工作区占用
  │ ● wt-calm-owl    │  ← 当前
  └──────────────────┘

切换分支:
  空闲分支 → git checkout <branch> → reloadAllFromDisk → Git面板刷新
  锁定分支 → toast "Branch is locked (checked out in <worktree>)"
```

### Flow 2: Worktree Creation

```
1. 用户从分支选择器选 "main"
2. 用户点击 Worktree 选择器 → "New worktree"
3. 系统以当前选中分支为 base 创建 worktree:

   git worktree add -b wt-calm-owl .prismnext/worktrees/calm-owl main

4. WorktreeInfo: { name: "calm-owl", branch: "wt-calm-owl", baseBranch: "main" }
5. 分支选择器自动切换显示 "wt-calm-owl"
6. Git 面板感知 worktree 上下文
```

### Flow 3: Accept/Reject → Pure File Ops

```
Accept:
  fsWrite(absolutePath, newContent)  // checkoutRoot 自动指向正确路径
  // 改动留在磁盘上，Unstaged — 用户去 Git 面板管理

Reject:
  fsWrite(absolutePath, oldContent)  // 还原为旧内容
```

No git operations in changes-store. Stage/commit/discard are done in Git panel.

### Flow 4: Merge

```
Merge dialog shows commits ahead of baseBranch:
  wt-calm-owl is 3 commits ahead of main

  git checkout <baseBranch>
  git merge wt-calm-owl
  git branch -d wt-calm-owl
  git worktree remove .prismnext/worktrees/calm-owl
```

### Flow 5: Branch Switching in Git Panel

```
Git 面板分支列表:
  ● main                    ← 当前
    wt-calm-owl  [locked]   ← 灰色，不可点击
    feature-x               ← 空闲，可点击切换

点击 feature-x:
  → git checkout feature-x
  → documentStore.reloadAllFromDisk()
  → refreshStatus()
```

## Files Changed

| File | Change |
|------|--------|
| `main/services/worktree.ts` | `createWorktree` +`baseBranch`; `WorktreeInfo` +`baseBranch`; `getLockedBranches` new |
| `main/services/git.ts` | `getLockedBranches` helper |
| `main/ipc/worktree.ts` | Update `worktree:create` signature |
| `main/ipc/git.ts` | Add `git:lockedBranches` handler |
| `preload/index.ts` | Expose `gitLockedBranches`, update `worktreeCreate` |
| `renderer/types/electron.d.ts` | `WorktreeInfo.baseBranch`, `LockedBranchInfo` |
| `renderer/stores/changes-store.ts` | Accept/Reject → pure `fsWrite`, remove `gitCommitAll` |
| `renderer/stores/worktree-store.ts` | `createWorktree` +`baseBranch` |
| `renderer/stores/git-store.ts` | `lockedBranches`, check before switch |
| `renderer/components/modules/chat/ai-bar.tsx` | Add branch selector |
| `renderer/components/modules/chat/worktree-selector.tsx` | Pass baseBranch from branch selector |
| `renderer/components/modules/chat/merge-worktree-dialog.tsx` | Merge to `baseBranch` |
| `renderer/components/layout/left-main-area.tsx` | Toolbar layout update |
| `renderer/components/layout/right-sidebar/git-sidebar.tsx` | Locked branch indicators |

## Edge Cases

1. **No git**: Branch selector hidden. Worktree creation auto-inits git.
2. **All branches locked**: Only current branch shown, all others [locked].
3. **Merge conflict**: Standard git merge conflict — resolve in Git panel or `git merge --abort`.
4. **Switch branch with dirty files**: Auto-save before switch. If save fails, block switch.
5. **Delete worktree with unmerged commits**: Warn, then `git worktree remove --force` + `git branch -D`.
6. **Orphaned worktree**: `listWorktrees` validates `.git` file exists before returning entries.
