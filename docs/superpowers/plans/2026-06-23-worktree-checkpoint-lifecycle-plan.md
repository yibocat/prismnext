# Worktree Checkpoint Lifecycle — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-06-23-worktree-checkpoint-lifecycle.md`

## Checklist

- [x] Spec: mainstream invalidate on merge / close
- [x] `worktree-checkpoint-lifecycle.ts` — find tabs by `sessionCwd`, clear + toast
- [x] `checkpoint-store` — `clearTabCheckpoints`, `boundCheckoutPath`, `canRestore` guard
- [x] Wire `mergeWorktreeToBase` → clear merged
- [x] Wire `mergeAndCloseWorktree` / `moveToLocal` / `removeWorktree` → clear closed
- [x] Tests

## Verify manually

1. Worktree chat with file edits → Restore visible
2. Merge to Branch → Restore disappears; toast shown
3. Close worktree → Restore disappears; toast shown
4. New turns after merge in same worktree → new Restore only for new turns
