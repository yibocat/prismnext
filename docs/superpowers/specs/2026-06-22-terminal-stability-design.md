# Terminal Stability Design

**Date:** 2026-06-22  
**Status:** Implemented (Phase 1)  
**Out of scope (Phase 1):** AI agent reuse of user PTY, command/output block parser, shell integration hooks

## Goals

Stabilize RightArea terminal subsystem: explicit PTY lifecycle, worktree-aware cwd for new sessions, reliable multi-tab state, UI consistency, and test coverage. Keep AI Chat execution path separate from user terminal.

## Architecture

- **Tab ownership:** Each `terminal` RightArea tab = one independent PTY session (TabBar is primary navigation).
- **Process ownership:** Main process `services/terminal.ts` owns `node-pty` Map; renderer `terminal-store` holds display metadata only.
- **Session id:** `{tabId}:{mountGen}:{restartNonce}` with prefix destroy by `tabId:`.
- **CWD rule:** New terminals use `checkoutRoot || projectRoot`. Existing sessions are not auto-migrated on worktree switch.
- **AI boundary:** Agent bash tool and user terminal remain isolated; future Chat integration via explicit selection/snapshot only.

## Lifecycle

| Event | Action |
|-------|--------|
| New terminal tab | `terminal:create` with tabId, projectRoot, cwd |
| Close tab | `terminal-store.destroyTab` → `terminal:destroyTab` |
| Close terminal mode | `destroyAllTerminalTabs` for all terminal tab ids |
| Close/switch project | `closeAllTabs` → destroy terminals + `resetProjectState` |
| Window quit | `destroyAllTerminalSessions` |
| PTY exit | `markSessionExited`; toolbar shows Restart |

## UI

- **Toolbar:** Clear (platform-aware), Interrupt/Restart by status, Copy CWD, New Terminal
- **Sidebar:** Active session summary, Quick Commands (primary), Recent Commands (collapsed)
- **TabBar:** Muted terminal icon when session exited/error

## Phase 3 (future)

1. xterm selection → pinned Chat context  
2. `terminal-snippet` ComposerPart type  
3. Optional PTY recorder for structured command blocks
