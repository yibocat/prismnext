# AI Terminal Lifecycle — Implementation Plan

**Date:** 2026-06-23  
**Spec:** [2026-06-23-ai-terminal-lifecycle-design.md](../specs/2026-06-23-ai-terminal-lifecycle-design.md)

## Phase A — Process safety & session identity

- [x] **A.1** `ai-pty.ts`: `activeBySession`, `cancelAiCommandForSession`, `destroyAllAiPty`
- [x] **A.2** `ai-bash-runner.ts`: `sessionId` in `runAiCommand` + stream/exit payloads
- [x] **A.3** `ipc/chat.ts`: `chat:cancel` → `cancelAiCommandForSession`
- [x] **A.4** `index.ts`: `destroyAllAiPty` on window `closed`
- [x] **A.5** `mirror-key.ts` + store migration on `_setSessionId`
- [x] **A.6** `terminal-ai-store`: mirror key; `removeAiTabsForChat` retains log
- [x] **A.7** Preload + `electron.d.ts`: `sessionId` on AI stream events
- [x] **A.8** `use-terminal-ai-stream`, `ai-terminal-view`: match by `sessionId`
- [x] **A.9** Tests: `ai-pty`, `mirror-key`, update terminal-ai tests

## Phase B — Lifecycle & GC

- [x] **B.1** `AiTerminalSessionState` in store
- [x] **B.2** `sweepIdleAiTerminalTabs` + settings
- [x] **B.3** SessionTitle + sidebar indicators
- [x] **B.4** Busy close confirm for AI tab
- [x] **B.5** Tests for GC rules

## Phase C — Live / replay unification

- [x] **C.1** `AiTerminalView` live vs replay modes
- [x] **C.2** Bash widget: running → focus live; done → replay only
- [x] **C.3** Tests

## Phase D — PTY default & bridge hardening

- [x] **D.1** Default `agentTerminalMode: "pty"`
- [x] **D.2** Bridge polls by `toolCallId` via `.active-tool.json` (renderer IPC primary)
- [x] **D.3** Project close kills all AI PTY (`terminalDestroyAllAiPty`)
- [x] **D.4** cwd from checkout root (`resolveAgentShellCwd`)
- [x] **D.5** Settings copy update
