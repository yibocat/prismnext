# OpenCode Migration Design

**Date:** 2026-06-17
**Status:** Spec (planning phase)
**Scope:** prism-next Electron app — replace Claude Code CLI + ACP with OpenCode SDK

---

## 1. Motivation

### Why Replace Claude Code

1. **Availability risk**: Claude Code CLI future availability uncertain
2. **User experience**: Current architecture requires users to install Claude Code CLI separately — poor one-click install experience
3. **Performance**: CLI-based cold start via `child_process.spawn` is slow
4. **Architecture mismatch**: Current code is deeply coupled to Claude-specific NDJSON stream-json format, argument patterns, and session storage

### Why OpenCode

1. **Open source** — no availability risk
2. **Official SDK (`@opencode-ai/sdk`)** — type-safe TypeScript client, manages server lifecycle automatically
3. **Plugin system** — extensible via standardized plugins, more powerful than hand-rolled skills
4. **One-click experience** — can bundle server binary with Electron, no separate CLI install needed
5. **Standard protocols** — HTTP + SSE for communication, no custom NDJSON parsing

### Key Decisions (User Confirmed)

| Decision | Choice |
|----------|--------|
| Integration approach | **A: SDK-first** — `createOpencode()` manages everything |
| Session storage | **A: OpenCode native** — use `session.*` API, discard hand-rolled JSONL |
| Configuration | **A: OpenCode native** — `CLAUDE.md` → `AGENTS.md`, use OpenCode plugin/MCP system |
| Old data migration | **No** — no production users, no need to migrate Claude sessions |
| Binary distribution | **Bundle** — ship OpenCode binary in Electron `extraResources` |
| Multi-agent | **Remove** — single-agent focus on OpenCode only |

---

## 2. Architecture Overview

### Current Architecture (to be replaced)

```
Renderer (React/Zustand)
  → Preload (contextBridge)
    → IPC Handlers (cli.ts)
      → CliManager (child_process.spawn)
        → Claude CLI binary
          → NDJSON stdout → ClaudeParser (hand-rolled state machine)
          → JSONL session files
```

### Target Architecture

```
Renderer (React/Zustand)
  → Preload (contextBridge)
    → IPC Handlers (chat.ts)  [simplified, ~4 channels]
      → OpencodeService (singleton)
        → @opencode-ai/sdk (createOpencode)
          → HTTP localhost:4096
            → OpenCode Server (Go binary, SDK-managed)
              → SSE events → IPC → Renderer
              → Session storage (OpenCode internal)
```

### Key Architectural Differences

| Aspect | Before | After |
|--------|--------|-------|
| Process management | `child_process.spawn` manual | SDK `createOpencode()` automatic |
| Communication | NDJSON stream-json via stdout | HTTP + SSE via SDK client |
| Stream parsing | Hand-rolled `ClaudeParser` state machine | Type-safe SSE event iteration |
| Session storage | Hand-rolled JSONL + `index.json` | OpenCode internal via `session.*` API |
| Agent selection | 4-agent registry + dropdown UI | None — single OpenCode agent |
| Token counting | Anthropic-specific `ClaudeCalculator` | From SSE `session.status` usage data |
| Configuration | `.prismnext/agent-config/claude/` | OpenCode native (`AGENTS.md`, plugins, MCP) |

---

## 3. File Change Manifest

### 3.1 Files to DELETE

```
# Agent layer — Claude specific
prism-next/src/main/agents/claude/config.ts
prism-next/src/main/agents/claude/parser.ts
prism-next/src/main/agents/claude/sessions.ts
prism-next/src/main/agents/claude/calculator.ts

# Agent layer — placeholders (no longer needed)
prism-next/src/main/agents/opencode/   (entire directory — recreated as new OpencodeService)
prism-next/src/main/agents/gemini/     (entire directory)
prism-next/src/main/agents/qoder/      (entire directory)

# Agent layer — multi-agent infrastructure
prism-next/src/main/agents/registry.ts
prism-next/src/main/agents/types.ts      (AgentIntegration interface, Claude-specific)
prism-next/src/main/agents/context-calculator.ts  (Claude-specific token calculation)
prism-next/src/main/agents/tokenizer.ts            (Anthropic/@anthropic-ai tokenizer)

# Renderer — Claude-specific UI
prism-next/src/renderer/components/modules/chat/agent-settings/claude-settings.tsx
prism-next/src/renderer/stores/agent-settings-store.ts  (rewritten as opencode-settings-store)
prism-next/src/renderer/lib/agent-config.ts             (rewritten as opencode-config)
prism-next/src/renderer/lib/system-prompt-cleaner.ts     (ACP/Claude-specific cleaning)

# Renderer — hooks
prism-next/src/renderer/hooks/use-cli-events.ts  → rewritten as use-opencode-events.ts
```

