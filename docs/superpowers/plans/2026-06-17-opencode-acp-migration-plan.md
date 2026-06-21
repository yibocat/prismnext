# OpenCode ACP Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace HTTP+SSE (`@opencode-ai/sdk`) with ACP (`opencode acp` + `@agentclientprotocol/sdk`) — renderer and IPC interface zero-change.

**Architecture:** Main process spawns `opencode acp` as a persistent child process. `@agentclientprotocol/sdk` provides `ClientSideConnection` for JSON-RPC 2.0 over stdio. `AcpService` singleton manages lifecycle + session operations. `EventMapper` routes ACP notifications to IPC channels. IPC interface (`chat:*`, `session:*`) and all renderer code remain unchanged.

**Tech Stack:** Electron 35, TypeScript strict, `@agentclientprotocol/sdk`, `child_process.spawn`

**Spec:** [2026-06-17-opencode-acp-migration-design.md](../specs/2026-06-17-opencode-acp-migration-design.md)

## Global Constraints

- Renderer zero-change: `src/preload/index.ts`, `src/renderer/**` — no edits
- IPC channel names and payload shapes preserved exactly
- Reuse `@agentclientprotocol/sdk` for JSON-RPC transport; do not implement JSON-RPC framing from scratch
- Single OpenCode agent; no multi-agent infrastructure
- OpenCode binary discovery logic preserved from current `OpencodeService.resolveBinaryDir()`

---

## File Structure

### Files to CREATE:
```
prism-next/src/main/acp/
├── service.ts           # AcpService singleton — process lifecycle, session, prompt
└── event-mapper.ts      # ACP notification → IPC event routing
```

### Files to MODIFY:
```
prism-next/package.json                       # @opencode-ai/sdk → @agentclientprotocol/sdk
prism-next/pnpm-lock.yaml                     # regenerated
prism-next/src/main/ipc/chat.ts               # import paths switch
```

### Files to DELETE:
```
prism-next/src/main/opencode/                 # entire directory (replaced by acp/)
```

### Files UNCHANGED:
```
prism-next/src/main/index.ts
prism-next/src/main/ipc/index.ts
prism-next/src/main/ipc/fs.ts
prism-next/src/main/ipc/settings.ts
prism-next/src/main/agents/index.ts
prism-next/src/preload/index.ts
prism-next/src/renderer/**                    # all files
prism-next/src/main/services/**               # all services
prism-next/scripts/download-opencode.sh
prism-next/electron-builder.yml
```

---

### Task 1: Swap Dependencies

**Files:**
- Modify: `prism-next/package.json:53`
- Run: `cd prism-next && pnpm install`

- [ ] **Step 1: Replace @opencode-ai/sdk with @agentclientprotocol/sdk**

Edit `prism-next/package.json` line 53:
```diff
-    "@opencode-ai/sdk": "^1.0.0",
+    "@agentclientprotocol/sdk": "^0.22.1",
```

- [ ] **Step 2: Install and regenerate lockfile**

Run:
```bash
cd prism-next && pnpm install
```
Expected: `@agentclientprotocol/sdk` installed, `@opencode-ai/sdk` removed, lockfile updated.

- [ ] **Step 3: Commit**

```bash
cd prism-next && git add package.json pnpm-lock.yaml
git commit -m "chore: replace @opencode-ai/sdk with @agentclientprotocol/sdk

Switch from HTTP+SSE to ACP transport layer. @agentclientprotocol/sdk
provides JSON-RPC 2.0 over stdio — the foundation for the ACP integration.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Create AcpService — Process Lifecycle + Session + Prompt

**Files:**
- Create: `prism-next/src/main/acp/service.ts`

**Interfaces:**
- Produces: `AcpService.getInstance()`, `AcpService.initialize(projectPath)`, `AcpService.shutdown()`, `AcpService.healthCheck()`, `AcpService.createSession()`, `AcpService.listSessions()`, `AcpService.getMessages()`, `AcpService.deleteSession()`, `AcpService.sendPrompt()`, `AcpService.sendAnswer()`, `AcpService.abort()`, `AcpService.getProviders()`, `AcpService.setAuth()`, `AcpService.onNotification()`, `AcpService.getProjectPath()`, `AcpService.isBinaryAvailable()`

- [ ] **Step 1: Create the AcpService class**

Write `prism-next/src/main/acp/service.ts`:

```typescript
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { app } from "electron";
import { ClientSideConnection } from "@agentclientprotocol/sdk";
import { createLogger } from "../services/logger";

