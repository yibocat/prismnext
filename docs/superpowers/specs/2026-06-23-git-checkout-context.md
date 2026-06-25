# Git Checkout Context & Sync — Design Spec

**Date:** 2026-06-23  
**Status:** M1–M4 implemented

## Four path roles

| Field | Store | Meaning |
|-------|-------|---------|
| `projectRoot` | `document-store` | User-opened project (main worktree) |
| `checkoutRoot` | `document-store` | Current edit root (project or `.prismnext/worktrees/*`) |
| `gitUnitRoot` | `git-store.unitRoot` | Where `git status` runs — usually `checkoutRoot` |
| `agentCwd` | `chatSend.worktreePath` | OpenCode session cwd — set on first message |

## Sync helpers (`lib/git/git-sync.ts`)

- **`syncAfterWorktreePush`** — after Push merges into base: refresh worktree list + force-refresh git on project + worktree.
- **`finalizeWorktreeMergeClose`** — after Merge dialog success: clear active worktree, `switchCheckoutRoot(project)`, reload disk, refresh git.

## Checkout transitions (`lib/git/checkout-context.ts`)

**`getCheckoutContext()`** — snapshot of `projectRoot`, `checkoutRoot`, `gitUnitRoot`, worktree mode, `activeWorktree`.

**`applyCheckoutTransition(transition)`** — single write path for mode/root changes:

| Transition | Effect |
|------------|--------|
| `local` | Clear active worktree; checkout `projectRoot` |
| `worktree-existing` | `selectExistingWorktree` + checkout worktree path |
| `worktree-intent` | `setMode("worktree", baseBranch)` only (lazy create on first chat message) |
| `checkout-at` | Checkout arbitrary root; optional worktree attach |
| `project-view-while-worktree` | Checkout `projectRoot` + switch to worktree's `baseBranch` (peek at main tree) |

Call sites: `worktree-selector`, `worktree-actions`, `git-toolbar`, `files-sidebar`, `chat-store.resolveWorktree`, `worktree-store.removeWorktree`, `git-sync.finalizeWorktreeMergeClose`.

`left-main-area` no longer subscribes to `activeWorktree` for `switchCheckoutRoot` — all transitions go through `applyCheckoutTransition`.

## M3: `git-orchestrator.ts`

Central orchestration for worktree git operations. UI components delegate here instead of inlining IPC chains.

| Function | Purpose |
|----------|---------|
| `pushWorktreeToBase` | Commit in worktree → stash project → checkout base → merge → commit → stash pop → sync. **Rollback** on failure: abort merge, restore branch, pop stash. |
| `mergeAndCloseWorktree` | Stash → checkout base → merge (with commit) → delete branch → remove worktree → finalize. Conflict leaves merge state + opens Git panel. |
| `discardAndCloseWorktree` | `moveToLocal` + `applyCheckoutTransition({ type: "local" })` |
| `loadWorktreeChangedFiles` | Git status for push preview |
| `useResolvedWorktree` | Hook: resolve active worktree from store or `checkoutRoot` |

Call sites: `worktree-push-panel`, `git-push-dialog`, `merge-worktree-dialog`, `worktree-actions`.

## M4: Session ↔ worktree continuity

| Piece | Purpose |
|-------|---------|
| `TabState.sessionCwd` | Remembers OpenCode session directory (project root or worktree path) |
| `captureSessionCwd` / `resolveWorktreePathForSend` | Bind chat send + checkpoints to correct worktree |
| `session:getDirectory` | Lookup session cwd from SQLite when opening from list |
| `session:load` + `cwd` | `initSession` uses worktree path for continued conversation |
| Session list badge | `WorkflowIcon` on worktree-scoped sessions |

## Naming debt

- `git-store.pendingBranch` → chat branch target (local mode)
- `worktree-store.pendingBranch` → worktree base branch at create time
