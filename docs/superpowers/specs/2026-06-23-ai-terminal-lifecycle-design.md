# AI Terminal Lifecycle Design (Phase A–D)

**Date:** 2026-06-23  
**Status:** Phase D complete  
**Supersedes (partially):** [Terminal × AI Chat Integration](./2026-06-22-terminal-ai-integration-design.md) § lifecycle & identity  
**Depends on:** [Terminal Stability](./2026-06-22-terminal-stability-design.md), [Terminal AI Integration](./2026-06-22-terminal-ai-integration-design.md)

## Problem

1. AI PTY processes can outlive user intent (`cancelAiCommandForChat` only runs when a **new** command starts on the same chat tab).
2. Mirror log and PTY routing are keyed by `chatTabId`, but durable identity is OpenCode `sessionId` (sidebar session switch ≠ tab close).
3. Mirror vs PTY are separate execution paths with duplicated presentation logic.
4. AI terminal tabs accumulate with no GC policy.

## Design principles

| Principle | Rule |
|-----------|------|
| **Durable identity** | OpenCode `sessionId` owns mirror log + PTY lifecycle |
| **UI alias** | `chatTabId` links tabs; resolved via `chat-session-registry` + chat store |
| **Switch ≠ kill** | Changing active chat session does not terminate a running AI PTY |
| **Tab close ≠ log wipe** | Closing chat or AI tab retains `sessionMirrorLog` for replay |
| **One AI tab per session** | At most one ✨ AI terminal tab per `sessionId` (enforced in Phase B) |
| **Live vs replay** | Same `AiTerminalView`; data source switches on `phase` |

## Layer model

```
OpenCode sessionId  ──owns──►  sessionMirrorLog[sessionId]
                    ──owns──►  activeBySession (main ai-pty)
                    ──maps──►  chatTabId (UI)

AI terminal tab (right panel)  =  viewport over sessionMirrorLog + optional live stream
AI PTY job                     =  one-shot shell -c per bash tool call (serial per session)
User terminal tab              =  unrelated interactive PTY
```

## Core state (`AiTerminalSessionState`) — Phase B

```ts
type AiTerminalPhase = "idle" | "running" | "completed" | "dismissed";

interface AiTerminalSessionState {
  sessionId: string;
  chatTabId: string;
  phase: AiTerminalPhase;
  activeToolCallId?: string;
  activeCommand?: string;
  startedAt?: number;
  exitedAt?: number;
  lastViewedAt: number;
  aiTabId?: string;
  pinned?: boolean;
}
```

Phase A uses a subset: PTY `activeBySession` + mirror log keyed by `sessionId` only.

## Mirror log key migration

- **Primary key:** `sessionMirrorLog[sessionId]`
- **Provisional key:** before first `sessionId`, use `chatTabId` (prefix `tab:` internally optional)
- **On `_setSessionId(tabId, sessionId)`:** merge provisional log into `sessionId` key, delete provisional

Helper: `resolveAiMirrorKey(chatTabId) → sessionId | chatTabId`

## IPC payloads (Phase A)

All AI stream events include `sessionId`:

```ts
terminal:aiStream / terminal:aiExit {
  sessionId: string;
  chatTabId: string;
  requestId: string;
  toolCallId?: string;
  // ...
}
```

Renderer matches on `sessionId` first, `chatTabId` fallback.

---

## Phase A — Process safety & session identity

**Goal:** No AI PTY leaks; mirror log durable per OpenCode session.

### A.1 Main process

| Task | Detail |
|------|--------|
| A.1.1 | `ai-pty`: `activeByChat` → `activeBySession: Map<sessionId, ActiveRun>` |
| A.1.2 | `cancelAiCommandForSession(sessionId)`; serial per session |
| A.1.3 | `destroyAllAiPty()` on app/window teardown |
| A.1.4 | `chat:cancel` handler calls `cancelAiCommandForSession(sessionId)` before OpenCode abort |
| A.1.5 | `ai-bash-runner`: pass `sessionId` into `runAiCommand`; emit `sessionId` on stream/exit |
| A.1.6 | `runAiBashJob` dedupe key remains `sessionId:toolCallId` |

### A.2 Renderer

| Task | Detail |
|------|--------|
| A.2.1 | `mirror-key.ts`: `resolveAiMirrorKey`, `migrateMirrorLogOnSessionBound` |
| A.2.2 | `terminal-ai-store`: all `sessionMirrorLog` reads/writes use mirror key |
| A.2.3 | `userDismissedAiTab` keyed by mirror key (sessionId) |
| A.2.4 | `removeAiTabsForChat`: close AI tab + clear tab mappings; **do not** delete mirror log |
| A.2.5 | `_setSessionId`: call mirror migration |
| A.2.6 | Stream hooks (`use-terminal-ai-stream`, `AiTerminalView`) match `sessionId` |

### A.3 Tests

