# OpenCode ACP Migration Design

**Date:** 2026-06-17
**Status:** Spec
**Scope:** prism-next — 将 Agent 通信从 HTTP+SSE（`@opencode-ai/sdk`）替换为 ACP 协议（`opencode acp` + `@agentclientprotocol/sdk`）

---

## 1. Motivation

### 为什么放弃 HTTP+SSE（当前 `@opencode-ai/sdk` 方案）

1. **流式输出不可靠**：SSE over HTTP 在 Electron/Node.js 下有缓冲、断连、重连问题，实际使用中流式效果一直无法达到预期
2. **架构不自然**：在 Electron main process 里启动 HTTP server、管理端口、做 health check——这些是 Web 服务端的模式，不是桌面应用的
3. **链路过长**：`promptAsync()` → HTTP POST → SSE event stream → for-await loop → EventBridge 手工路由 → IPC → renderer。多层间接性导致延迟和故障点增多
4. **端口管理开销**：`killPortProcess(4096)`、端口冲突检测、server 崩溃恢复——都是不必要的复杂度

### 为什么选择 ACP

1. **更自然的 Electron 架构**：`child_process.spawn` + stdio 是 Electron main process 的标准模式，和终端、git 等其他进程管理方式一致
2. **真正的双向实时流**：JSON-RPC notifications over stdio，无 HTTP/SSE 的缓冲和重连问题
3. **持久进程**：`opencode acp` 启动一次，多次对话复用，无冷启动延迟
4. **OpenCode 官方集成路径**：Zed 等编辑器均通过 ACP 集成 OpenCode
5. **复用现有轮子**：`@agentclientprotocol/sdk` 提供成熟的 JSON-RPC 2.0 over stdio 传输层

### 关键决策

| 决策 | 选择 |
|------|------|
| 传输协议 | **ACP**（JSON-RPC 2.0 over stdio） |
| 传输层实现 | **复用 `@agentclientprotocol/sdk`**（不重复造轮子） |
| 进程管理 | `child_process.spawn("opencode", ["acp"])` |
| 渲染器兼容 | **IPC 接口完全不变**，渲染器零感知 |
| 会话存储 | OpenCode 原生（`~/.local/share/opencode/storage/sessions/`） |
| Multi-agent | **移除**——单一 OpenCode 焦点 |

---

## 2. Architecture Overview

### Target Architecture

```
┌── Electron Main Process ──────────────────────────────┐
│                                                        │
│  child_process.spawn("opencode", ["acp"])              │
│       ↓ stdin/stdout                                   │
│  @agentclientprotocol/sdk                              │
│  └── ClientSideConnection (JSON-RPC 2.0 编解码+传输)  │
│       ↓                                                │
│  AcpService (单例)                                     │
│  ├── initialize/shutdown (进程生命周期)                │
│  ├── createSession/sendPrompt/getMessages/abort        │
│  └── onNotification → EventMapper                     │
│       ↓                                                │
│  EventMapper                                           │
│  ├── sessionToTab Map (sessionId → tabId 路由)        │
│  ├── ACP notification → IPC 事件映射                   │
│  └── win.webContents.send("chat:stream", ...)          │
│       ↓ IPC                                            │
└───────┬────────────────────────────────────────────────┘
        │ contextBridge
┌── Electron Renderer ───▼───────────────────────────────┐
│  preload/index.ts (API 不变)                           │
│       ↓                                                │
│  useOpenCodeEvents hook (处理逻辑不变)                 │
│       ↓                                                │
│  chat-store.ts (Zustand，无需改动)                     │
│       ↓                                                │
│  Chat UI (chat-composer, chat-messages, tools)         │
└────────────────────────────────────────────────────────┘
```

### 与当前架构的对比