const log = createLogger("acp-service", "agent");

export interface SessionInfo {
  id: string;
  title: string;
  lastModified: number;
  createdAt: number;
}

/**
 * AcpService — singleton managing the OpenCode ACP subprocess.
 *
 * Spawns `opencode acp` as a persistent child process. Communicates via
 * JSON-RPC 2.0 over stdio using @agentclientprotocol/sdk's ClientSideConnection.
 * All session/chat/config methods delegate to ACP JSON-RPC methods.
 */
export class AcpService {
  private static instance: AcpService;
  private conn: ClientSideConnection | null = null;
  private proc: ChildProcess | null = null;
  private projectPath: string = "";
  private notificationHandlers: Array<(method: string, params: any) => void> = [];

  static getInstance(): AcpService {
    if (!AcpService.instance) {
      AcpService.instance = new AcpService();
    }
    return AcpService.instance;
  }

  getConnection(): ClientSideConnection | null {
    return this.conn;
  }

  getProjectPath(): string {
    return this.projectPath;
  }

  // ─── Lifecycle ──────────────────────────────────────────────

  async initialize(projectPath: string): Promise<void> {
    // Idempotent: same project, already alive
    if (this.conn && this.proc && this.projectPath === projectPath) {
      try {
        // Quick liveness check — will throw if connection is dead
        await this.conn.request("ping", {});
        return;
      } catch {
        // Dead — fall through to restart
        await this.shutdown();
      }
    }

    await this.shutdown();
    this.projectPath = projectPath;

    const binaryDir = this.resolveBinaryDir();
    if (binaryDir) {
      process.env.PATH = `${binaryDir}:${process.env.PATH}`;
    }

    log.info(`Spawning opencode acp (cwd: ${projectPath})`);

    this.proc = spawn("opencode", ["acp"], {
      cwd: projectPath,
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Pipe stderr through for debugging
    if (this.proc.stderr) {
      let stderrBuf = "";
      this.proc.stderr.on("data", (chunk: Buffer) => {
        stderrBuf += chunk.toString();
        if (stderrBuf.includes("\n")) {
          log.debug(`[opencode stderr] ${stderrBuf.trim()}`);
          stderrBuf = "";
        }
      });
    }

    this.conn = new ClientSideConnection(
      this.proc.stdin!,
      this.proc.stdout!,
    );

    // Forward all incoming notifications to registered handlers
    this.conn.onNotification((method: string, params: any) => {
      this.emitNotification(method, params);
    });

    // Handle unexpected process exit
    this.proc.on("exit", (code, signal) => {
      log.info(`OpenCode process exited (code=${code}, signal=${signal})`);
      if (code !== 0 && this.conn) {
        log.warn("OpenCode exited unexpectedly — will restart on next use");
      }
      this.conn = null;
      this.proc = null;
    });

    // ACP initialize handshake
    try {
      const result = await this.conn.request("initialize", {
        capabilities: {},
      });
      log.info(`OpenCode ACP initialized: ${JSON.stringify(result).slice(0, 200)}`);
    } catch (err: any) {
      log.error(`ACP initialize failed: ${err.message}`);
      await this.shutdown();
      throw new Error(`OpenCode ACP handshake failed: ${err.message}`);
    }
  }

  async shutdown(): Promise<void> {
    if (this.conn && this.proc) {
      log.info("Shutting down OpenCode ACP connection");
      try {
        // Graceful exit
        this.conn.sendNotification("exit", {});
      } catch {}

      // Force kill after timeout
      const proc = this.proc;
      setTimeout(() => {
        try { proc.kill("SIGTERM"); } catch {}
      }, 3000);
      setTimeout(() => {
        try { proc.kill("SIGKILL"); } catch {}
      }, 5000);
    }

    this.conn = null;
    this.proc = null;
  }

  async healthCheck(): Promise<{ healthy: boolean; version: string }> {
    if (!this.conn) return { healthy: false, version: "" };
    try {
      const result = await this.conn.request("ping", {});
      return {
        healthy: true,
        version: result?.version || "unknown",
      };
    } catch {
      return { healthy: false, version: "" };
    }
  }

  // ─── Session Management ─────────────────────────────────────

  async createSession(title?: string): Promise<SessionInfo> {
    if (!this.conn) throw new Error("AcpService not initialized");

    const result = await this.conn.request("session/new", {
      cwd: this.projectPath,
      ...(title ? { title } : {}),
    });

    const sessionId = result?.sessionId || result?.id;
    if (!sessionId) throw new Error("session/new did not return a sessionId");

    return {
      id: sessionId,
      title: title || "New Chat",
      lastModified: Date.now(),
      createdAt: Date.now(),
    };
  }

  async listSessions(): Promise<SessionInfo[]> {
    // session/list is not a standard ACP method.
    // Read OpenCode's session storage directory directly.
    const os = await import("node:os");
    const fs = await import("node:fs");
    const path = await import("node:path");

    const storageDir = path.join(
      os.homedir(),
      ".local",
      "share",
      "opencode",
      "storage",
      "sessions",
    );

    try {
      if (!fs.existsSync(storageDir)) return [];
      const entries = fs.readdirSync(storageDir, { withFileTypes: true });
      return entries
        .filter((e) => e.isDirectory())
        .map((e) => {
          const stat = fs.statSync(path.join(storageDir, e.name));
          return {
            id: e.name,
            title: e.name, // OpenCode session dirs are named by session ID
            lastModified: stat.mtimeMs,
            createdAt: stat.birthtimeMs,
          };
        })
        .sort((a, b) => b.lastModified - a.lastModified);
    } catch {
      return [];
    }
  }

  async getMessages(sessionId: string): Promise<any[]> {
    if (!this.conn) throw new Error("AcpService not initialized");

    // session/load replays message history via session/update notifications,
    // then returns a final response when replay is complete.
    const messages: any[] = [];
    const collect = (method: string, params: any) => {
      if (method === "session/update" && params?.sessionId === sessionId) {
        messages.push(params.update || params);
      }
    };
    this.notificationHandlers.push(collect);

    try {
      await this.conn.request("session/load", {
        sessionId,
        cwd: this.projectPath,
      });
    } finally {
      const idx = this.notificationHandlers.indexOf(collect);
      if (idx !== -1) this.notificationHandlers.splice(idx, 1);
    }

    return messages;
  }

  async deleteSession(sessionId: string): Promise<void> {
    // No standard ACP method for deletion. Remove from OpenCode's storage.
    const os = await import("node:os");
    const fs = await import("node:fs");
    const path = await import("node:path");

    const sessionDir = path.join(
      os.homedir(),
      ".local",
      "share",
      "opencode",
      "storage",
      "sessions",
      sessionId,
    );

    try {
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }
    } catch (err: any) {
      log.error(`Failed to delete session ${sessionId}: ${err.message}`);
    }
  }

  // ─── Chat ───────────────────────────────────────────────────

  async sendPrompt(
    sessionId: string,
    prompt: string,
    opts?: { model?: string; provider?: string; systemPrompt?: string },
  ): Promise<void> {
    if (!this.conn) throw new Error("AcpService not initialized");

    const parts: any[] = [];

    if (opts?.systemPrompt) {
      parts.push({ type: "text", text: opts.systemPrompt });
    }

    parts.push({ type: "text", text: prompt });

    const params: any = {
      sessionId,
      parts,
    };

    if (opts?.model) {
      params.model = opts.model.includes("/")
        ? opts.model
        : `${opts.provider || "anthropic"}/${opts.model}`;
    }

    // session/prompt is fire-and-forget — results stream via
    // session/update notifications handled by EventMapper
    await this.conn.request("session/prompt", params);
  }

  async sendAnswer(sessionId: string, answer: string): Promise<void> {
    // Reuse prompt channel for answering tool questions
    await this.sendPrompt(sessionId, answer);
  }

  async abort(sessionId: string): Promise<void> {
    if (!this.conn) return;

    try {
      this.conn.sendNotification("session/cancel", { sessionId });
    } catch (err: any) {
      log.error(`Failed to abort session ${sessionId}: ${err.message}`);
    }
  }

  // ─── Config ─────────────────────────────────────────────────

  async getProviders(): Promise<any[]> {
    if (!this.conn) return [];
    try {
      const result = await this.conn.request("config/providers", {});
      return result?.providers || result || [];
    } catch {
      return [];
    }
  }

  async setAuth(provider: string, credentials: Record<string, string>): Promise<void> {
    if (!this.conn) throw new Error("AcpService not initialized");

    // Set auth via config method — the exact ACP method may vary
    try {
      await this.conn.request("config/setAuth", {
        provider,
        credentials,
      });
    } catch (err: any) {
      log.error(`Failed to set auth for ${provider}: ${err.message}`);
    }
  }

  // ─── Notification Subsystem ────────────────────────────────

  onNotification(handler: (method: string, params: any) => void): () => void {
    this.notificationHandlers.push(handler);
    return () => {
      const idx = this.notificationHandlers.indexOf(handler);
      if (idx !== -1) this.notificationHandlers.splice(idx, 1);
    };
  }

  private emitNotification(method: string, params: any): void {
    for (const handler of this.notificationHandlers) {
      try { handler(method, params); } catch {}
    }
  }

  // ─── Binary Discovery ───────────────────────────────────────

  isBinaryAvailable(): boolean {
    const binaryDir = this.resolveBinaryDir();
    if (binaryDir) {
      const binName = process.platform === "win32" ? "opencode.exe" : "opencode";
      if (existsSync(join(binaryDir, binName))) return true;
    }
    try {
      execSync("which opencode", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }

  private resolveBinaryDir(): string | null {
    if (app.isPackaged) {
      return join(process.resourcesPath, "opencode");
    }
    const platform = process.platform;
    const arch = process.arch;
    let platformDir: string;
    if (platform === "darwin") platformDir = "darwin";
    else if (platform === "linux") platformDir = "linux";
    else if (platform === "win32") platformDir = "windows";
    else return null;
    let archDir: string;
    if (arch === "arm64") archDir = "arm64";
    else if (arch === "x64") archDir = "amd64";
    else return null;
    return join(app.getAppPath(), "binaries", "opencode", `${platformDir}-${archDir}`);
  }
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run:
```bash
cd prism-next && npx tsc --noEmit 2>&1 | head -20
```
Expected: may have errors from deleted `opencode/` directory (Task 5 will resolve).

- [ ] **Step 3: Commit**

```bash
cd prism-next && git add src/main/acp/service.ts
git commit -m "feat(acp): create AcpService for OpenCode ACP integration

Singleton managing opencode acp child process lifecycle via
@agentclientprotocol/sdk's ClientSideConnection. JSON-RPC 2.0 over stdio.
Session CRUD delegates to session/new, session/load, and filesystem storage.
sendPrompt uses session/prompt (fire-and-forget, results via notifications).
Binary discovery preserved from previous OpencodeService.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Create EventMapper — ACP Notification → IPC Routing

**Files:**
- Create: `prism-next/src/main/acp/event-mapper.ts`

**Interfaces:**
- Consumes: `AcpService.getInstance()`, `acpService.onNotification(handler)`
- Produces: `new EventMapper(win)`, `mapper.registerSession(sessionId, tabId)`, `mapper.unregisterSession(sessionId)`, `mapper.start()`, `mapper.stop()`

- [ ] **Step 1: Write EventMapper class**

Write `prism-next/src/main/acp/event-mapper.ts`:

```typescript
import type { BrowserWindow } from "electron";
import { AcpService } from "./service";
import { createLogger } from "../services/logger";

const log = createLogger("event-mapper", "agent");

/**
 * Routes ACP JSON-RPC notifications to Electron IPC channels.
 *
 * Registered on AcpService.onNotification. Maintains a sessionId → tabId
 * mapping so events for different chat tabs are routed to the correct
 * renderer tab. IPC event formats are identical to the previous
 * EventBridge, ensuring zero renderer changes.
 */
export class EventMapper {
  private win: BrowserWindow;
  private sessionToTab = new Map<string, string>();
  private unregisterNotification: (() => void) | null = null;

  constructor(win: BrowserWindow) {
    this.win = win;
  }

  registerSession(sessionId: string, tabId: string): void {
    this.sessionToTab.set(sessionId, tabId);
  }

  unregisterSession(sessionId: string): void {
    this.sessionToTab.delete(sessionId);
  }

  start(): void {
    if (this.unregisterNotification) return;

    const service = AcpService.getInstance();
    this.unregisterNotification = service.onNotification((method, params) => {
      this.handleNotification(method, params);
    });

    log.info("EventMapper started — listening for ACP notifications");
  }

  stop(): void {
    if (this.unregisterNotification) {
      this.unregisterNotification();
      this.unregisterNotification = null;
    }
  }

  // ─── Internal ──────────────────────────────────────────────

  private handleNotification(method: string, params: any): void {
    const sessionId = this.extractSessionId(method, params);
    const tabId = sessionId ? this.sessionToTab.get(sessionId) : undefined;

    if (!tabId) return; // Not our session — ignore

    switch (method) {
      case "session/update":
        this.mapSessionUpdate(tabId, sessionId!, params);
        break;

      case "session/status":
        this.mapSessionStatus(tabId, sessionId!, params);
        break;

      case "session/todo":
        this.win.webContents.send("chat:stream", {
          tabId,
          type: "todo.updated",
          data: params,
        });
        break;

      case "session/permission":
        this.win.webContents.send("chat:permission", {
          tabId,
          permissionId: params.id || params.permissionId,
          message: params.message || params.title || "",
          options: params.options || {},
        });
        break;

      default:
        // Unknown notification — skip
        break;
    }
  }

  private extractSessionId(method: string, params: any): string | undefined {
    // Standard ACP: sessionId is in params
    if (params?.sessionId) return params.sessionId;
    if (params?.session?.id) return params.session.id;
    if (params?.info?.id) return params.info.id;
    return undefined;
  }

  private mapSessionUpdate(tabId: string, sessionId: string, params: any): void {
    const update = params.update || params;

    // Determine the event type from the update shape
    if (update.type === "text" || update.type === "reasoning" || update.type === "thinking") {
      // Text / reasoning delta — streaming content
      this.win.webContents.send("chat:stream", {
        tabId,
        type: "message.part.updated",
        data: {
          part: {
            type: update.type,
            text: update.text || update.content || "",
            thinking: update.thinking || "",
          },
          delta: update.text || update.delta || "",
        },
      });
    } else if (update.type === "tool" || update.type === "tool_use") {
      // Tool call started/updated
      this.win.webContents.send("chat:stream", {
        tabId,
        type: "message.part.updated",
        data: {
          part: {
            type: "tool",
            id: update.id || update.toolId,
            name: update.name || update.tool?.name || "",
            input: update.input || update.tool?.input || {},
            state: update.state || {},
          },
        },
      });
    } else if (update.type === "tool_result" || update.type === "tool-result") {
      // Tool execution result
      this.win.webContents.send("chat:stream", {
        tabId,
        type: "message.updated",
        data: {
          message: {
            content: [{
              type: "tool_result",
              tool_use_id: update.tool_use_id || update.toolUseId || update.id,
              content: update.content || update.result || "",
              is_error: update.isError || update.is_error || false,
            }],
          },
        },
      });
    } else {
      // Generic update — forward as stream event
      this.win.webContents.send("chat:stream", {
        tabId,
        type: "message.part.updated",
        data: { part: update },
      });
    }
  }

  private mapSessionStatus(tabId: string, sessionId: string, params: any): void {
    const status = typeof params.status === "string"
      ? params.status
      : params.status?.type || String(params.status);

    log.info(`session.status: ${status} (sessionId=${sessionId})`);

    switch (status) {
      case "completed":
        this.win.webContents.send("chat:complete", {
          tabId,
          sessionId,
          success: true,
          tokenUsage: params.usage || null,
        });
        break;

      case "error":
        this.win.webContents.send("chat:complete", {
          tabId,
          sessionId,
          success: false,
          error: params.error || String(params.status),
        });
        break;

      case "idle":
        // Agent finished its turn and is waiting
        this.win.webContents.send("chat:complete", {
          tabId,
          sessionId,
          success: true,
        });
        break;

      default:
        // running, aborted — forward as stream event for status tracking
        this.win.webContents.send("chat:stream", {
          tabId,
          type: "session.status",
          data: { status, ...params },
        });
        break;
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd prism-next && git add src/main/acp/event-mapper.ts
git commit -m "feat(acp): create EventMapper for ACP notification → IPC routing

Routes ACP JSON-RPC notifications (session/update, session/status,
session/todo, session/permission) to Electron IPC channels. Maintains
sessionId→tabId mapping for multi-tab support. IPC event format is
byte-identical to the previous EventBridge — zero renderer changes.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Update IPC Handlers — Switch Imports

**Files:**
- Modify: `prism-next/src/main/ipc/chat.ts`

**Interfaces:**
- Consumes: `AcpService.getInstance()`, `new EventMapper(win)`
- Produces: `registerChatHandlers()`, `disposeChat()` — signatures unchanged

- [ ] **Step 1: Update import paths and type references**

Edit `prism-next/src/main/ipc/chat.ts`. Three changes:

**Change 1: Lines 2-3 — imports**
```diff
-import { OpencodeService } from "../opencode/service";
-import { EventBridge } from "../opencode/event-bridge";
+import { AcpService } from "../acp/service";
+import { EventMapper } from "../acp/event-mapper";
```

**Change 2: Lines 6-8 — service getter**
```diff
-let eventBridge: EventBridge | null = null;
+let eventMapper: EventMapper | null = null;

-function getService(): OpencodeService {
-  return OpencodeService.getInstance();
+function getService(): AcpService {
+  return AcpService.getInstance();
 }
```

**Change 3: Lines 14-19 — bridge getter + all internal references**
```diff
-function getBridge(win: BrowserWindow): EventBridge {
-  if (!eventBridge) {
-    eventBridge = new EventBridge(win);
+function getMapper(win: BrowserWindow): EventMapper {
+  if (!eventMapper) {
+    eventMapper = new EventMapper(win);
   }
-  return eventBridge;
+  return eventMapper;
 }
```

Then replace all remaining references in the file:
- `eventBridge` → `eventMapper`
- `getBridge(` → `getMapper(`

The rest of the file (all IPC handler logic, channel names, payload shapes) stays exactly the same.

- [ ] **Step 2: Verify no remaining references to old opencode/ directory**

Run:
```bash
grep -r "opencode/service\|opencode/event-bridge\|OpencodeService\|EventBridge" prism-next/src/main/ipc/chat.ts
```
Expected: no output (all references replaced).

- [ ] **Step 3: Commit**

```bash
cd prism-next && git add src/main/ipc/chat.ts
git commit -m "refactor(ipc): switch chat handlers from OpencodeService to AcpService

Import paths: opencode/ → acp/. EventBridge → EventMapper.
All IPC handler logic, channel names, and payload shapes unchanged.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Cleanup — Remove Old opencode/ Directory

**Files:**
- Delete: `prism-next/src/main/opencode/` (entire directory)

- [ ] **Step 1: Delete old HTTP+SSE code**

```bash
rm -rf prism-next/src/main/opencode
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

Run:
```bash
cd prism-next && npx tsc --noEmit 2>&1
```
Expected: no errors. If there are errors about missing imports from `opencode/`, fix them (should only be `chat.ts` which was updated in Task 4).

- [ ] **Step 3: Verify no stale references**

Run:
```bash
grep -r "opencode/service\|opencode/event-bridge\|@opencode-ai/sdk" prism-next/src/ --include="*.ts" --include="*.tsx"
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd prism-next && git add -A src/main/opencode/
git commit -m "refactor: remove old opencode/ directory (replaced by acp/)

HTTP+SSE OpencodeService and EventBridge replaced by ACP-based
AcpService and EventMapper in src/main/acp/.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Final Verification

- [ ] **Step 1: Full TypeScript check**

```bash
cd prism-next && npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 2: Build check**

```bash
cd prism-next && pnpm build
```
Expected: build succeeds.

- [ ] **Step 3: Verify no legacy agent references remain**

```bash
grep -r "claude\|CLAUDE\|@agentclientprotocol/claude\|ClaudeCode\|claude-api\|NDJSON\|stream-json" prism-next/src/main/ --include="*.ts" | grep -v "node_modules" | grep -v ".git"
```
Expected: no output.

- [ ] **Step 4: Commit any remaining changes**

```bash
cd prism-next && git add -A .
git commit -m "chore: final verification — clean build, no legacy references

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verification Checklist

After all tasks complete, verify:

- [ ] `cd prism-next && npx tsc --noEmit` passes with no errors
- [ ] `cd prism-next && pnpm build` succeeds
- [ ] `grep -r "@opencode-ai/sdk" prism-next/src/` returns nothing
- [ ] `grep -r "opencode/service\|opencode/event-bridge" prism-next/src/` returns nothing
- [ ] `grep -r "from.*opencode" prism-next/src/main/ipc/chat.ts` shows `from "../acp/service"` and `from "../acp/event-mapper"`
- [ ] IPC channel names unchanged: `chat:send`, `chat:stream`, `chat:complete`, `chat:permission`, `chat:sessionCreated`, `chat:cancel`, `chat:status`, `session:list`, `session:load`, `session:delete`
- [ ] `src/preload/index.ts` unchanged
- [ ] `src/renderer/` — all files unchanged
- [ ] OpenCode binary available: run `opencode --version`