### 3.2 Files to REWRITE (substantial)

```
prism-next/src/main/agents/index.ts       → simplified barrel export
prism-next/src/main/cli/cli-manager.ts     → replaced by opencode/service.ts
prism-next/src/main/cli/context-resolver.ts → rewritten for AGENTS.md
prism-next/src/main/cli/types.ts           → simplified types
prism-next/src/main/ipc/cli.ts            → rewritten as chat.ts
prism-next/src/main/ipc/fs.ts             → remove hardcoded "claude" config dir
prism-next/src/renderer/stores/chat-store.ts  → remove selectedAgent, Claude progress text
prism-next/src/renderer/components/modules/chat/chat-composer.tsx  → remove agent selector
prism-next/src/renderer/components/modules/chat/agent-settings/agent-settings-bar.tsx → remove registry
prism-next/src/renderer/components/modules/settings/agent-project-settings.tsx → CLAUDE.md → AGENTS.md
prism-next/src/renderer/types/electron.d.ts  → remove Claude-specific APIs
prism-next/src/preload/index.ts              → simplify agent API surface
```

### 3.3 Files to CREATE

```
prism-next/src/main/opencode/service.ts    # OpencodeService singleton
prism-next/src/main/opencode/config.ts     # OpenCode configuration transformation
prism-next/src/main/opencode/event-bridge.ts # SSE → IPC event bridging
prism-next/src/main/ipc/chat.ts            # Simplified IPC handlers (replaces cli.ts)
prism-next/src/renderer/stores/opencode-settings-store.ts  # Provider/model settings
prism-next/src/renderer/lib/opencode-config.ts             # OpenCode UI config
prism-next/src/renderer/hooks/use-opencode-events.ts       # SSE event handler hook
prism-next/src/renderer/components/modules/chat/agent-settings/opencode-settings.tsx
```

### 3.4 Files to UPDATE (minor)

```
prism-next/package.json                   # Remove ACP packages, add @opencode-ai/sdk
prism-next/pnpm-lock.yaml                 # Regenerate
prism-next/src/main/ipc/index.ts          # Register chat handlers (replace cli)
prism-next/src/renderer/components/layout/left-main-area.tsx  # Remove Claude comment
prism-next/src/renderer/components/modules/chat/error-boundary.tsx  # Update error tag
prism-next/src/renderer/components/modules/chat/chat-messages.tsx  # Message format adapt
prism-next/src/renderer/components/modules/chat/context-window-indicator.tsx
prism-next/src/renderer/components/modules/chat/tools/*.tsx  # Event key mapping
prism-next/src/renderer/styles/tokens/chat.css  # Update comment
```

### 3.5 Files UNCHANGED (independent of Agent)

```
# Core Electron
prism-next/src/main/index.ts
prism-next/src/main/services/compiler.ts
prism-next/src/main/services/filesystem.ts
prism-next/src/main/services/settings.ts
prism-next/src/main/services/texlive-detect.ts

# PDF, Editor, Layout
prism-next/src/renderer/components/workspace/*    (CodeMirror, MuPDF)
prism-next/src/renderer/components/layout/*       (panels, sidebar)
prism-next/src/renderer/stores/document-store.ts
prism-next/src/renderer/stores/compile-store.ts
prism-next/src/renderer/stores/layout-store.ts
prism-next/src/renderer/stores/changes-store.ts   (data source changes, store structure unchanged)

# Worktree (Git integration, independent of agent)
prism-next/src/renderer/components/modules/chat/worktree-selector.tsx
prism-next/src/renderer/components/modules/chat/worktree-actions.tsx
prism-next/src/renderer/components/modules/chat/worktree-push-panel.tsx
prism-next/src/renderer/components/modules/chat/merge-worktree-dialog.tsx
prism-next/src/renderer/components/modules/chat/branch-selector.tsx

# IPC handlers (non-agent)
prism-next/src/main/ipc/fs.ts          (except remove hardcoded "claude" path)
prism-next/src/main/ipc/compile.ts
prism-next/src/main/ipc/window.ts
prism-next/src/main/ipc/settings.ts     (except remove Claude-specific getters)
prism-next/src/main/ipc/workspace.ts
prism-next/src/main/ipc/git.ts
prism-next/src/main/ipc/terminal.ts
prism-next/src/main/ipc/browser.ts
prism-next/src/main/ipc/theme.ts
prism-next/src/main/ipc/worktree.ts
prism-next/src/main/ipc/log.ts
```