| 层面 | 当前 (HTTP+SSE) | 目标 (ACP) |
|------|----------------|-----------|
| 进程启动 | `createOpencode()` SDK 自动启动 HTTP server | `child_process.spawn("opencode", ["acp"])` |
| 通信协议 | HTTP REST + SSE | JSON-RPC 2.0 over stdio |
| 传输库 | `@opencode-ai/sdk` | `@agentclientprotocol/sdk` |
| 会话创建 | `client.session.create({ body })` | `conn.request("session/new", { cwd })` |
| 发送提示词 | `client.session.promptAsync({ body })` | `conn.request("session/prompt", { parts })` |
| 流式接收 | `client.event.subscribe()` → for-await | `conn.onNotification("session/update")` |
| 取消对话 | `client.session.abort({ path })` | `conn.sendNotification("session/cancel")` |
| 会话加载 | `client.session.messages({ path })` | `conn.request("session/load", { sessionId })` |
| 服务管理 | HTTP server: `server.close()`, `killPortProcess()` | 子进程: `proc.kill()`, 自动重启 |

---

## 3. File Change Manifest

### 3.1 Files to REWRITE

```
prism-next/src/main/opencode/service.ts    → acp/service.ts       (~200 行)
prism-next/src/main/opencode/event-bridge.ts → acp/event-mapper.ts (~120 行)
```

### 3.2 Files to UPDATE (minor)

```
prism-next/src/main/ipc/chat.ts            # import 路径切换，~10行改动
prism-next/src/main/ipc/index.ts           # 无需改动（导入路径在 chat.ts 内部）
prism-next/package.json                    # @opencode-ai/sdk → @agentclientprotocol/sdk
prism-next/pnpm-lock.yaml                  # 重新生成
```

### 3.3 Files UNCHANGED

```
# IPC 接口保持完全兼容，以下全部不变：
prism-next/src/preload/index.ts
prism-next/src/renderer/types/electron.d.ts
prism-next/src/renderer/stores/chat-store.ts
prism-next/src/renderer/hooks/use-opencode-events.ts
prism-next/src/renderer/components/modules/chat/**  (all components)
prism-next/src/renderer/components/modules/settings/**
prism-next/src/main/index.ts

# 其他服务完全不变：
prism-next/src/main/services/*
prism-next/src/main/ipc/fs.ts, compile.ts, terminal.ts, etc.
```

### 3.4 Files ALREADY DELETED (prior migration)

```
# 已在之前的 Claude → OpenCode 迁移中删除，本次无需再处理：
prism-next/src/main/agents/claude/**
prism-next/src/main/agents/gemini/**
prism-next/src/main/agents/qoder/**
prism-next/src/main/agents/registry.ts, types.ts
prism-next/src/main/cli/**
prism-next/src/main/ipc/cli.ts
prism-next/src/renderer/stores/agent-settings-store.ts
prism-next/src/renderer/lib/agent-config.ts
prism-next/src/renderer/hooks/use-cli-events.ts
prism-next/src/renderer/components/modules/chat/agent-settings/claude-settings.tsx
prism-next/src/renderer/components/modules/chat/agent-settings/gemini-settings.tsx
prism-next/src/renderer/components/modules/chat/agent-settings/qoder-settings.tsx
```

---

## 4. AcpService Design (Core Module)

### 4.1 Interface

