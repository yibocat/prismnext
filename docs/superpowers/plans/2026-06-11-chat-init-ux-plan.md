# Chat Initialization UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace flashy progress text messages with a collapsible thinking block (Part 1), and pre-warm the CLI process on project open to eliminate cold-start latency (Part 2).

**Architecture:** Part 1 introduces `_progress: true` on `ContentBlock` to distinguish init progress from real AI thinking. Progress accumulates into a single thinking block rendered by the existing `ThinkingWidget`. Part 2 replaces the module-level `didPrewarm` flag with a `useEffect` keyed on `projectRoot` + `activeWorktree`, so the process is already warm when the user sends their first message.

**Tech Stack:** TypeScript (strict), React 19, Zustand, Electron IPC

**Spec:** `docs/superpowers/specs/2026-06-11-chat-init-ux-design.md`

---

## File Map

| File | Responsibility |
|------|---------------|
| `src/renderer/stores/chat-store.ts` | `ContentBlock._progress`, `emitProgressThinking`, first-turn gate, `_upsertLastMessage` cross-boundary commit (progress→real) |
| `src/renderer/components/modules/chat/chat-messages.tsx` | `showStreamingIndicator` excludes `_progress` thinking; `ThinkingWidget` label for `_progress` |
| `src/renderer/components/modules/chat/tools/thinking-widget.tsx` | Accept `_progress` prop → label "Initialization", default collapsed |
| `src/renderer/components/layout/left-main-area.tsx` | Replace `didPrewarm` module flag with `useEffect([projectRoot, activeWorktree])` |

---

### Task 1: Add `_progress` field to `ContentBlock`

**Files:**
- Modify: `src/renderer/stores/chat-store.ts:9-21`

- [ ] **Step 1: Add `_progress` optional field**

```typescript
// In chat-store.ts, lines 9-21 — add _progress to ContentBlock:
export interface ContentBlock {
  type: "text" | "tool_use" | "tool_result" | "thinking";
  text?: string;
  id?: string;
  name?: string;
  input?: any;
  tool_use_id?: string;
  content?: any;
  is_error?: boolean;
  thinking?: string;
  duration?: number;
  signature?: string;
  /** true = init progress, not real AI thinking. Rendered as collapsible
   *  "Initialization" block with no copy button. Committed to history on
   *  first turn only; excluded from streaming indicator logic. */
  _progress?: boolean;
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /Users/yibow/MyPro/ResearchPrism/prism-next && npx tsc --noEmit
```

Expected: PASS (no errors — new optional field is backward-compatible)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stores/chat-store.ts
git commit -m "feat(chat): add _progress flag to ContentBlock type"
```

---

### Task 2: Replace `emitProgress` with `emitProgressThinking`

**Files:**
- Modify: `src/renderer/stores/chat-store.ts:378-385` (the `emitProgress` closure in `sendPrompt`)

**Context:** Currently `emitProgress` creates `assistant + text` messages. We change it to accumulate into an `assistant + thinking (_progress: true)` message instead.

- [ ] **Step 1: Replace `emitProgress` with `emitProgressThinking`**

Replace lines 378-385:

```typescript
// OLD (delete):
const emitProgress = (text: string) => {
  const progressMsg: ChatStreamMessage = {
    type: "assistant",
    message: { content: [{ type: "text", text }] },
  };
  get()._upsertLastMessage(tabId, progressMsg);
};
```

With:

```typescript
// NEW:
// Progress log accumulated across all emitProgressThinking calls.
// Each call appends a line; the full log is sent as ONE thinking block
// so _upsertLastMessage naturally replaces the old block with the updated one.
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

- [ ] **Step 2: Rename all `emitProgress` call sites → `emitProgressThinking`**

Find and replace all occurrences of `emitProgress(` with `emitProgressThinking(` within the `sendPrompt` function body. These are at approximately:
- Line ~395: `emitProgress("⏳ Creating worktree on...")`
- Line ~397: `emitProgress("✅ Worktree...")`
- Line ~402: `emitProgress("⏳ Syncing files…")`
- Line ~404: `emitProgress("✅ Files synced")`
- Line ~408: `emitProgress("❌ Worktree init failed...")`
- Line ~418: `emitProgress("❌ Agent check failed...")`
- Line ~422: `emitProgress("⏳ Starting Claude Code…")`
- Line ~427: `emitProgress("✅ Claude Code ready")`
- Line ~430: `emitProgress("⚠️ Agent prewarm skipped...")`
- Line ~446: `emitProgress("⏳ Saving files…")`
- Line ~448: `emitProgress("✅ Files saved")`
- Line ~458: `emitProgress("📌 Will create worktree...")`
- Line ~461: `emitProgress("⏳ Switching to...")`
- Line ~463: `emitProgress("✅ Switched to...")`