---

## 4. OpencodeService Design (Core Module)

### 4.1 Interface

```typescript
// opencode/service.ts
export class OpencodeService {
  // --- Lifecycle ---
  static getInstance(): OpencodeService
  async initialize(projectPath: string, config?: OpencodeConfig): Promise<void>
  async shutdown(): Promise<void>
  async healthCheck(): Promise<{ healthy: boolean; version: string }>

  // --- Session ---
  async createSession(title?: string): Promise<SessionInfo>
  async listSessions(): Promise<SessionInfo[]>
  async getMessages(sessionId: string): Promise<Message[]>
  async deleteSession(sessionId: string): Promise<void>

  // --- Chat ---
  async sendPrompt(
    tabId: string,
    sessionId: string,
    prompt: string,
    opts?: { model?: string; provider?: string; systemPrompt?: string }
  ): Promise<void>
  async abort(sessionId: string): Promise<void>

  // --- Config ---
  async getProviders(): Promise<Provider[]>
  async setAuth(provider: string, credentials: Record<string, string>): Promise<void>
}
```

### 4.2 SSE Event → IPC Mapping

| OpenCode SSE Event | IPC Channel (main → renderer) | Description |
|---|---|---|
| `message.part.updated` | `chat:stream` | Streaming text delta / tool call delta |
| `message.updated` | `chat:stream` | Message-level update |
| `session.status` → `completed` | `chat:complete` | Turn finished (with token usage) |
| `session.status` → `error` | `chat:complete` | Turn error |
| `session.status` → `running` | `chat:stream` | Status change notification |
| `todo.updated` | `chat:stream` | Task/plan update |
| `permission.asked` | `chat:permission` | Permission request (auto-handle or prompt) |
| `session.created` | `chat:sessionCreated` | New session ID notification |

### 4.3 Server Lifecycle

```
App start:
  OpencodeService.initialize(projectPath)
    ├── Resolve binary path
    │   ├── Production: process.resourcesPath + "/opencode"
    │   └── Development: which opencode || bundled binary
    ├── createOpencode({ binaryPath, config: { workdir: projectPath } })
    │   ├── SDK starts OpenCode Server Go process
    │   ├── Waits for server ready (HTTP health check)
    │   └── Returns { client, server }
    ├── Register IPC handlers
    └── Notify renderer: "Chat ready"

Project switch:
  OpencodeService.initialize(newProjectPath)
    └── Close old server → start new one (server.close() → createOpencode)

App quit:
  OpencodeService.shutdown()
    └── server.close() → cleanup
```

### 4.4 Multi-Tab Session Routing

```
Tab A (session-1) ─→ sendPrompt("tab-a", "session-1", "...")
                          ↓
                    client.session.prompt({ path: { id: "session-1" }, ... })
                          ↓
                    Global SSE event stream (all sessions)
                          ↓
                    EventBridge routes by sessionId → only session-1 events to IPC
                          ↓
                    IPC sends "chat:stream" with tabId = "tab-a"
                          ↓
                    Renderer useOpencodeEvents hook filters by tabId
```

---

## 5. IPC Changes

### 5.1 New IPC Channels (`chat:*`)

| Channel | Direction | Payload |
|---------|-----------|---------|
| `chat:send` | Renderer → Main | `{ projectPath, worktreePath, prompt, tabId, sessionId, settings }` |
| `chat:cancel` | Renderer → Main | `{ sessionId }` |
| `chat:status` | Renderer → Main | `{}` → returns health info |
| `session:list` | Renderer → Main | `{}` → returns SessionInfo[] |
| `session:load` | Renderer → Main | `{ sessionId }` → returns Message[] |
| `session:delete` | Renderer → Main | `{ sessionId }` |
| `chat:setAuth` | Renderer → Main | `{ provider, credentials }` |
| `chat:getProviders` | Renderer → Main | `{}` → returns Provider[] |

### 5.2 Event Channels (main → renderer)

| Channel | Payload |
|---------|---------|
| `chat:stream` | `{ tabId, type, data }` |
| `chat:complete` | `{ tabId, sessionId, tokenUsage, error? }` |
| `chat:permission` | `{ tabId, permissionId, message, options }` |
| `chat:sessionCreated` | `{ sessionId }` |

### 5.3 Preload API (simplified)