```typescript
// src/main/acp/service.ts

import { ClientSideConnection } from "@agentclientprotocol/sdk";
import type { ChildProcess } from "node:child_process";

export interface SessionInfo {
  id: string;
  title: string;
  lastModified: number;
  createdAt: number;
}

export class AcpService {
  private static instance: AcpService;
  private conn: ClientSideConnection | null = null;
  private proc: ChildProcess | null = null;
  private projectPath: string = "";
  private notificationHandlers: Array<(method: string, params: any) => void> = [];

  static getInstance(): AcpService

  // ─── 生命周期 ───
  async initialize(projectPath: string): Promise<void>
  async shutdown(): Promise<void>
  async healthCheck(): Promise<{ healthy: boolean; version: string }>
  getConnection(): ClientSideConnection | null

  // ─── 会话管理 ───
  async createSession(title?: string): Promise<SessionInfo>
  async listSessions(): Promise<SessionInfo[]>
  async getMessages(sessionId: string): Promise<Message[]>
  async deleteSession(sessionId: string): Promise<void>

  // ─── 对话 ───
  async sendPrompt(
    sessionId: string,
    prompt: string,
    opts?: { model?: string; provider?: string; systemPrompt?: string }
  ): Promise<void>
  async sendAnswer(sessionId: string, answer: string): Promise<void>
  async abort(sessionId: string): Promise<void>

  // ─── 配置 ───
  async getProviders(): Promise<Provider[]>
  async setAuth(provider: string, credentials: Record<string, string>): Promise<void>

  // ─── 通知回调（供 EventMapper 注册）───
  onNotification(handler: (method: string, params: any) => void): () => void
  private emitNotification(method: string, params: any): void
}
```

### 4.2 ACP 协议映射

| AcpService 方法 | ACP JSON-RPC 方法 | 方向 | 说明 |
|----------------|-------------------|------|------|
| `initialize()` | `initialize` | 请求→响应 | 握手，获取 agent 能力 |
| `createSession()` | `session/new` | 请求→响应 | 返回 `{ sessionId }` |
| `sendPrompt()` | `session/prompt` | 请求 | 异步，结果通过 `session/update` 通知流式返回 |
| `getMessages()` | `session/load` | 请求→响应 | 回放完整对话历史 |
| `abort()` | `session/cancel` | 通知 | 取消当前运行 |
| `sendAnswer()` | `session/prompt` | 请求 | 复用 prompt 通道，回答工具提问 |
| *流式文本* | `session/update` | ← 通知 | AI 逐字输出 delta |
| *工具调用* | `session/update` | ← 通知 | 工具使用状态变更 |
| *会话状态* | `session/status` | ← 通知 | completed / error / running |
| *Todo 更新* | `session/todo` | ← 通知 | 任务计划更新 |
| *权限请求* | `session/permission` | ← 通知 | 需要用户授权 |
| `shutdown()` | `exit` | 通知 | 通知 agent 退出，然后 SIGTERM→SIGKILL |

### 4.3 进程生命周期

```
initialize(projectPath):
  ├── 如果已有进程且 cwd 相同 → return (幂等)
  ├── 如果已有进程但 cwd 不同 → shutdown() 再重启
  ├── spawn("opencode", ["acp"], { cwd: projectPath, env: { ...process.env } })
  ├── conn = new ClientSideConnection(proc.stdin, proc.stdout)
  ├── await conn.request("initialize", { capabilities: {...} })
  └── 标记为就绪

shutdown():
  ├── try: conn.sendNotification("exit")
  ├── setTimeout 3s → proc.kill("SIGTERM")
  ├── setTimeout 5s → proc.kill("SIGKILL")
  ├── conn = null, proc = null
  └── 清理

自动恢复:
  ├── proc.on("exit", (code) => {
  │     if (code !== 0 && conn) {
  │       // 意外退出 → 自动重启 + 通知渲染器
  │       initialize(projectPath)
  │     }
  │   })
  └── 通过 session/load 恢复活跃会话
```

### 4.4 二进制发现

```typescript
// 与当前 OpencodeService 相同的逻辑，保留
resolveBinaryPath(): string | null {
  if (app.isPackaged) {
    return join(process.resourcesPath, "opencode", "opencode");
  }
  // 开发模式：依赖 PATH 中的 opencode
  return null;
}

// initialize 时注入 PATH
const binaryDir = this.resolveBinaryDir();
if (binaryDir) {
  process.env.PATH = `${binaryDir}:${process.env.PATH}`;
}
```

---

## 5. EventMapper Design

### 5.1 Interface