- [ ] **Step 3: Verify TypeScript**

```bash
cd /Users/yibow/MyPro/ResearchPrism/prism-next && npx tsc --noEmit
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/stores/chat-store.ts
git commit -m "feat(chat): accumulate init progress into _progress thinking block"
```

---

### Task 3: Add first-turn gate for progress thinking

**Files:**
- Modify: `src/renderer/stores/chat-store.ts` — `sendPrompt` function (around line 349)

**Context:** Progress thinking only shows on the first turn of a new session (`!sessionId && messageCount === 1`). For subsequent turns or resumed sessions, progress messages are completely skipped.

- [ ] **Step 1: Compute `isFirstTurn` at the top of `sendPrompt`**

After line 353 (`const agentId = get().selectedAgent;`), add:

```typescript
// Gate: progress thinking only for the first turn of a new session.
// - No sessionId → this is a fresh session (not a resumed one)
// - 0 committed messages → this is the very first prompt
// Subsequent turns skip all emitProgressThinking calls — the process
// is already warm so there's nothing to report.
const tabBeforePrompt = get().tabs.find((t) => t.id === tabId);
const isFirstTurn = !tabBeforePrompt?.sessionId && (tabBeforePrompt?.messages.length ?? 0) === 0;
```

- [ ] **Step 2: Guard `emitProgressThinking` calls**

Wrap each `emitProgressThinking(...)` call with `if (isFirstTurn)`. For example:

```typescript
// OLD:
emitProgressThinking("⏳ Saving files…");

// NEW:
if (isFirstTurn) emitProgressThinking("⏳ Saving files…");
```

Do this for ALL `emitProgressThinking` calls in `sendPrompt`.

**Exception:** The `checkAndStartAgent` function itself should be guarded differently — see Task 6 (the pre-warm skip).

- [ ] **Step 3: Verify TypeScript**

```bash
cd /Users/yibow/MyPro/ResearchPrism/prism-next && npx tsc --noEmit
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/stores/chat-store.ts
git commit -m "feat(chat): gate progress thinking to first turn of new sessions only"
```

---

### Task 4: Add `_progress → real` cross-boundary commit in `_upsertLastMessage`

**Files:**
- Modify: `src/renderer/stores/chat-store.ts:703-758` (`_upsertLastMessage`)

**Context:** When the first REAL assistant delta arrives from Claude CLI, the progress thinking block must be committed to `messages` (not discarded). This is similar to the existing `tool_use → text/thinking` cross-turn boundary, but detects `_progress thinking → real content`.

- [ ] **Step 1: Add `_progress → real` boundary detection**

In `_upsertLastMessage`, BEFORE the existing `tool_use → text/thinking` check (before line 725), add:

```typescript
// ── Progress → real boundary ──
// When the streaming message has a _progress thinking block and new content
// has real (non-_progress) text or thinking, commit the progress block to
// history and start a fresh streaming message for the real AI response.
const oldHasProgressThinking = oldBlocks.some(
  (b) => b.type === "thinking" && (b as ContentBlock)._progress
);
const newHasRealContent = newBlocks.some(
  (b) => (b.type === "text" || b.type === "thinking") && !(b as ContentBlock)._progress
);

if (oldHasProgressThinking && newHasRealContent) {
  const newTabs = [...s.tabs];
  newTabs[tabIdx] = {
    ...tab,
    messages: [...tab.messages, prev], // commit progress thinking
    streamingMessage: msg,              // start real AI
  };
  return { tabs: newTabs, ...projectActiveTab(newTabs, s.activeTabId) };
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /Users/yibow/MyPro/ResearchPrism/prism-next && npx tsc --noEmit
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stores/chat-store.ts
git commit -m "feat(chat): commit progress thinking block when real AI content arrives"
```

---

### Task 5: Update `ThinkingWidget` to support `_progress` blocks

**Files:**
- Modify: `src/renderer/components/modules/chat/tools/thinking-widget.tsx:22-89`
- Modify: `src/renderer/components/modules/chat/chat-messages.tsx:142-151` (pass `_progress` prop)