| Task | Detail |
|------|--------|
| A.3.1 | `ai-pty.test.ts`: session-based cancel + destroyAll |
| A.3.2 | `mirror-key.test.ts`: migration merge |
| A.3.3 | Update `terminal-ai-store.test.ts`, `terminal-ai-bridge.test.ts` |

### A.4 Out of scope (Phase A)

- Auto-close GC, session title indicators, busy close dialog
- Default PTY mode / bridge removal

---

## Phase B — Lifecycle state machine & GC

**Goal:** Running jobs keep AI tab; idle sessions reclaim tabs after configurable delays.

### B.1 Store

- Full `AiTerminalSessionState` map keyed by `sessionId`
- Transitions on bash start / `terminal:aiExit` / user dismiss / sweep

### B.2 GC sweep (`sweepIdleAiTerminalTabs`, ~30s interval)

Auto-close AI tab when **all** true:

1. `phase === "completed"`
2. `sessionId !== activeOpenCodeSessionId`
3. `now - lastViewedAt > aiTerminalIdleCloseMs` (default 10 min)
4. `now - exitedAt > aiTerminalPostExitGraceMs` (default 60 s)
5. `!pinned`

**Never** close/kill when `phase === "running"`.

### B.3 UI

- `SessionTitle` hover card: terminal status + Open action
- Left sidebar session row: amber dot = AI bash running
- AI tab title suffix: `●` when running

### B.4 Close semantics

- User closes AI tab while running: confirm dialog (default: close tab only, process continues)
- Setting `aiTerminalCloseTabKillsProcess` (default false)

### B.5 Settings

| Key | Default |
|-----|---------|
| `aiTerminalPostExitGraceMs` | `60000` |
| `aiTerminalIdleCloseMs` | `600000` |
| `aiTerminalCloseTabKillsProcess` | `false` |
| `aiTerminalShowSessionIndicator` | `true` |

---

## Phase C — Live / replay presentation unification

**Goal:** Bash widget + AI terminal share one log; PTY is transport only after completion.

| Scenario | View mode | Source |
|----------|-----------|--------|
| Bash running | `live` | `terminal:aiStream` + append log |
| Bash completed, tab open | `replay` | `sessionMirrorLog` |
| Bash completed, tab GC'd | `replay` | Widget opens tab from log |
| Mirror execution mode | `replay` (batch) | `tool_result` → log |

- `AiTerminalView`: `phase` drives live subscription vs log-only refresh
- Bash widget **Terminal** button: running → focus live tab; completed → replay from log (never spawn PTY)

---

## Phase D — PTY default & bridge hardening

**Goal:** Production-default PTY execution; mirror as fallback only.

| Task | Detail |
|------|--------|
| D.1 | Default `agentTerminalMode: "pty"` after Phase A–C stable |
| D.2 | Single execution path: renderer IPC primary; bridge only if IPC missed (same `toolCallId`) |
| D.3 | Remove `findJobForCommand` string matching; use `toolCallId` only |
| D.4 | `cancelAiCommandForSession` on project `closeAllTabs` (all sessions) |
| D.5 | cwd: resolve project checkout root, not `process.cwd()` |
| D.6 | Deprecation note for mirror mode in settings copy |

---

## Event matrix (target end state)

| Event | PTY | AI tab | Mirror log |
|-------|-----|--------|------------|
| bash `tool_use` | spawn (serial) | ensure/open | append `$ cmd` |
| stream chunk | active | live write | append |
| `aiExit` | clear active | stay (completed) | append footer |
| Switch chat session | unchanged | unchanged | unchanged |
| `chatCancel` | **kill** | stay or GC later | append `^C` optional |
| Close chat tab | **kill** if running | close | **retain** |
| Close AI tab (idle) | — | remove | **retain** |
| GC sweep | — | close if idle rules | **retain** |
| App quit | **destroyAll** | — | — |

---

## File map

| Area | Files |
|------|-------|
| Main PTY | `services/ai-pty.ts`, `services/ai-bash-runner.ts` |
| Main hooks | `ipc/chat.ts`, `ipc/terminal.ts`, `index.ts` |
| Renderer store | `stores/terminal-ai-store.ts` |
| Renderer lib | `lib/terminal/mirror-key.ts`, `ai-bridge.ts`, `ai-session.ts` |
| Renderer UI | `ai-terminal-view.tsx`, `session-title.tsx`, `left-sidebar.tsx` |
| Phase B settings | `services/settings.ts`, `general-settings.tsx` |

---

## Success criteria

- **Phase A:** Cancel / tab close / quit leaves zero orphan `node-pty` AI processes; mirror log survives chat tab close; tests green.
- **Phase B:** Background bash survives session switch; idle tabs GC per settings; indicators visible.
- **Phase C:** Historical bash opens replay; no duplicate PTY on widget click.
- **Phase D:** PTY default; no duplicate execution in normal path.
