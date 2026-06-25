# Worktree × Checkpoint (Restore) Lifecycle

**Status:** Implemented  
**Date:** 2026-06-23

## Problem

Chat **Restore here** rolls back per-turn file snapshots + truncates the OpenCode session. Checkpoints store `absolutePath` values tied to the **checkout at capture time** (often a worktree under `.prismnext/worktrees/<name>/`).

When the user **merges** worktree changes into `baseBranch` or **closes** the worktree:

- Restore must **not** imply undoing a Git merge.
- After close, paths in snapshots point at a **deleted directory** — restore is unsafe.
- Mainstream agents bind undo/checkpoints to **workspace context**; context breaks → old restore invalid.

We explicitly **reject** “spawn a new worktree on restore” (too complex, confuses Git vs file snapshots).

## Policy (mainstream)

| Event | Checkpoint behavior | Restore UI |
|-------|---------------------|------------|
| Normal turn in active worktree | Save snapshot | **Restore here** when turn touched files |
| **Merge to Branch** (worktree kept) | Clear all checkpoints for sessions bound to that worktree | Hidden (no snapshots) |
| **Merge & Close** / **Discard & Close** | Clear checkpoints before worktree removal | Hidden |
| Worktree open, new turns after merge | New snapshots allowed (fresh chain) | Only for turns after merge |
| Session `sessionCwd` ≠ file snapshot root | `canRestore` false | Hidden |

**Git merge rollback** is out of scope for Restore — user uses Git panel / history.

## Binding rule

A tab is **bound** to a worktree checkout when:

```ts
tab.sessionCwd === worktree.path
// or captureSessionCwd() at checkpoint time matched that path
```

`clearCheckpointsForWorktree(worktreePath)` finds all open tabs with that `sessionCwd` and clears their checkpoint state + deletes `{projectRoot}/.prismnext/agent/checkpoints/{sessionId}.json`.

## User feedback

After clear, optional toast (once per operation):

- Merge: `Restore points cleared — changes were merged into <baseBranch>. Use Git history to revert commits.`
- Close: `Restore points cleared — worktree was closed.`

## Files

| File | Role |
|------|------|
| `src/renderer/lib/chat/worktree-checkpoint-lifecycle.ts` | Orchestration + toasts |
| `src/renderer/stores/checkpoint-store.ts` | `clearTabCheckpoints`, path guard in `canRestoreToTurn` |
| `src/renderer/lib/git/git-orchestrator.ts` | Call clear on merge / merge-close |
| `src/renderer/stores/worktree-store.ts` | Call clear on `moveToLocal` |

## Non-goals

- Git revert on restore
- Migrating snapshots to `projectRoot` after close
- Fork-to-new-worktree restore