```typescript
// src/main/acp/event-mapper.ts

import type { BrowserWindow } from "electron";

export class EventMapper {
  private win: BrowserWindow;
  private sessionToTab = new Map<string, string>();
  private unregisterNotification: (() => void) | null = null;

  constructor(win: BrowserWindow)

  // ─── 注册 ───
  registerSession(sessionId: string, tabId: string): void
  unregisterSession(sessionId: string): void

  // ─── 启动 / 停止 ───
  start(): void
  stop(): void

  // ─── ACP 通知入口 ───
  handleNotification(method: string, params: any): void
}
```

### 5.2 通知 → IPC 映射表

| ACP 通知 | 路由逻辑 | IPC 通道 | 渲染器处理 |
|----------|---------|----------|-----------|
| `session/update` — text/reasoning delta | `params.sessionId` → tabId | `chat:stream` `{ tabId, type: "message.part.updated", data: { part, delta } }` | `_upsertLastMessage` → 流式文本更新 |
| `session/update` — tool call | `params.sessionId` → tabId | `chat:stream` `{ tabId, type: "message.part.updated", data: { part } }` | 工具渲染 + 变更追踪 |
| `session/update` — tool result | `params.sessionId` → tabId | `chat:stream` `{ tabId, type: "message.updated", data: { message } }` | 工具结果显示 + 变更注册 |
| `session/status` → completed | `params.sessionId` → tabId | `chat:complete` `{ tabId, sessionId, success: true, tokenUsage }` | `_setStreaming(false)` + token 更新 |
| `session/status` → error | `params.sessionId` → tabId | `chat:complete` `{ tabId, sessionId, success: false, error }` | `_setError` |
| `session/status` → idle | `params.sessionId` → tabId | `chat:complete` `{ tabId, sessionId, success: true }` | `_setStreaming(false)` |
| `session/todo` | `params.sessionId` → tabId | `chat:stream` `{ tabId, type: "todo.updated", data }` | TodoWidget 渲染 |
| `session/permission` | `params.sessionId` → tabId | `chat:permission` `{ tabId, permissionId, message, options }` | 权限弹窗 |
| `session/created` | 无（server 端事件） | 不需要路由 | N/A |

### 5.3 兼容性保证

EventMapper 发出的 IPC 事件格式与当前 `event-bridge.ts` **完全一致**：
- `chat:stream` 的 `{ tabId, type, data }` 结构不变
- `chat:complete` 的 `{ tabId, sessionId, success, error, tokenUsage }` 结构不变
- `chat:sessionCreated` 的 `{ tabId, sessionId }` 结构不变
- `chat:permission` 的 `{ tabId, permissionId, message, options }` 结构不变

因此 `use-opencode-events.ts` hook 和所有渲染器组件**无需任何改动**。

---

## 6. IPC Layer

### 6.1 chat.ts 变更范围

```typescript
// 仅 import 路径变更：
// BEFORE:
import { OpencodeService } from "../opencode/service";
import { EventBridge } from "../opencode/event-bridge";

// AFTER:
import { AcpService } from "../acp/service";
import { EventMapper } from "../acp/event-mapper";

// 内部变量名：
// eventBridge → eventMapper
// getService() → AcpService.getInstance()

// 其余所有逻辑、IPC handler 签名、事件发送格式全部不变
```

### 6.2 Package.json 变更

```jsonc
{
  "dependencies": {
    // REMOVE:
    // "@opencode-ai/sdk": "^1.0.0",

    // ADD (恢复):
    "@agentclientprotocol/sdk": "^0.22.1"
  }
}
```

---

## 7. OpenCode 扩展性（ACP 不受影响）

ACP 仅改变传输层，OpenCode 引擎的全部扩展能力保持不变：

