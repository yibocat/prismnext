# OpenCode Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Claude Code CLI + ACP with OpenCode SDK (`@opencode-ai/sdk`) in prism-next, removing all Claude-specific logic, ACP protocol layer, and multi-agent infrastructure.

**Architecture:** Single-agent OpenCode integration via `@opencode-ai/sdk`. The SDK's `createOpencode()` auto-starts an OpenCode server binary (bundled in Electron extraResources). Main process hosts an `OpencodeService` singleton that bridges SSE events to the renderer via simplified IPC channels (`chat:*`). Renderer uses `useOpenCodeEvents` hook to update chat-store. Sessions managed by OpenCode natively via `session.*` SDK API.

**Tech Stack:** Electron 35, React 19, TypeScript strict, Zustand, `@opencode-ai/sdk`

---

## File Structure

### New files to create:
```
prism-next/src/main/opencode/
├── service.ts          # OpencodeService singleton — server lifecycle, session, prompt
└── event-bridge.ts     # SSE → IPC event bridging

prism-next/src/main/ipc/chat.ts           # Simplified IPC handlers (replaces cli.ts)

prism-next/src/renderer/stores/opencode-settings-store.ts  # Provider/model settings
prism-next/src/renderer/hooks/use-opencode-events.ts       # SSE event handler hook
prism-next/src/renderer/components/modules/chat/agent-settings/opencode-settings.tsx

prism-next/scripts/download-opencode.sh   # Binary download script

prism-next/scripts/download-opencode.sh   # Binary download script
```

### Files to delete (in Phase 6 Cleanup):
```
prism-next/src/main/agents/claude/        (entire dir)
prism-next/src/main/agents/opencode/      (entire dir)
prism-next/src/main/agents/gemini/        (entire dir)
prism-next/src/main/agents/qoder/         (entire dir)
prism-next/src/main/agents/registry.ts
prism-next/src/main/agents/types.ts
prism-next/src/main/agents/context-calculator.ts
prism-next/src/main/agents/tokenizer.ts
prism-next/src/main/cli/cli-manager.ts
prism-next/src/main/cli/context-resolver.ts
prism-next/src/main/cli/types.ts
prism-next/src/main/ipc/cli.ts
prism-next/src/renderer/stores/agent-settings-store.ts
prism-next/src/renderer/lib/agent-config.ts
prism-next/src/renderer/lib/system-prompt-cleaner.ts
prism-next/src/renderer/hooks/use-cli-events.ts
prism-next/src/renderer/components/modules/chat/agent-settings/claude-settings.tsx
prism-next/src/renderer/components/modules/chat/agent-settings/gemini-settings.tsx
prism-next/src/renderer/components/modules/chat/agent-settings/qoder-settings.tsx
prism-next/src/renderer/components/modules/chat/agent-settings/opencode-settings.tsx  (old placeholder)
```

### Files to modify:
```
prism-next/package.json
prism-next/src/main/ipc/index.ts
prism-next/src/main/ipc/fs.ts
prism-next/src/preload/index.ts
prism-next/src/renderer/types/electron.d.ts
prism-next/src/renderer/stores/chat-store.ts
prism-next/src/renderer/components/modules/chat/chat-composer.tsx
prism-next/src/renderer/components/modules/chat/agent-settings/agent-settings-bar.tsx
prism-next/src/renderer/components/modules/settings/agent-project-settings.tsx
prism-next/src/renderer/components/modules/settings/agent-app-settings.tsx
prism-next/src/renderer/components/layout/left-main-area.tsx
prism-next/src/renderer/components/modules/chat/error-boundary.tsx
prism-next/src/renderer/components/modules/chat/chat-messages.tsx
prism-next/src/renderer/components/modules/chat/context-window-indicator.tsx
prism-next/.gitignore
```

---

## Phase 1: Core Infrastructure

### Task 1.1: Add @opencode-ai/sdk dependency and configure .gitignore

**Files:**
- Modify: `prism-next/package.json`
- Modify: `prism-next/.gitignore`
- Run: `cd prism-next && pnpm install`

- [ ] **Step 1: Add SDK dependency and remove ACP packages from package.json**

Edit `prism-next/package.json`:
- Remove `"@agentclientprotocol/claude-agent-acp": "^0.36.1"` (line 16)
- Remove `"@agentclientprotocol/sdk": "^0.22.1"` (line 17)
- Add `"@opencode-ai/sdk": "^1.0.0"` in dependencies

```jsonc
"dependencies": {
  // REMOVE these two lines:
  // "@agentclientprotocol/claude-agent-acp": "^0.36.1",
  // "@agentclientprotocol/sdk": "^0.22.1",
  "@opencode-ai/sdk": "^1.0.0",
  // ... rest unchanged
}
```

- [ ] **Step 2: Add binary to .gitignore**

Append to `prism-next/.gitignore`:
```
# OpenCode binary (downloaded or manually placed)
binaries/opencode/
```

- [ ] **Step 3: Install**

Run: `cd prism-next && pnpm install`
Expected: SDK installed, lockfile updated, ACP packages removed.

- [ ] **Step 4: Commit**

```bash
cd prism-next && git add package.json pnpm-lock.yaml .gitignore
git commit -m "chore: replace ACP/Claude deps with @opencode-ai/sdk

Remove @agentclientprotocol/claude-agent-acp and @agentclientprotocol/sdk.
Add @opencode-ai/sdk for OpenCode server integration.
Add binaries/opencode/ to .gitignore.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 1.2: Create OpencodeService — server lifecycle

**Files:**
- Create: `prism-next/src/main/opencode/service.ts`

- [ ] **Step 1: Create the OpencodeService class**

Write `prism-next/src/main/opencode/service.ts`:

```typescript
import { createOpencode, type OpencodeClient, type OpencodeServer } from "@opencode-ai/sdk";
import { join } from "node:path";
import { app } from "electron";
import { createLogger } from "../services/logger";

const log = createLogger("opencode-service", "agent");

export interface SessionInfo {
  id: string;
  title: string;
  lastModified: number;
  createdAt: number;
}

export interface OpencodeServiceConfig {
  model?: string;
  provider?: string;
}

export class OpencodeService {
  private static instance: OpencodeService;
  private client: OpencodeClient | null = null;
  private server: OpencodeServer | null = null;
  private projectPath: string = "";

  static getInstance(): OpencodeService {
    if (!OpencodeService.instance) {
      OpencodeService.instance = new OpencodeService();
    }
    return OpencodeService.instance;
  }

  getClient(): OpencodeClient | null {
    return this.client;
  }

  async initialize(
    projectPath: string,
    config?: OpencodeServiceConfig,
  ): Promise<void> {
    if (this.client && this.projectPath === projectPath) {
      log.info("OpencodeService already initialized for this project");
      return;
    }

    await this.shutdown();

    this.projectPath = projectPath;

    // Resolve binary path
    const binaryPath = this.resolveBinaryPath();
    log.info(`Initializing OpenCode server (binary: ${binaryPath}, cwd: ${projectPath})`);

    try {
      const result = await createOpencode({
        hostname: "127.0.0.1",
        port: 4096,
        timeout: 30_000,
        config: {
          model: config?.model,
          ...(binaryPath ? { binaryPath } : {}),
        },
      });

      this.client = result.client;
      this.server = result.server;

      const health = await this.client.global.health();
      log.info(`OpenCode server ready: version=${health.version}`);
    } catch (err: any) {
      log.error(`Failed to start OpenCode server: ${err.message}`);
      throw err;
    }
  }