**Context:** When `_progress` is true, the ThinkingWidget shows "Initialization" as the label and defaults to collapsed (collapsed even while "streaming" because init progress isn't the interesting part).

- [ ] **Step 1: Add `isProgress` prop to `ThinkingWidget`**

In `thinking-widget.tsx`, update the props interface and component:

```typescript
// Update the function signature (lines 22-33):
export function ThinkingWidget({
  thinking,
  duration,
  persistKey,
  isStreamingMsg,
  isProgress,
}: {
  thinking: string;
  duration?: number;
  persistKey?: string;
  isStreamingMsg?: boolean;
  /** When true, this is init progress (not real AI thinking).
   *  Shows "Initialization" label, defaults collapsed, no timer. */
  isProgress?: boolean;
}) {
```

- [ ] **Step 2: Adjust label and default collapsed state for `isProgress`**

Update the label logic (line 76):

```typescript
<span className="text-[length:var(--font-code)]">
  {isProgress
    ? "Initialization"
    : (isStreaming ? `Thinking... ${fmt(elapsed)}s` : `Thought for ${fmt(displayDuration)}s`)}
</span>
```

And update the `expanded` default (line 34-36) to always initialize collapsed when `isProgress`:

```typescript
const [expanded, setExpanded] = useState(
  () => isProgress ? false : (persistKey ? getThinkingState(persistKey) : false),
);
```

Since `useState` initializer runs once per mount, and `isProgress` is constant for a given block, this correctly initializes progress blocks to collapsed while respecting persisted preferences for real thinking blocks.

- [ ] **Step 3: Hide timer for progress blocks**

The timer (lines 48-55) should not run for progress blocks since the duration is meaningless:

```typescript
useEffect(() => {
  if (!isStreaming || isProgress) return; // ← add isProgress guard
  const start = Date.now();
  const timer = setInterval(() => {
    setElapsed((Date.now() - start) / 1000);
  }, 100);
  return () => clearInterval(timer);
}, [isStreaming, isProgress]); // ← add isProgress to deps
```

- [ ] **Step 4: Pass `_progress` from `AssistantMessage` to `ThinkingWidget`**

In `chat-messages.tsx`, the `AssistantMessage` component (around line 142-151), pass `isProgress`:

```typescript
// In AssistantMessage, the thinking block rendering (around line 143-152):
if (block.type === "thinking" && block.thinking) {
  return (
    <ThinkingWidget
      key={i}
      thinking={block.thinking}
      duration={(block as any).duration}
      persistKey={sessionId ? `${sessionId}:${msgIndex}:${i}` : undefined}
      isStreamingMsg={isStreamingMsg && !thinkingComplete}
      isProgress={(block as ContentBlock)._progress === true}  // ← NEW
    />
  );
}
```

- [ ] **Step 5: Update `showStreamingIndicator` to exclude `_progress` thinking**

In `chat-messages.tsx` line 333-337, update the condition to exclude `_progress` blocks:

```typescript
// Show streaming dots only when there's no REAL (non-_progress) thinking with ≥10 chars.
// _progress thinking (init log) shouldn't suppress the streaming indicator,
// because it's transient and will be committed when real content arrives.
const showStreamingIndicator = isStreaming && !displayMessages.some(
  (m) => m.type === "assistant" && m.message?.content?.some(
    (b) => b.type === "thinking" && b.thinking && b.thinking.length >= 10 && !(b as ContentBlock)._progress,
  ),
);
```

- [ ] **Step 6: Verify TypeScript**

```bash
cd /Users/yibow/MyPro/ResearchPrism/prism-next && npx tsc --noEmit
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/modules/chat/tools/thinking-widget.tsx \
        src/renderer/components/modules/chat/chat-messages.tsx
git commit -m "feat(chat): render _progress thinking as collapsed Initialization block"
```

---

### Task 6: Replace `didPrewarm` with reactive `useEffect` pre-warm

**Files:**
- Modify: `src/renderer/components/layout/left-main-area.tsx:29-47`

**Context:** Replace the module-level `didPrewarm` flag with a `useEffect` keyed on `projectRoot` + `activeWorktree`. This pre-warms the CLI process whenever a project is opened or a worktree is activated, BEFORE the user types anything. Also remove the explicit `cliPrewarm` call inside `sendPrompt`'s `checkAndStartAgent` — it's no longer needed since the process is already warm.

- [ ] **Step 1: Replace the mount-only pre-warm with a reactive useEffect**

In `left-main-area.tsx`, delete the module-level flag (line 29-30):

```typescript
// DELETE:
let didPrewarm = false;
```

Replace the `useEffect(() => {...}, [])` (lines 36-47) with:

```typescript
// Pre-warm the agent process whenever the project or worktree changes.
// The process starts in the background with default settings so the first
// prompt hits a warm process with sub-second latency.
useEffect(() => {
  if (!projectRoot) return;
  const store = useChatStore.getState();
  const tab = store.tabs.find((t) => t.id === store.activeTabId);
  // Don't pre-warm if the active tab already has a loaded session —
  // it will be resumed, which needs a different --resume flag.
  if (tab?.sessionId) return;
  const wtRoot = worktreePath || projectRoot;
  window.electronAPI.cliPrewarm(projectRoot, store.activeTabId, wtRoot).catch(() => {});
}, [projectRoot, worktreePath]);
```

**Note:** This requires `worktreePath` to be available in scope. The existing code at line 86 already has:

```typescript
const activeWorktree = useWorktreeStore((s) => s.activeWorktree);
```

Add right after it:

```typescript
const worktreePath = activeWorktree?.path;
```

And use `worktreePath` (a `string | undefined`) as the dep — more stable than the full `activeWorktree` object reference.

- [ ] **Step 2: Skip explicit prewarm in `sendPrompt`'s `checkAndStartAgent`**

In `chat-store.ts`, the `checkAndStartAgent` function (lines 413-432) currently calls `cliPrewarm` explicitly. With the background pre-warm, this is redundant when the process is already warm. But we still need the **agent status check**. Update:

```typescript
const checkAndStartAgent = async (worktreePath: string | null, prewarmSettings?: Record<string, string | null>) => {
  try {
    const status = await window.electronAPI.cliStatus();
    if (!status.available) throw new Error(status.error || "Agent not available.");
  } catch (err: any) {
    if (isFirstTurn) emitProgressThinking(`❌ Agent check failed: ${err?.message}`);
    throw err;
  }

  if (isFirstTurn) emitProgressThinking("⏳ Starting Claude Code…");
  // Pre-warm is best-effort — the background pre-warm (useEffect in LeftMainArea)
  // has already started the process with default settings. If settings match,
  // cliSend → ensureProcess will hit the warm process instantly. If not,
  // ensureProcess auto-restarts with the right flags.
  try {
    await window.electronAPI.cliPrewarm(projectPath, tabId, worktreePath || undefined, prewarmSettings);
    if (isFirstTurn) emitProgressThinking("✅ Claude Code ready");
  } catch {
    if (isFirstTurn) emitProgressThinking("⚠️ Agent prewarm skipped — will start on demand");
  }
};
```

Note: The `cliPrewarm` call is kept in `checkAndStartAgent` for two reasons:
1. It ensures the process IS running before we proceed (the background pre-warm might have failed silently)
2. It passes `prewarmSettings` — if the user changed settings, the pre-warm will auto-restart (via our Bug 1 fix)

- [ ] **Step 3: Verify TypeScript**

```bash
cd /Users/yibow/MyPro/ResearchPrism/prism-next && npx tsc --noEmit
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/layout/left-main-area.tsx \
        src/renderer/stores/chat-store.ts
git commit -m "feat(cli): replace didPrewarm with reactive pre-warm on project/worktree change"
```

---

### Task 7: Integration verification

**Files:**
- No file changes — verification only.

- [ ] **Step 1: Run full TypeScript check**

```bash
cd /Users/yibow/MyPro/ResearchPrism/prism-next && npx tsc --noEmit
```

Expected: PASS (zero errors)

- [ ] **Step 2: Manual visual checklist** (launch app, open project, send first message)

Expected behaviors to verify:
1. First message in a new session → progress thinking block appears (collapsed, "Initialization" label)
2. Click to expand → full init log visible (all progress lines)
3. No Copy button on progress thinking
4. Real AI thinking arrives → progress block commits to history, new thinking starts
5. Second message in same session → NO progress thinking block (skipped)
6. Load an old session and send message → NO progress thinking block (resumed session)
7. Session list streaming indicator (CircleDotDashed) works correctly

- [ ] **Step 3: Commit** (if any fixups)

```bash
git add -A && git commit -m "chore: final verification tweaks for chat init UX"
```