```typescript
// Removed (Claude-specific)
// cliPrewarm, cliStatus, cliSetGateway, cliAnswer, cliCloseSession

// New (OpenCode-specific)
chatSend: (params: ChatSendParams) => Promise<void>
chatCancel: (sessionId: string) => Promise<void>
chatStatus: () => Promise<HealthInfo>
sessionList: () => Promise<SessionInfo[]>
sessionLoad: (sessionId: string) => Promise<Message[]>
sessionDelete: (sessionId: string) => Promise<void>
chatSetAuth: (provider: string, credentials: object) => Promise<void>
chatGetProviders: () => Promise<Provider[]>

// Events
onChatStream: (callback: (data: StreamEvent) => void) => CleanupFn
onChatComplete: (callback: (data: CompleteEvent) => void) => CleanupFn
onChatPermission: (callback: (data: PermissionEvent) => void) => CleanupFn
onChatSessionCreated: (callback: (data: { sessionId: string }) => void) => CleanupFn
```

---

## 6. Renderer Changes

### 6.1 Zustand Stores

**chat-store.ts** — Remove:
- `selectedAgent` field (was `"claude"`)
- `emitProgressThinking("Starting Claude Code...")` text
- Claude-specific comments and format handling in `loadSession`

**agent-settings-store.ts → opencode-settings-store.ts:**
```typescript
interface OpenCodeSettings {
  provider: string   // "anthropic" | "openai" | "google" | dynamic
  model: string      // provider-specific model ID
}
// Provider list dynamically fetched from client.config.providers()
```

### 6.2 Hook: use-cli-events.ts → use-opencode-events.ts

```typescript
// Before: JSON.parse(data) → if msg.type === "assistant" → ...
// After:  switch (event.type) → case "message.part.updated" → ...

export function useOpenCodeEvents() {
  const onChatStream = useCallback(({ tabId, type, data }: StreamEvent) => {
    switch (type) {
      case "message.part.updated":
        // Text delta / tool delta → _upsertLastMessage
        break
      case "session.status":
        // running/completed/error → state update
        if (data.status === "completed") {
          setStreaming(false)
          setTokenUsage(data.tokenUsage)
        }
        break
      case "todo.updated":
        // Task updates → todo widget
        break
    }
  }, [])

  const onChatComplete = useCallback(({ tabId, tokenUsage, error }: CompleteEvent) => {
    setStreaming(false)
    if (tokenUsage) setContextTokens(tabId, tokenUsage)
    if (error) setError(tabId, error)
    // Auto-recompile if tex files changed
    resumeAutoCompileAfterAi()
  }, [])
}
```

### 6.3 UI Components

| Component | Change |
|-----------|--------|
| `chat-composer.tsx` | **Remove agent selector dropdown.** Add optional provider/model quick switch |
| `agent-settings-bar.tsx` | **Remove registry dispatch.** Always render OpenCodeSettings |
| `claude-settings.tsx` | **Delete.** Create `opencode-settings.tsx` with Provider + Model dropdowns |
| `chat-messages.tsx` | Adapt message part format. Core rendering logic (markdown, code, thinking) unchanged |
| `context-window-indicator.tsx` | Token data source: `ClaudeCalculator` → OpenCode SSE usage |
| `tools/*.tsx` | **Mostly reused.** Adjust event key names |
| `ai-bar.tsx` | **Unchanged** — just the entry capsule |

### 6.4 Configuration UI

**agent-project-settings.tsx changes:**
- `"CLAUDE.md"` → `"AGENTS.md"`
- `"No CLAUDE.md found"` → `"No AGENTS.md found"`
- Remove Claude-specific context component toggles (skills/MCP now OpenCode native)

**agent-app-settings.tsx:**
- System prompt editor: **preserved**, writes to OpenCode config or injected as system parts

---

## 7. Configuration Migration

### 7.1 Mapping Table

| Claude Code Concept | OpenCode Equivalent | Action |
|---|---|---|
| `CLAUDE.md` (project root) | `AGENTS.md` (project root) | Rename file; OpenCode reads natively |
| `.prismnext/agent-config/claude/skills/` | OpenCode plugin system | Remove hand-rolled skills dir |
| `.prismnext/agent-config/claude/mcp.json` | OpenCode MCP config | Move to OpenCode native location |
| `.prismnext/agent-config/claude/plugins/` | OpenCode plugins | Use OpenCode plugin management |
| `APP_SYSTEM_PROMPT` (LaTeX persona) | `session.prompt` body parts or AGENTS.md | Inject as system parts or write to AGENTS.md |
| `agent.contextComponents` settings | OpenCode config | Remove toggles; OpenCode manages natively |
| Claude model/settings (model, effort, mode) | OpenCode provider/model selection | New settings UI |
| `ANTHROPIC_BASE_URL` / `ANTHROPIC_API_KEY` | OpenCode `auth.set()` by provider | Standardized auth API |
| `CLAUDE_CODE_EFFORT_LEVEL` env | Removed | OpenCode manages effort internally |

