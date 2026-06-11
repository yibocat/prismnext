# Chat Initialization UX Redesign

**Date:** 2026-06-11  
**Status:** Approved  
**Scope:** prism-next renderer + main process

---

## Problem Statement

Sending the first message in a new chat session triggers a 3–8 second initialization period (CLI spawn, MCP load, config discovery). Current UX renders progress messages as fake `assistant` text blocks that visibly flash and pollute chat history. The Copy button appears on transient progress text. There is no clear distinction between initialization progress and real AI responses.

Additionally, the CLI cold-start happens on-demand at send time, rather than proactively during idle, wasting the user's time.

---

## Design

### Part 1 — Progress Messages as Thinking Blocks

**Goal:** Render initialization progress as a collapsible `thinking` block (not `text`), committed into chat history only on the first turn of a new session. Subsequent turns skip progress entirely.

#### 1.1 Data Model Change

Add a `_progress: true` marker to `ContentBlock` when the block contains initialization progress rather than real AI thinking:

```typescript
// ContentBlock type (chat-store.ts)
export interface ContentBlock {
  type: "text" | "tool_use" | "tool_result" | "thinking";
  // ... existing fields ...
  _progress?: boolean;  // true = init progress, not real AI thinking
}
```

Progress updates are accumulated as a single `thinking` block with a multi-line text log, NOT as separate replacement messages.

#### 1.2 `sendPrompt` Changes (chat-store.ts `sendPrompt`)

**Current behavior:** `emitProgress(text)` creates a new `assistant` + `text` message and calls `_upsertLastMessage`, which replaces the previous progress text.

**New behavior:** Progress messages accumulate into a `thinking` block on a SINGLE in-progress streaming message. A new helper `emitProgressThinking(text)` appends lines to the thinking block instead of replacing:

```typescript
// In sendPrompt():
let progressLog = "";

const emitProgressThinking = (text: string) => {
  progressLog += text + "\n";
  const progressMsg: ChatStreamMessage = {
    type: "assistant",
    message: {
      content: [{
        type: "thinking",
        thinking: progressLog,
        _progress: true,
      }],
    },
  };
  get()._upsertLastMessage(tabId, progressMsg);
};
```

Key: each call APPENDS to `progressLog`, and the full log is sent as ONE thinking block. `_upsertLastMessage` dedup logic sees same-type (thinking) → old replaced by new (now with accumulated text).

#### 1.3 Conditional Display — First Turn Only

Progress thinking is only emitted when ALL conditions are true:

```typescript
const sessionId = get().tabs.find((t) => t.id === tabId)?.sessionId;
const messageCount = get().tabs.find((t) => t.id === tabId)?.messages.length ?? 0;
const isFirstTurn = !sessionId && messageCount === 1; // only the user message exists
```

- `!sessionId` → new session (no --resume)
- `messageCount === 1` → only the user message just added (first turn)
- Subsequent turns in the same session: `sessionId` is set → skip all progress

#### 1.4 Commit on Real Content Arrival

When the first REAL assistant delta arrives from Claude CLI:

- `_upsertLastMessage` detects `_progress` thinking → real thinking/text transition
- The progress thinking block is **committed** to `messages` (not discarded)
- A new streaming message starts with the real AI content

The existing merge logic in `_upsertLastMessage` already handles the "cross-turn boundary" case (line 726-737). We extend this to also detect `_progress → real` transitions:

```typescript
// In _upsertLastMessage, before the existing merge logic:
const oldHasProgressThinking = oldBlocks.some(
  (b) => b.type === "thinking" && (b as any)._progress
);
const newHasRealContent = newBlocks.some(
  (b) => (b.type === "text" || b.type === "thinking") && !(b as any)._progress
);

if (oldHasProgressThinking && newHasRealContent) {
  // Commit progress thinking to history, start fresh streaming
  const newTabs = [...s.tabs];
  newTabs[tabIdx] = {
    ...tab,
    messages: [...tab.messages, prev], // commit progress
    streamingMessage: msg,              // start real AI
  };
  return { tabs: newTabs, ...projectActiveTab(newTabs, s.activeTabId) };
}
```

#### 1.5 ThinkingWidget Rendering

`ThinkingWidget` already supports:
- Collapse/expand toggle
- Duration display
- No Copy button

No changes needed to `ThinkingWidget` itself. The `_progress` flag controls the default collapsed state and the label text:

- `_progress: true` → label: "Initialization" → default: collapsed
- `_progress: false` → label: "Thinking (Xs)" → default: expanded while streaming, collapsed after

#### 1.6 No Copy Button

Since progress content is a `thinking` block (not `text`), the `AssistantMessage` component does NOT render a CopyButton for it. The CopyButton only appears for `text` blocks (line 169-178 in chat-messages.tsx).

---

### Part 2 — CLI Process Pre-warm on Project Open

**Goal:** Start the Claude CLI process in the background as soon as a project is opened, so the first prompt hits a warm process with sub-second latency.

#### 2.1 Trigger Points & React Integration

