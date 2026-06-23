# Terminal × AI Chat Integration Design

**Date:** 2026-06-22  
**Status:** Implemented (Phase 2A + 2B + Phase 3 foundation)  
**Depends on:** [Terminal Stability Design](./2026-06-22-terminal-stability-design.md) Phase 1

## Goals

Associate AI Chat bash execution with RightArea terminals; allow terminal output as Composer context.

## Execution Models

| Mode | Setting | Behavior |
|------|---------|----------|
| `mirror` (default) | `agentTerminalMode: "mirror"` | OpenCode runs bash; renderer mirrors command/output to AI terminal tab (xterm, no interactive PTY) |
| `pty` | `agentTerminalMode: "pty"` | Custom `bash.ts` OpenCode tool executes via file bridge → Electron PTY pool |

User terminals (`terminalSource: "user"`) are never shared with the agent.

## Tab Metadata

```ts
terminalSource?: "user" | "ai";
linkedChatTabId?: string;
linkedToolCallId?: string;
```

- `newTerminalTab()` → user tab
- `newAiTerminalTab({ chatTabId, toolCallId? })` → AI tab

AI tabs: sparkle icon, read-only xterm, skip busy close confirmation.

## AI Terminal Session Lifecycle (one tab per Chat tab)

**Model:** Each **Chat tab** owns at most **one** AI terminal tab. All bash tool calls in that chat append to a single read-only mirror log (`sessionMirrorLog`).

| Event | Behavior |
|-------|----------|
| First bash in chat | Create ✨ AI tab, stream command/output, auto-focus Terminal mode |
| Subsequent bash (tab open) | Append to same tab; update tab title to latest command |
| User closes AI tab | Tab removed; `sessionMirrorLog` retained; `userDismissedAiTab = true` |
| Bash while dismissed | Append to `sessionMirrorLog` only — **do not** auto-reopen tab |
| BashWidget「Terminal」| Reopen tab, replay full `sessionMirrorLog`, clear dismissed flag |
| Chat tab closed | Remove AI tab + wipe session mirror and bash metadata |

**Stale mapping fix:** Tab pointers (`chatTabToAiTab`, `toolCallToAiTab`) are cleared on user close. `findOpenAiTabForChat()` reads `linkedChatTabId` from `right-panel-store` as source of truth before focus/create.

**Not one tab per bash:** Multiple bash widgets share the same AI terminal view for the chat session.

## Mirror Protocol

On `chat:stream` bash `tool_use` → ensure AI tab (or session log if dismissed), write `$ command`.  
On `tool_result` → append output + exit footer (to open tab or `sessionMirrorLog`).

Store: `terminal-ai-store.ts` — `sessionMirrorLog`, `userDismissedAiTab`, `toolCallToChatTab`, `bashByToolCall`.

## Composer `terminal-snippet`

```ts
{
  type: "terminal-snippet";
  id: string;
  label: string;
  command?: string;
  output: string;
  exitCode?: number;
  cwd?: string;
  sourceTabId?: string;
}
```

Compiled to `## Terminal context` fenced blocks in agent prompt.

## Phase 3 Bash Bridge

OpenCode `bash.ts` writes `~/.prism-terminal-bridge/<sessionId>/request.json`, polls `result.json`.  
Electron `terminal-bridge.ts` watches and runs via `child_process` (pty mode) or returns cached mirror output.

## Phase 3 Spike: ACP Terminal RPC

**Finding:** `AcpService.initialize` declares `clientCapabilities.terminal: true` but prism-next implements **no** ACP terminal RPC handlers (no `terminal/create` client methods). OpenCode continues to use its built-in `bash` tool in mirror mode.

**Recommendation:** Use file bridge (`~/.prism-terminal-bridge`) + optional `bash.ts` override for pty mode. True node-pty delegation can extend the bridge later without ACP protocol changes.
