# Terminal Phase 3 — AI PTY Stream Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or executing-plans for task-by-task execution.

**Goal:** Replace file-bridge `exec` with per-command AI PTY streaming so users see live bash/Python output in the ✨ AI terminal tab while the agent still receives the final result.

**Architecture:** OpenCode `bash.ts` writes bridge requests → main `ai-pty.ts` spawns isolated PTY per command → IPC `terminal:aiStream` / `terminal:aiExit` to renderer → `AiTerminalView` incremental `term.write()`. Session registry maps OpenCode `sessionID` → renderer `chatTabId`. Reuses Phase 2 tab lifecycle (`terminal-ai-store`, `aiTerminalAutoOpen`).

**Tech Stack:** node-pty, Electron IPC, existing terminal-ai-store, file bridge (`~/.prism-terminal-bridge`)

---

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| PTY granularity | One PTY per bash command (spawn `shell -c cmd`) |
| Bridge transport | Keep file bridge; add `.stream` append + IPC |
| User vs AI PTY | Separate pools (`terminal.ts` vs `ai-pty.ts`) |
| Session routing | `chat-session-registry.ts`: OpenCode sessionId → chatTabId |
| Setting | `agentTerminalMode: "pty"` enables stream (UI label: PTY stream) |

---

## Phase 3a — Main: AI PTY execution

**Files:**
- Create: `src/main/services/chat-session-registry.ts`
- Create: `src/main/services/ai-pty.ts`
- Modify: `src/main/services/terminal-bridge.ts`
- Modify: `src/main/acp/event-mapper.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/tools/bash.ts`
- Test: `tests/main/chat-session-registry.test.ts`, `tests/main/ai-pty.test.ts`, `tests/main/terminal-bridge.test.ts`

- [ ] **3a.1** Session registry (register/resolve/unregister)
- [ ] **3a.2** `runAiCommand` — PTY spawn, onChunk callback, exit code
- [ ] **3a.3** Bridge uses PTY; writes `.stream` file; emits IPC events
- [ ] **3a.4** Wire registry from `EventMapper.registerSession`
- [ ] **3a.5** Tests: registry, echo via bridge, stream file exists

---

## Phase 3b — Renderer: live xterm

**Files:**
- Modify: `src/preload/index.ts`, `src/renderer/types/electron.d.ts`
- Create: `src/renderer/hooks/use-terminal-ai-stream.ts`
- Modify: `src/renderer/modes/terminal-mode/ai-terminal-view.tsx`
- Modify: `src/renderer/stores/terminal-ai-store.ts`
- Modify: `src/renderer/lib/terminal-ai-bridge.ts` (pty mode: skip duplicate output mirror)
- Modify: `src/renderer/App.tsx` (mount stream hook)

- [ ] **3b.1** Preload + types for `terminal:aiStream` / `terminal:aiExit`
- [ ] **3b.2** Store: `onAiStreamChunk`, `onAiStreamExit`
- [ ] **3b.3** Hook subscribes IPC → store (pty mode only)
- [ ] **3b.4** `AiTerminalView` uses stream path when `agentTerminalMode === "pty"`
- [ ] **3b.5** Manual test: `python -c "import time; ..."` shows live lines

---

## Phase 3c — Durability & limits

**Files:**
- Create: `src/renderer/lib/ring-buffer.ts`
- Modify: `src/renderer/stores/terminal-ai-store.ts`
- Modify: `src/main/services/ai-pty.ts` (cancel prior command per chatTabId)

- [ ] **3c.1** Ring buffer cap (~512KB) for `sessionMirrorLog`
- [ ] **3c.2** Serialize ring buffer for tab reopen replay
- [ ] **3c.3** Cancel in-flight AI PTY when new command for same chatTabId
- [ ] **3c.4** Tests for ring buffer truncation + replay

---

## Verification

```bash
cd prism-next && npx tsc --noEmit
pnpm exec vitest run tests/main/ai-pty.test.ts tests/main/terminal-bridge.test.ts tests/main/chat-session-registry.test.ts
# Manual: Settings → Agent terminal → PTY bridge; Auto open on bash → ON
# Ask AI: python -c "for i in range(5): print(i); import time; time.sleep(0.5)"
```