### 7.2 Project Initialization

`fs.ts` project creation: remove `mkdirSync(prismDir/agent-config/claude)`.
Optionally generate `AGENTS.md` template for new projects.

---

## 8. Build & Packaging

### 8.1 Dependencies

```jsonc
// package.json
{
  "dependencies": {
    // REMOVED:
    // "@agentclientprotocol/claude-agent-acp"
    // "@agentclientprotocol/sdk"
    // "@anthropic-ai/tokenizer"
    
    // ADDED:
    "@opencode-ai/sdk": "^x.x.x"
  }
}
```

### 8.2 Binary Bundling

```
Development:
  OpencodeService checks PATH for opencode binary
  Falls back to: node_modules/@opencode-ai/sdk/... (if SDK bundles it)

Production (.app):
  electron-builder extraResources:
    binaries/opencode/darwin-arm64/opencode → Resources/opencode/
  
  OpencodeService resolves:
    path.join(process.resourcesPath, "opencode", "opencode")
```

### 8.3 Build Flow

```
pnpm build:
  1. electron-vite build              → TypeScript compiled
  2. download-opencode.sh             → Fetch binary for current platform+arch
  3. electron-builder                 → Package .app with binary in extraResources
```

### 8.4 Risks to Verify

| Risk | Severity | Verification |
|------|----------|-------------|
| `createOpencode()` supports `binaryPath` option | 🔴 High | Check SDK source/docs |
| OpenCode binary availability (all platforms + archs) | 🟡 Medium | Check GitHub Releases |
| Binary size acceptable for Electron packaging (~50-100MB OK) | 🟡 Medium | Download and measure |
| macOS code signing compatibility | 🟡 Medium | Test build on macOS |
| OpenCode SSE events provide token usage info | 🔴 High | Check event schema |
| OpenCode plugin system covers our skills use cases | 🟡 Medium | Test with LaTeX-specific tools |
| `session.messages()` returns full message history | 🔴 High | Verify API behavior |

---

## 9. Implementation Phases (Preview)

This section previews the implementation structure. Detailed steps will be in the implementation plan.

**Phase 1: Core Infrastructure**
- Add `@opencode-ai/sdk` dependency
- Implement `OpencodeService` (server lifecycle)
- Implement `EventBridge` (SSE → IPC)
- Create simplified IPC handlers (`chat.ts`)

**Phase 2: Renderer Adaptation**
- Rewrite `use-opencode-events.ts` hook
- Update `chat-store.ts` (remove Claude references)
- Create `opencode-settings-store.ts`
- Adapt message rendering for OpenCode format

**Phase 3: UI Cleanup**
- Remove agent selector from `chat-composer.tsx`
- Create `opencode-settings.tsx`
- Delete `claude-settings.tsx`
- Update settings pages

**Phase 4: Configuration Migration**
- `CLAUDE.md` → `AGENTS.md` logic
- Remove `.prismnext/agent-config/claude/` paths
- Update project initialization

**Phase 5: Build & Packaging**
- Remove ACP/Claude packages
- Add OpenCode binary download script
- Configure electron-builder `extraResources`

**Phase 6: Cleanup**
- Delete all Claude/ACP directories
- Delete placeholder agents (gemini, qoder)
- Remove `registry.ts`, `types.ts`, multi-agent infrastructure
- Update CLAUDE.md (project-level), CHANGELOG.md

---

## 10. Assumptions (to be verified during Phase 1)

1. **`createOpencode()` supports `binaryPath` or equivalent** — allows us to specify the bundled binary location. If not, workaround: add binary dir to PATH before calling `createOpencode()`.
2. **`session.messages()` returns full structured message history** — needed for loading past conversations in the UI. If not available, we fall back to OpenCode's internal storage and read via file system.
3. **SSE events include token usage on `session.status` completed** — needed for context window indicator. If not, we estimate from message length or remove token tracking.
4. **OpenCode manages session storage per-project** — sessions are scoped to the project working directory passed to `createOpencode()`.
5. **OpenCode binary is available for all target platforms** (macOS ARM64/x64, Windows x64, Linux x64) from GitHub Releases or package registry.
6. **SDK client is safe for long-lived connections** — the HTTP client and SSE subscription remain stable across multiple conversation turns in an Electron main process (hours-long sessions).

## 11. Out of Scope

- OpenCode plugin development (use existing plugin ecosystem first)
- Custom MCP servers (use OpenCode native MCP support)
- Multi-agent support (explicitly removed — single OpenCode focus)
- Old Claude session migration (no production users)
- CLI-based agent fallback (fully committed to SDK approach)