Replace the existing module-level `didPrewarm` flag with a `useEffect` keyed on `projectRoot` + `activeWorktree`. This auto-pre-warms on:

| Event | Trigger | Behavior |
|-------|---------|----------|
| Project opened | `projectRoot` changes | Pre-warm new project's cwd |
| Worktree activated | `activeWorktree` changes | Pre-warm worktree cwd |
| App restored with last project | `projectRoot` set from persisted state | Same as project open |

```typescript
// In left-main-area.tsx — replaces the didPrewarm module-level flag
useEffect(() => {
  const projectPath = useDocumentStore.getState().projectRoot;
  if (!projectPath) return;
  const store = useChatStore.getState();
  const tab = store.tabs.find((t) => t.id === store.activeTabId);
  if (tab?.sessionId) return; // Already has a loaded session → will be resumed
  const worktreePath = useWorktreeStore.getState().activeWorktree?.path;
  window.electronAPI.cliPrewarm(projectPath, store.activeTabId, worktreePath).catch(() => {});
}, [projectRoot, activeWorktree]);
```

**Note:** `cliPrewarm` is best-effort and non-blocking — failures are silently ignored.

#### 2.2 Pre-warm Implementation

Reuse the existing `CliManager.prewarm()` method — it already calls `ensureProcess` with `sessionId = undefined` and default settings, exactly what we need:

```typescript
// CliManager — already exists, no changes needed
prewarm(tabId: string, cwd: string, settings?: Record<string, string | null>): void {
  try {
    this.ensureProcess(tabId, cwd, getDefaultAgentId(), undefined, settings);
  } catch {}
}
```

**Critical:** Pre-warm uses the **active tab's real ID** (e.g., `"tab-1"`), not a synthetic key. This ensures `ensureProcess` in `sendPrompt` → `cliSend` finds the pre-warmed process via `this.sessions.get(tabId)`.

If the user creates a new tab and sends a message there, the pre-warmed process (keyed to the old tab) won't be found — a fresh process starts for the new tab. This is acceptable; the pre-warm benefits the most common path (first tab, first message).

#### 2.3 Hit/Miss in `ensureProcess`

The existing `ensureProcess` logic (with our Bug 1 fix) already handles this correctly:

| Scenario | `existing` | Match? | Behavior |
|----------|-----------|--------|----------|
| Default settings, no --resume | Pre-warm process | ✅ cwd + agentId + settings match | Reuse — ~0.1s |
| Different model/effort | Pre-warm process | ❌ settings mismatch | Restart — ~3-8s |
| Resume session | Pre-warm process | ❌ sessionChanged | Restart — ~3-8s |
| No pre-warm | undefined | N/A | Fresh spawn — ~3-8s |

#### 2.4 `sendPrompt` Flow After Pre-warm

When pre-warm is active, the `sendPrompt` flow in chat-store.ts skips the explicit `cliPrewarm` call inside `checkAndStartAgent`, since `ensureProcess` inside `cliSend` will either hit the pre-warmed process or create a new one:

```typescript
// In sendPrompt: skip checkAndStartAgent prewarm if not first-turn
// or just let ensureProcess handle it (already does via our fix)
```

The emitProgress still runs (shows in thinking block), but the actual process is already warm → "⏳ Starting Claude Code…" → "✅ Claude Code ready" appears and resolves nearly instantly.

#### 2.5 Lifecycle

- **Pre-warm on project open** → process starts
- **User sends first message** → hits warm process → fast
- **User changes settings** → next send triggers restart (settings mismatch)
- **Project closed / switched** → `disposeCliManager()` kills all processes including pre-warm
- **Pre-warm process dies unexpectedly** → exit handler cleans up; next send creates fresh

---

## Files Changed

| File | Change |
|------|--------|
| `src/renderer/stores/chat-store.ts` | `_progress` field on `ContentBlock`; `emitProgressThinking` helper; first-turn gating; cross-boundary commit (progress→real) in `_upsertLastMessage` |
| `src/renderer/components/modules/chat/chat-messages.tsx` | `_progress` → default collapsed; label "Initialization" |
| `src/renderer/components/modules/chat/tools/thinking-widget.tsx` | Minor: label differentiation for `_progress` blocks |
| `src/renderer/components/layout/left-main-area.tsx` | Replace `didPrewarm` flag with `useEffect([projectRoot, activeWorktree])` pre-warm; remove `checkAndStartAgent` prewarm from `sendPrompt` when sessionId is set |
| `src/renderer/stores/chat-store.ts` — `sendPrompt` | Skip `cliPrewarm` call inside `checkAndStartAgent`; rely on pre-warmed process in `ensureProcess` |

## Non-Goals

- Process pool with multiple pre-warmed instances (single process is sufficient)
- Pre-warming for non-default settings (YAGNI; only default settings pre-warmed)
- Progress thinking for resumed sessions (not needed — process already warm)

## Rollout

1. Part 1 (progress thinking) — no dependency, can ship independently
2. Part 2 (pre-warm) — depends on Bug 1 fix (session mismatch detection), already merged
