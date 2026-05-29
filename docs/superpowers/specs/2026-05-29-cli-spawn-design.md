# CLI Spawn Architecture — Design Spec

**Date:** 2026-05-29
**Status:** Approved

## Goal

Replace the ACP SDK (`@agentclientprotocol/claude-agent-acp`) with direct CLI subprocess spawning (`child_process.spawn`). This gives Prism access to the user's locally installed Claude CLI and its full configuration (third-party models, custom API endpoints, provider settings).

## Motivation

- **ACP SDK limitation**: The `@agentclientprotocol/claude-agent-acp` package uses `@anthropic-ai/claude-agent-sdk` which communicates directly with the official Anthropic API. It does not respect local Claude CLI configuration at `~/.claude/settings.json`.
- **Third-party models**: Users with locally configured Claude CLI can use any provider (including Chinese models like DeepSeek, Zhipu, Kimi) through provider settings. ACP bypasses this entirely.
- **Self-sufficiency**: Direct CLI spawning removes dependency on the ACP SDK ecosystem, giving Prism full control over agent communication.

## Architecture Overview

```
Before (ACP):     Prism → ACP JSON-RPC → @agentclientprotocol/claude-agent-acp → Claude SDK → Official API
After (CLI spawn): Prism → child_process.spawn → local claude binary → local config → any API
```

### Design Principle: Minimum Diff

The entire renderer component tree (ChatComposer, ChatMessages, AgentSettingsBar, ToolWidget, MarkdownRenderer, ChatStore core logic) remains **unchanged**. Only the IPC bridge layer and the main-process agent management are replaced.

## Component Design

### 1. CliManager (`main/cli/cli-manager.ts`)

**Purpose:** Manage CLI child process lifecycle — spawn, send prompts, receive streaming output, cancel, kill.

**Replaces:** `main/agents/agent-manager.ts`

```ts
interface CliSession {
  child: ChildProcess;
  stdin: Writable;
  sessionId: string;
  agentId: string;
  cwd: string;
  status: "idle" | "busy";
  createdAt: number;
}

class CliManager {
  private sessions: Map<string, CliSession>;

  ensureSession(tabId: string, cwd: string, agentId: string, model?: string): string;
  sendPrompt(tabId: string, prompt: string): void;
  cancel(tabId: string): void;
  closeSession(tabId: string): void;
  closeAll(): void;
  setGateway(baseUrl?: string, apiKey?: string): void;
}
```

**Spawning (ensureSession):**

```bash
claude \
  --print \
  --output-format stream-json \
  --input-format stream-json \
  [--model <model>] \
  [--session-id <id>]
```

- `--print`: Non-interactive mode, output to stdout
- `--output-format stream-json`: NDJSON (one JSON object per line)
- `--input-format stream-json`: Accept NDJSON on stdin
- `--model`: Optional, from agent-settings-store
- Environment: inherits `process.env` (Claude reads ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL, etc. automatically)

**Sending (sendPrompt):**

Write a JSON line to child.stdin:
```json
{"type":"user","message":{"role":"user","content":"<prompt>"}}
```

**Cancelling (cancel):**

Send SIGINT to child process. Claude returns partial results then exits. A new process is spawned for the next prompt (process state is not reliable after SIGINT).

**Concurrency:** Each tab has an independent child process. Multiple tabs can stream simultaneously.

### 2. ClaudeParser (`main/cli/claude-parser.ts`)

**Purpose:** Parse Claude CLI stream-json NDJSON output lines into `ChatStreamMessage` format.

```ts
interface CliParser {
  parse(line: string): ChatStreamMessage | null;
}

class ClaudeParser implements CliParser {
  parse(line: string): ChatStreamMessage | null {
    const json = JSON.parse(line);
    if (json.type === "system") return null;  // Skip session metadata
    if (json.type === "assistant") return json;
    if (json.type === "user") return json;     // tool_result
    if (json.type === "result") return {       // completion
      type: "result",
      usage: json.usage,
      duration_ms: json.duration_ms,
      result: json.subtype === "success" ? "Completed" : json.error,
      is_error: !!json.error,
    };
    return null;
  }
}
```

**Key insight:** Claude CLI's stream-json output format is structurally identical to the existing `ChatStreamMessage` type. The parser is essentially a pass-through filter. No format translation needed.

**Parser registry:**

```ts
const PARSERS: Record<string, CliParser> = {
  claude: new ClaudeParser(),
};
```

Adding a new CLI = implementing `CliParser` + registering in this map.

### 3. IPC Handlers (`main/ipc/cli.ts`)

**Purpose:** Bridge renderer requests to CliManager. **Replaces:** `main/ipc/agent.ts`

```ts
ipcMain.handle("cli:send", async (event, args: {
  tabId: string; prompt: string; cwd: string;
  agent?: string; model?: string | null;
}) => {
  const manager = getCliManager(win);
  manager.ensureSession(args.tabId, args.cwd, args.agent || "claude", args.model);
  manager.sendPrompt(args.tabId, args.prompt);
});

ipcMain.handle("cli:cancel", async (event, args: { tabId: string }) => {
  manager?.cancel(args.tabId);
});

ipcMain.handle("cli:setGateway", async (event, args: {
  baseUrl?: string; apiKey?: string;
}) => {
  manager?.setGateway(args.baseUrl, args.apiKey);
});
```