  async shutdown(): Promise<void> {
    if (this.server) {
      log.info("Shutting down OpenCode server");
      try {
        this.server.close();
      } catch (err: any) {
        log.error(`Error closing server: ${err.message}`);
      }
      this.server = null;
      this.client = null;
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; version: string }> {
    if (!this.client) {
      return { healthy: false, version: "" };
    }
    try {
      const result = await this.client.global.health();
      return { healthy: result.healthy, version: result.version };
    } catch {
      return { healthy: false, version: "" };
    }
  }

  private resolveBinaryPath(): string | null {
    // Production: binary bundled in extraResources
    if (app.isPackaged) {
      const prodPath = join(process.resourcesPath, "opencode", "opencode");
      return prodPath;
    }
    // Development: rely on PATH or SDK default
    return null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd prism-next && git add src/main/opencode/service.ts
git commit -m "feat(opencode): add OpencodeService server lifecycle

Singleton service managing OpenCode server via @opencode-ai/sdk.
Handles binary path resolution (production: extraResources, dev: PATH).
Auto-starts server on initialize, clean shutdown on project switch/quit.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 1.3: Create OpencodeService — session and prompt methods

**Files:**
- Modify: `prism-next/src/main/opencode/service.ts`

- [ ] **Step 1: Add session management methods**

Add these methods to the `OpencodeService` class in `prism-next/src/main/opencode/service.ts`:

```typescript
// ─── Session Management ───

async createSession(title?: string): Promise<SessionInfo> {
  if (!this.client) throw new Error("OpencodeService not initialized");

  const result = await this.client.session.create({
    body: { title: title || "New Chat" },
  });

  // Session response contains id; extract what we need
  const session = (result as any).data ?? result;
  return {
    id: session.id,
    title: title || "New Chat",
    lastModified: Date.now(),
    createdAt: Date.now(),
  };
}

async listSessions(): Promise<SessionInfo[]> {
  if (!this.client) return [];

  try {
    const result = await this.client.session.list();
    const sessions = (result as any).data ?? result;
    if (!Array.isArray(sessions)) return [];

    return sessions.map((s: any) => ({
      id: s.id,
      title: s.title || "Untitled",
      lastModified: s.updatedAt ? new Date(s.updatedAt).getTime() : Date.now(),
      createdAt: s.createdAt ? new Date(s.createdAt).getTime() : Date.now(),
    }));
  } catch (err: any) {
    log.error(`Failed to list sessions: ${err.message}`);
    return [];
  }
}

async getMessages(sessionId: string): Promise<any[]> {
  if (!this.client) throw new Error("OpencodeService not initialized");

  try {
    const result = await this.client.session.messages({
      path: { id: sessionId },
    });
    return (result as any).data ?? result ?? [];
  } catch (err: any) {
    log.error(`Failed to get messages for session ${sessionId}: ${err.message}`);
    return [];
  }
}

async deleteSession(sessionId: string): Promise<void> {
  if (!this.client) throw new Error("OpencodeService not initialized");

  await this.client.session.delete({
    path: { id: sessionId },
  });
}
```

- [ ] **Step 2: Add sendPrompt method**

Add to `OpencodeService`:

```typescript
// ─── Chat ───

async sendPrompt(
  sessionId: string,
  prompt: string,
  opts?: { model?: string; provider?: string; systemPrompt?: string },
): Promise<void> {
  if (!this.client) throw new Error("OpencodeService not initialized");

  const parts: any[] = [];

  // Inject system prompt if provided
  if (opts?.systemPrompt) {
    parts.push({ type: "text", text: opts.systemPrompt });
  }

  parts.push({ type: "text", text: prompt });

  await this.client.session.prompt({
    path: { id: sessionId },
    body: {
      parts,
      ...(opts?.model ? {
        model: opts.model.includes("/")
          ? opts.model
          : `${opts.provider || "anthropic"}/${opts.model}`,
      } : {}),
    },
  });
}

async abort(sessionId: string): Promise<void> {
  if (!this.client) return;

  try {
    await this.client.session.abort({
      path: { id: sessionId },
    });
  } catch (err: any) {
    log.error(`Failed to abort session ${sessionId}: ${err.message}`);
  }
}
```

- [ ] **Step 3: Add config methods**

Add to `OpencodeService`:

```typescript
// ─── Config ───

async getProviders(): Promise<any[]> {
  if (!this.client) return [];

  try {
    const result = await this.client.config.providers();
    return (result as any).data ?? result ?? [];
  } catch {
    return [];
  }
}

async setAuth(provider: string, credentials: Record<string, string>): Promise<void> {
  if (!this.client) throw new Error("OpencodeService not initialized");

  await this.client.auth.set({
    path: { provider },
    body: credentials,
  });
}
```

- [ ] **Step 4: Commit**

```bash
cd prism-next && git add src/main/opencode/service.ts
git commit -m "feat(opencode): add session, prompt, and config methods to OpencodeService

Session: create, list, getMessages, delete — delegated to OpenCode SDK.
Chat: sendPrompt with optional model/provider/systemPrompt, abort.
Config: getProviders (dynamic model list), setAuth.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 1.4: Create EventBridge — SSE to IPC

**Files:**
- Create: `prism-next/src/main/opencode/event-bridge.ts`

- [ ] **Step 1: Write EventBridge class**

Write `prism-next/src/main/opencode/event-bridge.ts`:

```typescript
import type { BrowserWindow } from "electron";
import type { OpencodeClient } from "@opencode-ai/sdk";
import { OpencodeService } from "./service";
import { createLogger } from "../services/logger";

const log = createLogger("event-bridge", "agent");

interface StreamEvent {
  type: string;
  properties?: any;
}

/**
 * Bridges OpenCode SSE events to Electron IPC.
 *
 * Subscribes to the global SSE event stream and routes events
 * by sessionId → tabId mapping to the correct renderer tab.
 */
export class EventBridge {
  private win: BrowserWindow;
  /** Map sessionId → tabId for event routing */
  private sessionToTab = new Map<string, string>();
  private unsubscribe: (() => void) | null = null;
  private running = false;

  constructor(win: BrowserWindow) {
    this.win = win;
  }

  /** Register which tab owns which session for event routing */
  registerSession(sessionId: string, tabId: string): void {
    this.sessionToTab.set(sessionId, tabId);
  }

  unregisterSession(sessionId: string): void {
    this.sessionToTab.delete(sessionId);
  }

  async start(): Promise<void> {
    if (this.running) return;

    const servicio = OpencodeService.getInstance();
    const client = servicio.getClient();
    if (!client) {
      log.error("Cannot start EventBridge: no OpenCode client");
      return;
    }

    this.running = true;
    log.info("Starting SSE event bridge");

    try {
      const events = await client.event.subscribe();

      // Process events asynchronously
      (async () => {
        try {
          for await (const event of events.stream) {
            if (!this.running) break;
            this.handleEvent(event as StreamEvent);
          }
        } catch (err: any) {
          if (this.running) {
            log.error(`SSE stream error: ${err.message}`);
          }
        }
      })();
    } catch (err: any) {
      this.running = false;
      log.error(`Failed to subscribe to events: ${err.message}`);
    }
  }

  stop(): void {
    this.running = false;
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  private handleEvent(event: StreamEvent): void {
    const props = event.properties || {};
    const sessionId = props.sessionId || props.session_id;
    const tabId = sessionId ? this.sessionToTab.get(sessionId) : undefined;

    if (!tabId) {
      // Event for unknown session — could be from another client, skip
      return;
    }

    switch (event.type) {
      case "message.part.updated":
        this.win.webContents.send("chat:stream", {
          tabId,
          type: "message.part.updated",
          data: props,
        });
        break;

      case "message.updated":
        this.win.webContents.send("chat:stream", {
          tabId,
          type: "message.updated",
          data: props,
        });
        break;

      case "session.status":
        if (props.status === "completed") {
          this.win.webContents.send("chat:complete", {
            tabId,
            sessionId,
            success: true,
            tokenUsage: props.tokenUsage || props.usage || null,
          });
        } else if (props.status === "error") {
          this.win.webContents.send("chat:complete", {
            tabId,
            sessionId,
            success: false,
            error: props.error || "Unknown error",
          });
        } else {
          // running, aborted, etc.
          this.win.webContents.send("chat:stream", {
            tabId,
            type: "session.status",
            data: props,
          });
        }
        break;

      case "session.created":
        this.win.webContents.send("chat:sessionCreated", {
          tabId,
          sessionId: props.sessionId || props.id,
        });
        break;

      case "todo.updated":
        this.win.webContents.send("chat:stream", {
          tabId,
          type: "todo.updated",
          data: props,
        });
        break;

      case "permission.asked":
        this.win.webContents.send("chat:permission", {
          tabId,
          permissionId: props.id || props.permissionId,
          message: props.message || "",
          options: props.options || {},
        });
        break;

      default:
        // Forward unknown events as generic stream data
        this.win.webContents.send("chat:stream", {
          tabId,
          type: event.type,
          data: props,
        });
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd prism-next && git add src/main/opencode/event-bridge.ts
git commit -m "feat(opencode): add EventBridge for SSE-to-IPC event routing

Subscribes to OpenCode SSE event stream, routes events by sessionId→tabId
mapping. Maps OpenCode event types (message.part.updated, session.status,
todo.updated, permission.asked) to IPC channels (chat:stream, chat:complete,
chat:permission, chat:sessionCreated).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 1.5: Create simplified IPC handlers (chat.ts)

**Files:**
- Create: `prism-next/src/main/ipc/chat.ts`
- Modify: `prism-next/src/main/ipc/index.ts`

- [ ] **Step 1: Write chat IPC handlers**

Write `prism-next/src/main/ipc/chat.ts`:

```typescript
import { ipcMain, BrowserWindow, app } from "electron";
import { OpencodeService } from "../opencode/service";
import { EventBridge } from "../opencode/event-bridge";

let eventBridge: EventBridge | null = null;

function getService(): OpencodeService {
  return OpencodeService.getInstance();
}

function getBridge(win: BrowserWindow): EventBridge {
  if (!eventBridge) {
    eventBridge = new EventBridge(win);
  }
  return eventBridge;
}

export function registerChatHandlers(): void {
  // ─── Dispose on project switch ───
  ipcMain.handle("chat:dispose", async () => {
    if (eventBridge) {
      eventBridge.stop();
      eventBridge = null;
    }
    await getService().shutdown();
    return { success: true };
  });

  // ─── Send Prompt ───
  ipcMain.handle(
    "chat:send",
    async (
      event,
      args: {
        projectPath: string;
        worktreePath?: string;
        prompt: string;
        tabId?: string;
        sessionId?: string | null;
        settings?: { model?: string; provider?: string; systemPrompt?: string };
      },
    ) => {
      const tabId = args.tabId || "default";
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) throw new Error("No window");

      const service = getService();
      const cwd = args.worktreePath || args.projectPath || app.getPath("home");

      // Initialize service for this project
      await service.initialize(cwd, {
        model: args.settings?.model,
        provider: args.settings?.provider,
      });

      // Ensure event bridge is running
      const bridge = getBridge(win);
      await bridge.start();

      // Create or reuse session
      let sessionId = args.sessionId;
      if (!sessionId) {
        const session = await service.createSession();
        sessionId = session.id;
        bridge.registerSession(sessionId, tabId);

        // Notify renderer of the new session ID
        win.webContents.send("chat:sessionCreated", { tabId, sessionId });
      } else {
        bridge.registerSession(sessionId, tabId);
      }

      // Send prompt
      await service.sendPrompt(sessionId, args.prompt, {
        model: args.settings?.model,
        provider: args.settings?.provider,
        systemPrompt: args.settings?.systemPrompt,
      });
    },
  );

  // ─── Cancel ───
  ipcMain.handle(
    "chat:cancel",
    async (_event, args: { sessionId: string }) => {
      await getService().abort(args.sessionId);
    },
  );

  // ─── Status ───
  ipcMain.handle("chat:status", async () => {
    const service = getService();
    const health = await service.healthCheck();
    return {
      available: health.healthy,
      version: health.version,
    };
  });

  // ─── Session Management ───
  ipcMain.handle(
    "session:list",
    async () => {
      return await getService().listSessions();
    },
  );

  ipcMain.handle(
    "session:load",
    async (_event, args: { sessionId: string }) => {
      return await getService().getMessages(args.sessionId);
    },
  );

  ipcMain.handle(
    "session:delete",
    async (_event, args: { sessionId: string }) => {
      await getService().deleteSession(args.sessionId);
      return { success: true };
    },
  );

  // ─── Config ───
  ipcMain.handle(
    "chat:getProviders",
    async () => {
      return await getService().getProviders();
    },
  );

  ipcMain.handle(
    "chat:setAuth",
    async (_event, args: { provider: string; credentials: Record<string, string> }) => {
      await getService().setAuth(args.provider, args.credentials);
      return { success: true };
    },
  );
}

export function disposeChat(): void {
  if (eventBridge) {
    eventBridge.stop();
    eventBridge = null;
  }
}
```

- [ ] **Step 2: Register chat handlers in IPC index**

Edit `prism-next/src/main/ipc/index.ts` — replace the `registerCliHandlers` import and call with `registerChatHandlers`:

```typescript
import { registerFsHandlers } from "./fs";
import { registerCompileHandlers } from "./compile";
import { registerChatHandlers } from "./chat";
import { registerSettingsHandlers } from "./settings";
import { registerBrowserHandlers } from "./browser";
import { registerTerminalHandlers } from "./terminal";
import { registerGitHandlers } from "./git";
import { registerWorktreeHandlers } from "./worktree";
import { registerLogHandlers } from "./log";
import { registerThemeHandlers } from "./theme";
import { registerWorkspaceHandlers } from "./workspace";

export function registerIpcHandlers(): void {
  registerFsHandlers();
  registerCompileHandlers();
  registerChatHandlers();
  registerSettingsHandlers();
  registerBrowserHandlers();
  registerTerminalHandlers();
  registerGitHandlers();
  registerWorktreeHandlers();
  registerLogHandlers();
  registerThemeHandlers();
  registerWorkspaceHandlers();
}
```

- [ ] **Step 3: Commit**

```bash
cd prism-next && git add src/main/ipc/chat.ts src/main/ipc/index.ts
git commit -m "feat(opencode): create simplified IPC handlers (chat.ts)

Replace cli.ts handlers with chat.ts:
- chat:send — initialize service + create session + send prompt
- chat:cancel — session.abort()
- chat:status — health check
- session:list/load/delete — CRUD via OpenCode SDK
- chat:getProviders / chat:setAuth — config management

Register chat handlers in IPC index alongside cli handlers (both coexist
during migration).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 2: Renderer Adaptation

### Task 2.1: Create opencode-settings-store.ts

**Files:**
- Create: `prism-next/src/renderer/stores/opencode-settings-store.ts`

- [ ] **Step 1: Write the store**

Write `prism-next/src/renderer/stores/opencode-settings-store.ts`:

```typescript
import { create } from "zustand";

interface OpenCodeSettingsState {
  provider: string;
  model: string | null;
  setProvider: (provider: string) => void;
  setModel: (model: string | null) => void;
  getSettings: () => { model?: string; provider?: string };
}

export const useOpenCodeSettingsStore = create<OpenCodeSettingsState>()((set, get) => ({
  provider: "anthropic",
  model: null,

  setProvider: (provider) => set({ provider, model: null }),
  setModel: (model) => set({ model }),

  getSettings: () => {
    const { provider, model } = get();
    return {
      provider,
      ...(model ? { model } : {}),
    };
  },
}));
```

- [ ] **Step 2: Commit**

```bash
cd prism-next && git add src/renderer/stores/opencode-settings-store.ts
git commit -m "feat(opencode): add OpenCode settings Zustand store

Replaces agent-settings-store. Manages provider and model selection.
Dynamic model list will be fetched from OpenCode SDK config.providers().

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2.2: Create use-opencode-events.ts hook

**Files:**
- Create: `prism-next/src/renderer/hooks/use-opencode-events.ts`

- [ ] **Step 1: Write the hook**

Write `prism-next/src/renderer/hooks/use-opencode-events.ts`:

```typescript
import { useEffect, useRef, useCallback } from "react";
import { useChatStore, type ChatStreamMessage, type ContentBlock } from "@/stores/chat-store";
import { useDocumentStore } from "@/stores/document-store";
import { useChangesStore } from "@/stores/changes-store";
import { useWorktreeStore } from "@/stores/worktree-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { compileCurrentDocument, pauseAutoCompileForAi, resumeAutoCompileAfterAi } from "@/stores/compile-store";
import { createLogger } from "@/services/logger";

const log = createLogger("opencode-events");

export function useOpenCodeEvents() {
  const pendingToolUsesRef = useRef(new Map<string, Map<string, { name: string; input: any }>>());
  const hasTexChangesRef = useRef(new Map<string, boolean>());
  const aiSessionActiveRef = useRef(new Map<string, boolean>());
  const fileContentTrackerRef = useRef(new Map<string, string>());

  // Clear file content tracker on project switch
  useEffect(() => {
    const docState = useDocumentStore.getState();
    let prevRoot = docState.projectRoot;
    const unsub = useDocumentStore.subscribe((state) => {
      if (state.projectRoot !== prevRoot) {
        prevRoot = state.projectRoot;
        fileContentTrackerRef.current.clear();
      }
    });
    return unsub;
  }, []);

  function clearTabMaps(tabId: string) {
    pendingToolUsesRef.current.delete(tabId);
    hasTexChangesRef.current.delete(tabId);
    aiSessionActiveRef.current.delete(tabId);
  }

  function registerProposedChange(
    filePath: string,
    toolUseId: string,
    toolName: string,
    toolInput: any,
    capturedOldContent: string,
  ) {
    const docState = useDocumentStore.getState();
    const projectRoot = docState.projectRoot;
    const worktreeStore = useWorktreeStore.getState();
    const activeWorktree = worktreeStore.activeWorktree;

    let resolvedPath = filePath;
    if (activeWorktree && filePath.startsWith(activeWorktree.path)) {
      resolvedPath = filePath;
    }

    let relativePath = resolvedPath;
    if (activeWorktree && resolvedPath.startsWith(activeWorktree.path)) {
      relativePath = resolvedPath.slice(activeWorktree.path.length).replace(/^\//, "");
    } else if (projectRoot && resolvedPath.startsWith(projectRoot)) {
      relativePath = resolvedPath.slice(projectRoot.length).replace(/^\//, "");
    }

    const file = docState.files.find(
      (f) => f.relativePath === relativePath || f.absolutePath === filePath,
    );

    const isNewFile = !file && toolName.toLowerCase().startsWith("write");
    if (!file && !isNewFile) return;

    const trackedContent = file ? fileContentTrackerRef.current.get(file.relativePath) : undefined;
    const fallback = capturedOldContent || (file ? docState.getContent(file.id) : "") || "";
    const oldContent = trackedContent ?? (isNewFile ? "" : fallback);

    const name = toolName.toLowerCase();
    let newContent: string;

    if (name.startsWith("write")) {
      newContent = toolInput?.content ?? "";
    } else if (name.startsWith("multiedit") && Array.isArray(toolInput?.edits)) {
      newContent = oldContent;
      for (const edit of toolInput.edits) {
        const oldStr: string = edit.old_string ?? "";
        const newStr: string = edit.new_string ?? "";
        if (oldStr === "" && newStr === "") continue;
        const escaped = oldStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        newContent = newContent.replace(new RegExp(escaped, "g"), newStr);
      }
    } else if (name.startsWith("edit")) {
      const oldStr: string = toolInput?.old_string ?? "";
      const newStr: string = toolInput?.new_string ?? "";
      if (oldStr === "" && newStr === "") return;
      const escaped = oldStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      newContent = oldContent.replace(new RegExp(escaped, "g"), newStr);
    } else {
      return;
    }

    if (oldContent !== newContent) {
      if (file) {
        fileContentTrackerRef.current.set(file.relativePath, newContent);
      }

      useChangesStore.getState().addChange({
        id: toolUseId,
        filePath: relativePath,
        absolutePath: resolvedPath,
        oldContent,
        newContent,
        toolName,
      });

      const rpState = useRightPanelStore.getState();
      const existingTab = rpState.tabs.find((t) => t.filePath === relativePath);
      if (!existingTab) {
        const fileName = relativePath.split("/").pop() || relativePath;
        rpState.openFile(relativePath, relativePath, fileName);
      }
    }
  }

  useEffect(() => {
    // ─── Chat Stream Handler ───
    const unsubStream = window.electronAPI.onChatStream(({ tabId, type, data }) => {
      const chatStore = useChatStore.getState();
      const tab = chatStore.tabs.find((t) => t.id === tabId);
      if (!tab) return;

      switch (type) {
        case "message.part.updated": {
          // Convert OpenCode part delta → ContentBlock
          const part = data.part || data;
          const block = convertPartToBlock(part);

          if (block) {
            const msg: ChatStreamMessage = {
              type: "assistant",
              message: { content: [block] },
            };
            chatStore._upsertLastMessage(tabId, msg);

            // Track tool uses
            if (block.type === "tool_use" && block.name && block.id) {
              const toolName = (block.name as string).toLowerCase();
              if (toolName.startsWith("edit") || toolName.startsWith("multiedit") || toolName.startsWith("write")) {
                const tabTools = pendingToolUsesRef.current.get(tabId) ||
                  pendingToolUsesRef.current.set(tabId, new Map()).get(tabId)!;
                tabTools.set(block.id, { name: block.name, input: block.input });

                if (toolName.startsWith("edit") || toolName.startsWith("write")) {
                  const filePath = block.input?.file_path || block.input?.path || "";
                  if (filePath) {
                    hasTexChangesRef.current.set(tabId, true);
                    const relPath = filePath.replace(
                      (useDocumentStore.getState().projectRoot || "") + "/", "",
                    );
                    if (!fileContentTrackerRef.current.has(relPath)) {
                      const file = useDocumentStore.getState().files.find(
                        (f) => f.relativePath === relPath || f.absolutePath === filePath,
                      );
                      if (file) {
                        const content = useDocumentStore.getState().getContent(file.id) || "";
                        fileContentTrackerRef.current.set(relPath, content);
                      }
                    }
                  }
                }
              }
            }
          }
          break;
        }

        case "message.updated": {
          // Full message update — used for tool results
          const message = data.message || data;
          if (message.content && Array.isArray(message.content)) {
            for (const part of message.content) {
              if (part.type === "tool_result" && part.tool_use_id) {
                const tabTools = pendingToolUsesRef.current.get(tabId);
                const toolUse = tabTools?.get(part.tool_use_id);
                if (toolUse) {
                  const filePath = toolUse.input?.file_path || toolUse.input?.path || "";
                  const oldContent = filePath
                    ? fileContentTrackerRef.current.get(
                        filePath.replace((useDocumentStore.getState().projectRoot || "") + "/", ""),
                      ) || ""
                    : "";
                  registerProposedChange(filePath, part.tool_use_id, toolUse.name, toolUse.input, oldContent);
                }
              }
            }
          }
          break;
        }

        case "todo.updated": {
          // Forward as assistant message for TodoWidget rendering
          const todoMsg: ChatStreamMessage = {
            type: "assistant",
            message: {
              content: [{
                type: "tool_use",
                name: "todowrite",
                id: `todo-${Date.now()}`,
                input: { todos: data.todos },
              }],
            },
          };
          chatStore._appendMessage(tabId, todoMsg);
          break;
        }
      }
    });

    // ─── Chat Complete Handler ───
    const unsubComplete = window.electronAPI.onChatComplete(({ tabId, success, error, tokenUsage }) => {
      const chatStore = useChatStore.getState();

      if (!success && error) {
        chatStore._setError(tabId, error);
      }

      // Update context tokens from OpenCode usage
      if (tokenUsage) {
        const totalTokens = (tokenUsage.input_tokens || 0) +
          (tokenUsage.cache_creation_input_tokens || 0) +
          (tokenUsage.cache_read_input_tokens || 0);
        chatStore._setContextTokens(tabId, totalTokens, null, null);
      }

      setTimeout(() => chatStore._setStreaming(tabId, false), 50);

      // Auto-recompile if tex files changed
      if (hasTexChangesRef.current.get(tabId)) {
        const docState = useDocumentStore.getState();
        docState.refreshFiles().then(() => {
          compileCurrentDocument();
        });
      }

      if (aiSessionActiveRef.current.get(tabId)) {
        resumeAutoCompileAfterAi();
      }

      clearTabMaps(tabId);
    });

    // ─── Session Created Handler ───
    const unsubSessionCreated = window.electronAPI.onChatSessionCreated(({ tabId, sessionId }) => {
      useChatStore.getState()._setSessionId(tabId, sessionId);
      aiSessionActiveRef.current.set(tabId, true);
      pauseAutoCompileForAi();
    });

    return () => {
      unsubStream();
      unsubComplete();
      unsubSessionCreated();
    };
  }, []);
}

/** Convert an OpenCode SSE part to our ContentBlock format */
function convertPartToBlock(part: any): ContentBlock | null {
  if (!part || !part.type) return null;

  switch (part.type) {
    case "text":
      return { type: "text", text: part.text || "" };
    case "thinking":
      return { type: "thinking", thinking: part.text || part.thinking || "" };
    case "tool_use":
    case "tool-use":
      return {
        type: "tool_use",
        id: part.id || part.toolId,
        name: part.tool || part.name,
        input: part.input || part.arguments || {},
      };
    case "tool_result":
    case "tool-result":
      return {
        type: "tool_result",
        tool_use_id: part.tool_use_id || part.toolUseId,
        content: part.content || part.result,
        is_error: part.isError || part.is_error,
      };
    default:
      return null;
  }
}
```

> **Note:** `ContentBlock` type is imported from `chat-store.ts` which already defines it. The `convertPartToBlock` function adapts OpenCode part format to our existing ContentBlock format. The actual field names may need adjustment based on real SSE event shapes — validate during Phase 1 verification.

- [ ] **Step 2: Commit**

```bash
cd prism-next && git add src/renderer/hooks/use-opencode-events.ts
git commit -m "feat(opencode): add useOpenCodeEvents hook replacing useCliEvents

Handles OpenCode SSE events (message.part.updated, message.updated,
session.status, todo.updated) and converts to chat-store updates.
Retains file change detection and auto-compile logic from useCliEvents.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2.3: Update chat-store.ts

**Files:**
- Modify: `prism-next/src/renderer/stores/chat-store.ts`

- [ ] **Step 1: Remove selectedAgent, replace with OpenCode defaults**

In `prism-next/src/renderer/stores/chat-store.ts`:

Remove line 267: `selectedAgent: "claude",`

Remove `selectedAgent` from the `ChatState` interface (line 127).

Remove the `setSelectedAgent` method from the interface (line 162) and implementation (line 681).

- [ ] **Step 2: Remove Claude-specific progress text**

In `sendPrompt` method, replace:
- Line 447: `emitProgressThinking("⏳ Starting Claude Code…");` → `emitProgressThinking("⏳ Starting OpenCode…");`
- Line 452: `emitProgressThinking("✅ Claude Code ready");` → `emitProgressThinking("✅ OpenCode ready");`

- [ ] **Step 3: Update sendPrompt to use new IPC**

In `sendPrompt` method, change the IPC call (lines 513-522):

```typescript
// Before:
await window.electronAPI.cliSend({
  projectPath,
  worktreePath: worktreePath || undefined,
  prompt: userPrompt,
  tabId,
  agent: agentId,
  sessionId,
  settings,
});

// After:
await window.electronAPI.chatSend({
  projectPath,
  worktreePath: worktreePath || undefined,
  prompt: userPrompt,
  tabId,
  sessionId,
  settings: {
    model: settings.model || undefined,
    provider: undefined, // will be from opencode-settings-store
    systemPrompt: undefined,
  },
});
```

Also remove `const agentId = get().selectedAgent;` (line 357) and the import of `useAgentSettingsStore` (line 5). Replace with import of `useOpenCodeSettingsStore`.

- [ ] **Step 4: Update cancelExecution to use new IPC**

Line 538: `window.electronAPI.cliCancel(tabId)` → `window.electronAPI.chatCancel(sessionId)`

Line 321: `window.electronAPI.cliCancel(id)` → `window.electronAPI.chatCancel(id)`

- [ ] **Step 5: Update closeTab session cleanup**

Lines 321-322:
```typescript
// Before:
window.electronAPI.cliCancel(id).catch(() => {});
window.electronAPI.cliCloseSession(id).catch(() => {});

// After:
const sessionId = get().tabs.find((t) => t.id === id)?.sessionId;
if (sessionId) {
  window.electronAPI.chatCancel(sessionId).catch(() => {});
}
```

- [ ] **Step 6: Update loadSession to use new IPC**

Lines 617: `window.electronAPI.cliLoadSession(...)` → `window.electronAPI.sessionLoad(sessionId)`

Remove the `agentId` parameter from `loadSession` signature and all related logic:
- Line 579: Remove `agentId?: string` parameter
- Lines 584-591: Remove agent resolution logic
- Line 617: Remove `id, worktreePath` from the call

- [ ] **Step 7: Remove Claude-specific comments**

Lines 95-96, 105, 108, 182-185, 197: Remove or update Claude-specific JSDoc comments.

- [ ] **Step 8: Commit**

```bash
cd prism-next && git add src/renderer/stores/chat-store.ts
git commit -m "refactor(chat-store): remove Claude-specific logic, wire to OpenCode IPC

Remove selectedAgent, setSelectedAgent, agent resolution logic.
Replace cliSend→chatSend, cliCancel→chatCancel, cliLoadSession→sessionLoad.
Remove agentId parameter from loadSession.
Update progress text: Claude Code → OpenCode.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2.4: Update preload and electron.d.ts types

**Files:**
- Modify: `prism-next/src/preload/index.ts`
- Modify: `prism-next/src/renderer/types/electron.d.ts`

- [ ] **Step 1: Update preload — replace CLI APIs with Chat APIs**

In `prism-next/src/preload/index.ts`, replace lines 103-123 (CLI agent operations) with:

```typescript
// OpenCode agent operations
chatDispose: () => ipcRenderer.invoke("chat:dispose"),
chatSend: (args: { projectPath: string; worktreePath?: string; prompt: string; tabId?: string; sessionId?: string | null; settings?: { model?: string; provider?: string; systemPrompt?: string } }) =>
  ipcRenderer.invoke("chat:send", args),
chatCancel: (sessionId: string) =>
  ipcRenderer.invoke("chat:cancel", { sessionId }),
chatStatus: () => ipcRenderer.invoke("chat:status"),
sessionList: () => ipcRenderer.invoke("session:list"),
sessionLoad: (sessionId: string) =>
  ipcRenderer.invoke("session:load", { sessionId }),
sessionDelete: (sessionId: string) =>
  ipcRenderer.invoke("session:delete", { sessionId }),
chatGetProviders: () => ipcRenderer.invoke("chat:getProviders"),
chatSetAuth: (provider: string, credentials: Record<string, string>) =>
  ipcRenderer.invoke("chat:setAuth", { provider, credentials }),
```

Replace lines 256-281 (CLI events) with:

```typescript
// Chat events (Main → Renderer)
onChatStream: (callback: (data: { tabId: string; type: string; data: any }) => void) => {
  const handler = (_event: Electron.IpcRendererEvent, data: { tabId: string; type: string; data: any }) => callback(data);
  ipcRenderer.on("chat:stream", handler);
  return () => ipcRenderer.removeListener("chat:stream", handler);
},
onChatComplete: (callback: (data: { tabId: string; sessionId: string; success: boolean; error?: string; tokenUsage?: any }) => void) => {
  const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
  ipcRenderer.on("chat:complete", handler);
  return () => ipcRenderer.removeListener("chat:complete", handler);
},
onChatPermission: (callback: (data: { tabId: string; permissionId: string; message: string; options: any }) => void) => {
  const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
  ipcRenderer.on("chat:permission", handler);
  return () => ipcRenderer.removeListener("chat:permission", handler);
},
onChatSessionCreated: (callback: (data: { tabId: string; sessionId: string }) => void) => {
  const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
  ipcRenderer.on("chat:sessionCreated", handler);
  return () => ipcRenderer.removeListener("chat:sessionCreated", handler);
},
removeChatListeners: () => {
  ipcRenderer.removeAllListeners("chat:stream");
  ipcRenderer.removeAllListeners("chat:complete");
  ipcRenderer.removeAllListeners("chat:permission");
  ipcRenderer.removeAllListeners("chat:sessionCreated");
},
```

- [ ] **Step 2: Update electron.d.ts types**

In `prism-next/src/renderer/types/electron.d.ts`, replace lines 261-287 (CLI agent operations + events) with:

```typescript
// OpenCode agent operations
chatDispose: () => Promise<{ success: boolean }>;
chatSend: (args: { projectPath: string; worktreePath?: string; prompt: string; tabId?: string; sessionId?: string | null; settings?: { model?: string; provider?: string; systemPrompt?: string } }) => Promise<void>;
chatCancel: (sessionId: string) => Promise<void>;
chatStatus: () => Promise<{ available: boolean; version: string }>;
sessionList: () => Promise<Array<{ id: string; title: string; lastModified: number; createdAt: number }>>;
sessionLoad: (sessionId: string) => Promise<any[]>;
sessionDelete: (sessionId: string) => Promise<{ success: boolean }>;
chatGetProviders: () => Promise<any[]>;
chatSetAuth: (provider: string, credentials: Record<string, string>) => Promise<{ success: boolean }>;

// Chat events (Main → Renderer)
onChatStream: (callback: (data: { tabId: string; type: string; data: any }) => void) => () => void;
onChatComplete: (callback: (data: { tabId: string; sessionId: string; success: boolean; error?: string; tokenUsage?: any }) => void) => () => void;
onChatPermission: (callback: (data: { tabId: string; permissionId: string; message: string; options: any }) => void) => () => void;
onChatSessionCreated: (callback: (data: { tabId: string; sessionId: string }) => void) => () => void;
removeChatListeners: () => void;
```

- [ ] **Step 3: Commit**

```bash
cd prism-next && git add src/preload/index.ts src/renderer/types/electron.d.ts
git commit -m "refactor(preload,types): replace CLI APIs with OpenCode chat APIs

Preload: chatSend, chatCancel, chatStatus, sessionList/Load/Delete,
chatGetProviders, chatSetAuth. Events: onChatStream, onChatComplete,
onChatPermission, onChatSessionCreated.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 3: UI Cleanup

### Task 3.1: Create new opencode-settings.tsx

**Files:**
- Overwrite: `prism-next/src/renderer/components/modules/chat/agent-settings/opencode-settings.tsx`

- [ ] **Step 1: Write OpenCode settings component**

Overwrite `prism-next/src/renderer/components/modules/chat/agent-settings/opencode-settings.tsx`:

```typescript
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useOpenCodeSettingsStore } from "@/stores/opencode-settings-store";
import { CheckIcon } from "lucide-react";

interface ProviderOption {
  id: string;
  name: string;
  desc?: string;
  models?: { id: string; name: string; desc?: string }[];
}

const PROVIDERS: ProviderOption[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    desc: "Claude models",
    models: [
      { id: "claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5", desc: "Best balance" },
      { id: "claude-opus-4-8", name: "Claude Opus 4.8", desc: "Most capable" },
      { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", desc: "Fastest" },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    desc: "GPT models",
    models: [
      { id: "gpt-4o", name: "GPT-4o", desc: "Latest Omni" },
      { id: "gpt-4-turbo", name: "GPT-4 Turbo", desc: "Fast GPT-4" },
    ],
  },
  {
    id: "google",
    name: "Google",
    desc: "Gemini models",
    models: [
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", desc: "Most capable" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", desc: "Fast & efficient" },
    ],
  },
];

export function OpenCodeSettingsContent() {
  const provider = useOpenCodeSettingsStore((s) => s.provider);
  const model = useOpenCodeSettingsStore((s) => s.model);
  const setProvider = useOpenCodeSettingsStore((s) => s.setProvider);
  const setModel = useOpenCodeSettingsStore((s) => s.setModel);

  const activeProvider = PROVIDERS.find((p) => p.id === provider);
  const models = activeProvider?.models || [];

  return (
    <>
      {/* Provider selection */}
      <div>
        <div className="px-2 py-1 font-medium text-muted-foreground text-[length:var(--font-chat-meta)]">
          Provider
        </div>
        {PROVIDERS.map((p) => (
          <DropdownMenuItem
            key={p.id}
            onSelect={(e) => e.preventDefault()}
            onClick={() => setProvider(p.id)}
          >
            <div className="min-w-0 flex-1">
              <div className="font-medium text-[length:var(--font-chat-meta)]">{p.name}</div>
              {p.desc && (
                <div className="truncate text-muted-foreground text-[length:var(--font-chat-meta)]">{p.desc}</div>
              )}
            </div>
            {provider === p.id && <CheckIcon className="size-3 shrink-0" />}
          </DropdownMenuItem>
        ))}
      </div>

      <DropdownMenuSeparator />

      {/* Model selection */}
      <div>
        <div className="px-2 py-1 font-medium text-muted-foreground text-[length:var(--font-chat-meta)]">
          Model
        </div>
        <DropdownMenuItem
          onSelect={(e) => e.preventDefault()}
          onClick={() => setModel(null)}
        >
          <div className="min-w-0 flex-1">
            <div className="font-medium text-[length:var(--font-chat-meta)]">Default</div>
            <div className="truncate text-muted-foreground text-[length:var(--font-chat-meta)]">
              Use provider default
            </div>
          </div>
          {model === null && <CheckIcon className="size-3 shrink-0" />}
        </DropdownMenuItem>
        {models.map((m) => (
          <DropdownMenuItem
            key={m.id}
            onSelect={(e) => e.preventDefault()}
            onClick={() => setModel(m.id)}
          >
            <div className="min-w-0 flex-1">
              <div className="font-medium text-[length:var(--font-chat-meta)]">{m.name}</div>
              {m.desc && (
                <div className="truncate text-muted-foreground text-[length:var(--font-chat-meta)]">{m.desc}</div>
              )}
            </div>
            {model === m.id && <CheckIcon className="size-3 shrink-0" />}
          </DropdownMenuItem>
        ))}
      </div>
    </>
  );
}

export function OpenCodeSettingsLabel() {
  const provider = useOpenCodeSettingsStore((s) => s.provider);
  const model = useOpenCodeSettingsStore((s) => s.model);

  const providerLabel = PROVIDERS.find((p) => p.id === provider)?.name || provider;
  const activeProvider = PROVIDERS.find((p) => p.id === provider);
  const modelLabel = activeProvider?.models?.find((m) => m.id === model)?.name || "Default";

  return (
    <span>
      {providerLabel}
      <span className="text-muted-foreground/40 mx-0.5">·</span>
      {modelLabel}
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd prism-next && git add src/renderer/components/modules/chat/agent-settings/opencode-settings.tsx
git commit -m "feat(opencode): create OpenCode settings UI (provider + model)

Replaces Claude settings (model/mode/effort) with OpenCode-appropriate
provider and model selection dropdowns. Supports Anthropic, OpenAI, Google
providers with associated model lists.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3.2: Update agent-settings-bar.tsx — remove registry

**Files:**
- Modify: `prism-next/src/renderer/components/modules/chat/agent-settings/agent-settings-bar.tsx`

- [ ] **Step 1: Simplify to single OpenCode settings**

Rewrite `prism-next/src/renderer/components/modules/chat/agent-settings/agent-settings-bar.tsx`:

```typescript
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SlidersHorizontalIcon } from "lucide-react";
import { OpenCodeSettingsContent, OpenCodeSettingsLabel } from "./opencode-settings";

export function AgentSettingsBar() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-0 @md:gap-1 rounded px-1.5 @md:px-2 py-1 text-muted-foreground text-[length:var(--font-chat-meta)] transition-colors hover:bg-accent hover:text-accent-foreground"
          title="Model settings"
        >
          <SlidersHorizontalIcon className="size-3.5 shrink-0 @md:hidden" />
          <span className="hidden @md:contents">
            <OpenCodeSettingsLabel />
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <OpenCodeSettingsContent />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd prism-next && git add src/renderer/components/modules/chat/agent-settings/agent-settings-bar.tsx
git commit -m "refactor(agent-settings): remove multi-agent registry, use OpenCode only

agent-settings-bar.tsx now directly renders OpenCodeSettingsContent/Label.
No registry dispatch — single agent is the design.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3.3: Update chat-composer.tsx — remove agent selector

**Files:**
- Modify: `prism-next/src/renderer/components/modules/chat/chat-composer.tsx`

- [ ] **Step 1: Remove agent selector references**

In `prism-next/src/renderer/components/modules/chat/chat-composer.tsx`:

Remove line 28: `import { AGENT_UI_CONFIGS } from "@/lib/agent-config";`
Remove line 30: `const AGENTS = Object.values(AGENT_UI_CONFIGS);`

Find and remove the agent selector dropdown section (search for `selectedAgent`, `setSelectedAgent`, `AGENTS.map`). The agent selector dropdown is a UI element in the chat composer toolbar — remove it entirely.

Replace any `agent` reference in the `cliSend`/`chatSend` call with the new format (already done in Task 2.3).

- [ ] **Step 2: Update any remaining agent name references**

Search for `"Claude"` as fallback name (around line 448) — change to `"OpenCode"`.

- [ ] **Step 3: Commit**

```bash
cd prism-next && git add src/renderer/components/modules/chat/chat-composer.tsx
git commit -m "refactor(chat-composer): remove agent selector dropdown

Single-agent design — no agent switching UI. Remove AGENT_UI_CONFIGS
import and agent selector dropdown. Change fallback name to OpenCode.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 4: Configuration Migration

### Task 4.1: Update agent-project-settings.tsx

**Files:**
- Modify: `prism-next/src/renderer/components/modules/settings/agent-project-settings.tsx`

- [ ] **Step 1: Replace CLAUDE.md references with AGENTS.md**

In `prism-next/src/renderer/components/modules/settings/agent-project-settings.tsx`:
- Line 19: `rules: "Rules (CLAUDE.md)"` → `rules: "Rules (AGENTS.md)"`
- Line 27: `claudeMdPreview` → `agentsMdPreview`
- Line 38-40: Replace `CLAUDE.md` with `AGENTS.md`
- Line 76-82: Replace `"Project Rules (CLAUDE.md)"` with `"Project Rules (AGENTS.md)"`, `"No CLAUDE.md found"` with `"No AGENTS.md found"`
- Line 87-95: Replace path `CLAUDE.md` with `AGENTS.md`, `/CLAUDE.md` with `/AGENTS.md`

- [ ] **Step 2: Remove context component toggles**

Remove the context component toggle UI (skills/MCP/rules/venv/PATH toggles). These were Claude-specific context assembly configurations. OpenCode manages plugins and MCP natively.

- [ ] **Step 3: Commit**

```bash
cd prism-next && git add src/renderer/components/modules/settings/agent-project-settings.tsx
git commit -m "refactor(settings): CLAUDE.md → AGENTS.md, remove context toggles

Rename all CLAUDE.md references to AGENTS.md. Remove context component
toggles (skills/MCP/rules/venv/path) — OpenCode manages these natively.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4.2: Update fs.ts — remove Claude config dir

**Files:**
- Modify: `prism-next/src/main/ipc/fs.ts`

- [ ] **Step 1: Remove hardcoded "claude" config dir creation**

Find line ~171 in `prism-next/src/main/ipc/fs.ts`:
```typescript
const agentConfigDir = join(prismDir, "agent-config", "claude");
```
Remove this line and any subsequent `mkdirSync(agentConfigDir, ...)` call.

Replace with a simpler approach — create the `.prismnext` directory only, without agent-config subdirectories.

- [ ] **Step 2: Commit**

```bash
cd prism-next && git add src/main/ipc/fs.ts
git commit -m "refactor(fs): remove hardcoded Claude config dir creation

Stop creating .prismnext/agent-config/claude/ on project init.
OpenCode manages its own configuration directories.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4.3: Update misc renderer files

**Files:**
- Modify: `prism-next/src/renderer/components/layout/left-main-area.tsx`
- Modify: `prism-next/src/renderer/components/modules/chat/error-boundary.tsx`

- [ ] **Step 1: Update left-main-area.tsx**

Line 79: Change comment `"so the first prompt doesn't wait 20 s for Claude Code startup."` → `"so the first prompt doesn't wait for agent startup."`

- [ ] **Step 2: Update error-boundary.tsx**

Line 25: `console.error("[ClaudeChat] Error boundary caught:", error, errorInfo)` → `console.error("[OpenCode] Error boundary caught:", error, errorInfo)`

- [ ] **Step 3: Commit**

```bash
cd prism-next && git add src/renderer/components/layout/left-main-area.tsx src/renderer/components/modules/chat/error-boundary.tsx
git commit -m "chore: update remaining Claude references in renderer components

left-main-area: Update comment about agent startup time.
error-boundary: Rename error tag from ClaudeChat to OpenCode.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 5: Build & Packaging

### Task 5.1: Create binary download script

**Files:**
- Create: `prism-next/scripts/download-opencode.sh`

- [ ] **Step 1: Write download script**

Write `prism-next/scripts/download-opencode.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Download OpenCode binary for the current platform.
# Usage: ./scripts/download-opencode.sh [version]
# Default version: latest

VERSION="${1:-latest}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BINARIES_DIR="$SCRIPT_DIR/../binaries/opencode"

# Detect platform
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin)
    PLATFORM="darwin"
    ;;
  Linux)
    PLATFORM="linux"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    PLATFORM="windows"
    ;;
  *)
    echo "Unsupported OS: $OS"
    exit 1
    ;;
esac

case "$ARCH" in
  arm64|aarch64)
    ARCH="arm64"
    ;;
  x86_64|amd64)
    ARCH="amd64"
    ;;
  *)
    echo "Unsupported arch: $ARCH"
    exit 1
    ;;
esac

TARGET_DIR="$BINARIES_DIR/$PLATFORM-$ARCH"
mkdir -p "$TARGET_DIR"

BINARY_NAME="opencode"
if [ "$PLATFORM" = "windows" ]; then
  BINARY_NAME="opencode.exe"
fi

echo "Downloading OpenCode ${VERSION} for ${PLATFORM}/${ARCH}..."

# GitHub releases URL pattern (adjust to actual OpenCode release URL)
RELEASE_URL="https://github.com/sst/opencode/releases"
if [ "$VERSION" = "latest" ]; then
  DOWNLOAD_URL="${RELEASE_URL}/latest/download/opencode-${PLATFORM}-${ARCH}.tar.gz"
else
  DOWNLOAD_URL="${RELEASE_URL}/download/${VERSION}/opencode-${PLATFORM}-${ARCH}.tar.gz"
fi

TEMP_DIR="$(mktemp -d)"
curl -fsSL "$DOWNLOAD_URL" -o "$TEMP_DIR/opencode.tar.gz" || {
  echo "ERROR: Failed to download OpenCode binary."
  echo "URL: $DOWNLOAD_URL"
  echo ""
  echo "Please manually download the OpenCode binary from:"
  echo "  $RELEASE_URL"
  echo ""
  echo "And place it at: $TARGET_DIR/$BINARY_NAME"
  rm -rf "$TEMP_DIR"
  exit 1
}

tar -xzf "$TEMP_DIR/opencode.tar.gz" -C "$TARGET_DIR" || {
  # Some releases may not be tar.gz — try direct binary
  mv "$TEMP_DIR/opencode.tar.gz" "$TARGET_DIR/$BINARY_NAME"
}
chmod +x "$TARGET_DIR/$BINARY_NAME" 2>/dev/null || true
rm -rf "$TEMP_DIR"

echo "OpenCode binary installed to $TARGET_DIR/$BINARY_NAME"
```

- [ ] **Step 2: Make script executable**

Run: `chmod +x prism-next/scripts/download-opencode.sh`

- [ ] **Step 3: Commit**

```bash
cd prism-next && git add scripts/download-opencode.sh
git commit -m "feat(build): add OpenCode binary download script

Downloads the OpenCode Go binary for the current platform and architecture.
Supports macOS (arm64/amd64), Linux (arm64/amd64), Windows (amd64).
Falls back with manual download instructions if curl fails.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5.2: Configure electron-builder for binary bundling

**Files:**
- Check if `prism-next/electron-builder.yml` exists; if not, configure in `prism-next/package.json`

- [ ] **Step 1: Check current build config**

Run: `ls prism-next/electron-builder.yml 2>/dev/null || echo "Not found"`

- [ ] **Step 2: Add extraResources config**

If `electron-builder.yml` exists, add to it:
```yaml
extraResources:
  - from: "binaries/opencode/${os}/"
    to: "opencode"
    filter:
      - "opencode*"
```

If using `package.json` build field, add:
```jsonc
"build": {
  "extraResources": [
    {
      "from": "binaries/opencode/${os}/",
      "to": "opencode",
      "filter": ["opencode*"]
    }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
cd prism-next && git add electron-builder.yml  # or package.json
git commit -m "feat(build): configure electron-builder to bundle OpenCode binary

Add extraResources config to include OpenCode binary in packaged app.
Binary resolved at runtime via process.resourcesPath/opencode/.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 6: Cleanup — Delete All Claude/ACP Code

### Task 6.1: Delete main process Claude/ACP files

**Files to delete:**
```
prism-next/src/main/agents/claude/          (entire directory)
prism-next/src/main/agents/gemini/          (entire directory)
prism-next/src/main/agents/qoder/           (entire directory)
prism-next/src/main/agents/opencode/        (old placeholder — NOT the new opencode/)
prism-next/src/main/agents/registry.ts
prism-next/src/main/agents/types.ts
prism-next/src/main/agents/context-calculator.ts
prism-next/src/main/agents/tokenizer.ts
prism-next/src/main/cli/cli-manager.ts
prism-next/src/main/cli/context-resolver.ts
prism-next/src/main/cli/types.ts
prism-next/src/main/cli/app-shell.ts
prism-next/src/main/ipc/cli.ts
```

- [ ] **Step 1: Delete files**

```bash
cd prism-next

# Agent directories
rm -rf src/main/agents/claude
rm -rf src/main/agents/gemini
rm -rf src/main/agents/qoder
rm -rf src/main/agents/opencode  # Old placeholder (the NEW opencode/ is in src/main/opencode/)

# Agent infrastructure
rm src/main/agents/registry.ts
rm src/main/agents/types.ts
rm src/main/agents/context-calculator.ts
rm src/main/agents/tokenizer.ts

# CLI layer (replaced by opencode/)
rm src/main/cli/cli-manager.ts
rm src/main/cli/context-resolver.ts
rm src/main/cli/types.ts
rm src/main/cli/app-shell.ts

# IPC
rm src/main/ipc/cli.ts
```

- [ ] **Step 2: Update agents/index.ts barrel**

Since we deleted the agent files, `prism-next/src/main/agents/index.ts` needs to be empty or export only what's still valid. Since the entire registry/types structure is gone, simplify it:

```typescript
// Agent module — now using OpenCode SDK directly.
// See src/main/opencode/service.ts for the OpencodeService singleton.
// See src/main/opencode/event-bridge.ts for SSE → IPC event routing.
```

- [ ] **Step 3: Verify no broken imports**

Run: `cd prism-next && npx tsc --noEmit 2>&1 | head -50`
Expected: Import errors for deleted files. We'll fix these in the next task.

- [ ] **Step 4: Commit**

```bash
cd prism-next && git add -A src/main/
git commit -m "refactor: delete all Claude/ACP main process code

Remove:
- agents/claude/ (config, parser, sessions, calculator)
- agents/opencode/ (old placeholder)
- agents/gemini/, agents/qoder/ (placeholders)
- agents/registry.ts, types.ts, context-calculator.ts, tokenizer.ts
- cli/cli-manager.ts, context-resolver.ts, types.ts, app-shell.ts
- ipc/cli.ts

All replaced by src/main/opencode/ (service.ts, event-bridge.ts) and
src/main/ipc/chat.ts.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6.2: Delete renderer Claude/ACP files

**Files to delete:**
```
prism-next/src/renderer/stores/agent-settings-store.ts
prism-next/src/renderer/lib/agent-config.ts
prism-next/src/renderer/lib/system-prompt-cleaner.ts
prism-next/src/renderer/hooks/use-cli-events.ts
prism-next/src/renderer/components/modules/chat/agent-settings/claude-settings.tsx
prism-next/src/renderer/components/modules/chat/agent-settings/gemini-settings.tsx
prism-next/src/renderer/components/modules/chat/agent-settings/qoder-settings.tsx
```

- [ ] **Step 1: Delete files**

```bash
cd prism-next

rm src/renderer/stores/agent-settings-store.ts
rm src/renderer/lib/agent-config.ts
rm src/renderer/lib/system-prompt-cleaner.ts
rm src/renderer/hooks/use-cli-events.ts
rm src/renderer/components/modules/chat/agent-settings/claude-settings.tsx
rm src/renderer/components/modules/chat/agent-settings/gemini-settings.tsx
rm src/renderer/components/modules/chat/agent-settings/qoder-settings.tsx
```

- [ ] **Step 2: Fix remaining imports in renderer files**

Check and fix imports in these files:
- `chat-messages.tsx` — may import `system-prompt-cleaner`, remove if so
- `context-window-indicator.tsx` — may import from `agent-config`, update to new config
- Any other file importing from deleted modules

Run: `cd prism-next && npx tsc --noEmit 2>&1 | head -80`

For each import error, update the import to point to the new OpenCode equivalents.

- [ ] **Step 3: Commit**

```bash
cd prism-next && git add -A src/renderer/
git commit -m "refactor: delete all Claude/ACP renderer files

Remove:
- agent-settings-store.ts → replaced by opencode-settings-store.ts
- agent-config.ts → replaced by opencode-config.ts
- system-prompt-cleaner.ts → no longer needed (SSE, not Claude NDJSON)
- use-cli-events.ts → replaced by use-opencode-events.ts
- claude-settings.tsx, gemini-settings.tsx, qoder-settings.tsx

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6.3: Clean up remaining references

**Files:**
- Modify: `prism-next/src/main/ipc/settings.ts`
- Modify: `prism-next/src/renderer/styles/tokens/chat.css`

- [ ] **Step 1: Remove Claude-specific settings IPC handlers**

In `prism-next/src/main/ipc/settings.ts`:
- Remove `settings:getDefaultAgentPrompt` handler (if it references `APP_SYSTEM_PROMPT` from the deleted `app-shell.ts`)
- Remove `settings:getAgentProjectConfig` / `settings:setAgentProjectConfig` handlers (if they reference deleted agent config paths)

- [ ] **Step 2: Update CSS comment**

In `prism-next/src/renderer/styles/tokens/chat.css`, line 2:
`/* Claude chat: messages, composer, sessions, tool widgets */` → `/* OpenCode chat: messages, composer, sessions, tool widgets */`

- [ ] **Step 3: Final TypeScript check**

Run: `cd prism-next && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd prism-next && git add -A .
git commit -m "chore: final cleanup of Claude references

Remove Claude-specific IPC handlers from settings.ts.
Update CSS comment. Clean up remaining stale references.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verification Checklist

After all phases complete, verify:

- [ ] `cd prism-next && npx tsc --noEmit` passes with no errors
- [ ] `cd prism-next && pnpm dev` starts without errors
- [ ] No `claude`, `CLAUDE`, `Claude`, `ACP`, `@agentclientprotocol` strings in prism-next/src/ (run `grep -r "claude\|CLAUDE\|@agentclientprotocol" prism-next/src/ --include="*.ts" --include="*.tsx"`)
- [ ] `pnpm build` succeeds
- [ ] OpenCode binary is downloadable via `scripts/download-opencode.sh`
- [ ] Chat functionality works end-to-end (send prompt → receive stream → display messages)
- [ ] Session list in LeftSidebar shows sessions from OpenCode
- [ ] Session load/delete works
- [ ] Settings page shows OpenCode provider/model options
- [ ] Proposed Changes panel works (file edits from OpenCode tools)
- [ ] Worktree mode works (should be unaffected)