| 扩展能力 | 配置方式 | ACP 下是否可用 |
|----------|---------|:---:|
| 插件系统 | `opencode.json` → `plugin` 数组 | ✅ |
| MCP 服务器 | `opencode.json` → `mcp` 配置 | ✅ |
| 自定义 Agent | `.opencode/agent/*.md` + frontmatter | ✅ |
| AGENTS.md | 项目根目录 | ✅ |
| 自定义命令 | `.opencode/command/*.md` | ✅ |
| Skills 技能 | `.opencode/skills/` | ✅ |
| Claude 生态桥接 | `@sjawhar/opencode-claude-bridge` 插件 | ✅ |
| 75+ LLM Provider | `session/new` 时指定 model | ✅ |
| 权限控制 | `opencode.json` → `permission` | ✅ |
| LSP 集成 | `opencode.json` → `lsp` | ✅ |

---

## 8. Risks & Mitigations

| 风险 | 严重度 | 缓解措施 |
|------|--------|---------|
| `opencode acp` 的 ACP 实现与 `@agentclientprotocol/sdk` 不完全兼容 | 🟡 Medium | Phase 1 先验证 initialize 握手 + session/new 基本流程 |
| `session/prompt` 异步返回模式（结果走 notification 而非 response）与 SDK 的 request/response 模型不一致 | 🟡 Medium | 用 `conn.sendNotification` + `conn.onNotification` 处理异步流，不走 request |
| OpenCode ACP 的 `session/update` 通知格式与 SSE 事件格式不同 | 🟡 Medium | EventMapper 内部做格式适配，保证 IPC 事件格式不变 |
| `session/load` 回放的消息格式与当前使用的格式不同 | 🟡 Medium | 在 `getMessages()` 内部做格式转换 |
| `session/list` 不是标准 ACP 方法 | 🟡 Medium | 直接读 OpenCode 的会话存储目录（`~/.local/share/opencode/storage/sessions/`） |
| 子进程意外退出 | 🟢 Low | 自动重启 + `session/load` 恢复 |
| OpenCode binary 未安装 | 🟢 Low | 与当前相同的 binary discovery 逻辑 |

---

## 9. ACP Protocol Details (Reference)

### 9.1 关键方法

```
initialize:
  → { jsonrpc: "2.0", method: "initialize", params: { capabilities: {...} } }
  ← { result: { capabilities: {...}, version: "..." } }

session/new:
  → { method: "session/new", params: { cwd: "/project/path" } }
  ← { result: { sessionId: "session-xxx" } }

session/prompt:
  → { method: "session/prompt", params: {
        sessionId: "session-xxx",
        parts: [{ type: "text", text: "user prompt" }]
      } }
  ← 立即返回 { result: { status: "running" } } 或 204
  然后通过 notifications 流式输出:
  ← { method: "session/update", params: {
        sessionId: "session-xxx",
        update: { type: "text", text: "delta..." }
      } }
  ← { method: "session/status", params: {
        sessionId: "session-xxx",
        status: "completed"
      } }

session/load:
  → { method: "session/load", params: { sessionId: "session-xxx", cwd: "/project" } }
  ← 先回放历史消息:
  ← { method: "session/update", params: { sessionId, update: {...} } }
  ← { method: "session/update", params: { sessionId, update: {...} } }
  ← { result: { status: "ready" } }

session/cancel:
  → { method: "session/cancel", params: { sessionId: "session-xxx" } }
  ← { result: { status: "cancelled" } }
```

### 9.2 通知格式（OpenCode 特定）

```
session/update — 文本 delta:
  { sessionId, update: { type: "text", text: "新输出的文本" } }

session/update — 工具调用:
  { sessionId, update: { type: "tool", id: "tool-1", name: "edit", input: {...} } }

session/update — 工具结果:
  { sessionId, update: { type: "tool_result", tool_use_id: "tool-1", content: "..." } }

session/status:
  { sessionId, status: "completed" | "error" | "running" | "idle", usage?: {...} }
```

---

## 10. Out of Scope

- OpenCode 二进制下载/更新机制（沿用现有 `scripts/download-opencode.sh` + `electron-builder extraResources`）
- 多 Agent 支持（已移除）
- Claude 会话数据迁移（无生产用户）
- OpenCode 插件开发（先用现有生态）
- 自定义 MCP server（OpenCode 原生支持）