### 4. Renderer Changes

#### chat-store.ts — sendPrompt

**Before:**
```ts
await window.electronAPI.agentSend(projectPath, userPrompt, tabId, agentId, sessionId, model, agentMode, effort);
```

**After:**
```ts
await window.electronAPI.cliSend({
  tabId, prompt: userPrompt, cwd: projectPath,
  agent: agentId,
  model: agentSettings.getSetting("model"),
});
```

#### chat-store.ts — cancelExecution

**Before:** `await window.electronAPI.agentCancel(tabId)`
**After:** `await window.electronAPI.cliCancel(tabId)`

#### use-agent-events.ts → use-cli-events.ts

- Rename file
- Change IPC channel subscriptions: `agent:stream` → `cli:stream`, `agent:complete` → `cli:complete`, `agent:stderr` → `cli:stderr`
- Internal logic (message buffering, debounce, tool tracking) unchanged

#### left-main-area.tsx

- `import { useAgentEvents }` → `import { useCliEvents }`
- `useAgentEvents()` → `useCliEvents()`

#### preload/index.ts

Add:
```ts
cliSend: (args: {...}) => ipcRenderer.invoke("cli:send", args),
cliCancel: (args: { tabId: string }) => ipcRenderer.invoke("cli:cancel", args),
cliSetGateway: (baseUrl?: string, apiKey?: string) => ipcRenderer.invoke("cli:setGateway", { baseUrl, apiKey }),
onCliStream: (callback) => { ... },
onCliComplete: (callback) => { ... },
onCliStderr: (callback) => { ... },
```

#### electron.d.ts

Add corresponding type declarations.

### 5. Unchanged Components

These components require **zero changes**:
- `chat-store.ts` — tabs, messages, sessions, streaming core logic
- `chat-composer.tsx` — text input, @-mentions, slash commands
- `chat-messages.tsx` — message list, UserMessage, AssistantMessage, ResultMessage
- `tool-widgets.tsx` — Edit, Bash, Todo, AskUserQuestion widgets
- `markdown-renderer.tsx` — KaTeX + ReactMarkdown
- `agent-settings-bar.tsx` — agent config container
- `agent-settings/` — all agent components (claude, gemini, opencode, qoder)
- `left-sidebar.tsx` — session list
- `agent-settings-store.ts` — KV settings store

### 6. Files to Delete

- `main/agents/agent-manager.ts` — replaced by CliManager
- `main/ipc/agent.ts` — replaced by main/ipc/cli.ts
- `@agentclientprotocol/claude-agent-acp` — dependency removed from package.json
- `@agentclientprotocol/sdk` — dependency removed (if not used elsewhere)

## Data Flow (sendPrompt)

```
1. ChatComposer.handleSend()
   └→ chat-store.sendPrompt(finalPrompt)

2. chat-store.sendPrompt
   ├→ 追加 userMessage 到 store (立即显示)
   ├→ set isStreaming = true
   └→ electronAPI.cliSend({ tabId, prompt, cwd, agent, model })

3. preload IPC bridge
   └→ ipcRenderer.invoke("cli:send", args)

4. main/ipc/cli.ts handler
   ├→ cliManager.ensureSession(tabId, cwd, agentId, model)
   │   └→ spawn("claude", ["--print", "--output-format=stream-json", ...])
   └→ cliManager.sendPrompt(tabId, prompt)
       └→ child.stdin.write(JSON.stringify({type:"user",message:{role:"user",content:prompt}})+"\n")

5. child.stdout "data" event
   ├→ 逐行读取 NDJSON
   ├→ ClaudeParser.parse(line) → ChatStreamMessage
   └→ win.webContents.send("cli:stream", { tabId, data: JSON.stringify(msg) })

6. use-cli-events.ts
   ├→ 解析 IPC 事件
   ├→ store._appendMessage / _upsertLastMessage
   └→ ChatMessages 自动重渲染

7. child process exit (正常结束或 SIGINT)
   └→ win.webContents.send("cli:complete", { tabId, success, error? })
```

## Risks

- **Claude CLI version compatibility**: `--output-format=stream-json` and `--input-format=stream-json` must be supported. Tested with v2.1.150+.
- **Session resume**: Claude CLI might not support `--session-id` for resuming conversations. Fallback: treat every chat as a new session.
- **Tool approval**: Claude CLI may prompt for permission on tool use. We auto-approve all in non-interactive mode (`--print` implies `--dangerously-skip-permissions` behavior needs verification).
- **Gateway config**: `_meta.gateway` approach from ACP research is removed. Gateway configuration is handled by the user's local Claude CLI settings file.

## Non-Goals

- PTY-based terminal emulation (only stdio)
- Gemini/Codex CLI support (architecture supports it via CliParser interface, but implementation deferred)
- ACP protocol compatibility layer
