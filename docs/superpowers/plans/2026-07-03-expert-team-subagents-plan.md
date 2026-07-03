# Expert Team & OpenCode Subagents — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将应用层可自定义 Expert/Orchestrator 同步到 OpenCode subagent 系统，打通 Expert team 模式的 `@` 多专家协作与 Orchestrator 自主 `task` 委派。

**Architecture:** 定义存于 `resources/experts|orchestrators/` 与 `.prismnext/agent/`；sync 写入 `<userData>/opencode-server/config/opencode/agents/*.md`（不写项目 `.opencode/`）；Expert team 的 `chat:send` 使用 Orchestrator 作主 agent，Composer 编译多 `@Expert` 为 turn preamble；event-mapper 继续 `parentSessionId` 路由。

**Spec:** `docs/superpowers/specs/2026-07-03-expert-team-subagents-design.md`

**Tech Stack:** Electron main (`experts-sync`, `AcpService`), IPC, Zustand chat-store, Composer inline parts, Vitest

---

## 阶段总览

| Phase | 目标 | 关键交付 |
|-------|------|----------|
| P0 | 类型 + sync 基础设施 | `agent-experts.ts`, `experts-sync.ts`, bundled resources |
| P1 | Expert team 发送链路 | `chat.ts`, `compile-composer-prompt`, orchestrator session |
| P2 | Settings + custom expert CRUD | `agent-settings.tsx`, IPC experts:* |
| P3 | UI  polish + migration + TaskWidget | TaskWidget, legacy profiles migration |
| P4 | 测试 + 文档 + CHANGELOG | tsc, vitest, deprecate old spec refs |

---

## File map（新建 / 主要修改）

| 文件 | 职责 |
|------|------|
| `src/main/services/agent-experts.ts` | Expert / Orchestrator 共享类型 |
| `src/main/services/bundled-experts.ts` | 读 `resources/experts/` |
| `src/main/services/bundled-orchestrators.ts` | 读 `resources/orchestrators/` |
| `src/main/services/experts-sync.ts` | 列表、CRUD、markdown 生成、sync state |
| `src/main/services/project-experts-refresh.ts` | debounce + reload（仿 skills） |
| `src/main/ipc/experts.ts` | IPC handlers |
| `resources/experts/**` | 从 profiles 迁移 citation-auditor, literature-scout |
| `resources/orchestrators/**` | 从 profiles 迁移 academic-writer |
| `src/main/ipc/chat.ts` | expert-team send 分支 |
| `src/renderer/.../compile-composer-prompt.ts` | `selectedExpertIds[]` + preamble |
| `src/renderer/stores/chat-store.ts` | `orchestratorId`, send payload |
| `src/renderer/components/.../task-widget.tsx` | 动态 expert label |
| `tests/main/experts-sync.test.ts` | sync 单测 |

---

## Phase P0 — 类型与 Sync 基础设施

### Task 1: 共享类型 `agent-experts.ts`

**Files:**
- Create: `src/main/services/agent-experts.ts`
- Test: `tests/main/experts-sync.test.ts`（后续 Task 3 起用）

- [ ] **Step 1: 创建类型文件**

```typescript
// src/main/services/agent-experts.ts
export interface ExpertDefinition {
  id: string;
  name: string;
  description: string;
  builtin?: boolean;
  removable?: boolean;
  model?: string;
  thoughtLevel?: string;
  temperature?: number;
  skills?: string[];
  mcpServers?: string[];
  modules?: string[];
  commands?: string[];
  rules?: string[];
  permission?: Record<string, unknown>;
}

export interface OrchestratorDefinition {
  id: string;
  name: string;
  description: string;
  builtin?: boolean;
  model?: string;
  thoughtLevel?: string;
  temperature?: number;
  allowedExperts?: string[];
  skills?: string[];
  mcpServers?: string[];
  modules?: string[];
  commands?: string[];
  rules?: string[];
  permission?: Record<string, unknown>;
}

export interface ExpertInfo extends ExpertDefinition {
  enabled: boolean;
  instructionsPreview: string;
  effectiveModules: string[];
}

export interface OrchestratorInfo extends OrchestratorDefinition {
  enabled: boolean;
  instructionsPreview: string;
  effectiveModules: string[];
}

export interface ExpertsManifest {
  disabledBuiltinIds?: string[];
  builtinOverrides?: Record<string, Partial<ExpertDefinition>>;
}

export interface OrchestratorsManifest {
  defaultOrchestratorId?: string;
  disabledBuiltinIds?: string[];
  builtinOverrides?: Record<string, Partial<OrchestratorDefinition>>;
}

export interface PrismExpertsSyncState {
  projectRoot: string;
  syncedAt: number;
  agentFiles: string[];
  orchestratorId: string;
}

export const DEFAULT_ORCHESTRATOR_ID = "academic-writer";
```

- [ ] **Step 2: Commit**

```bash
git add src/main/services/agent-experts.ts
git commit -m "docs(experts): add Expert/Orchestrator shared types"
```

---

### Task 2: 内置 bundle 自 profiles 迁移

**Files:**
- Create: `resources/experts/manifest.json`
- Create: `resources/experts/citation-auditor/expert.json`
- Create: `resources/experts/citation-auditor/instructions.md`（从 `resources/profiles/citation-auditor/instructions.md` 复制）
- Create: `resources/experts/literature-scout/expert.json`
- Create: `resources/experts/literature-scout/instructions.md`
- Create: `resources/orchestrators/manifest.json`
- Create: `resources/orchestrators/academic-writer/orchestrator.json`
- Create: `resources/orchestrators/academic-writer/instructions.md`（更新 delegate 文案）

- [ ] **Step 1: 创建 experts manifest 与 expert.json**

`resources/experts/manifest.json`:

```json
{
  "experts": [
    {
      "id": "citation-auditor",
      "name": "Citation Auditor",
      "description": "Focused review of citations, bib entries, and reference consistency.",
      "builtin": true,
      "skills": ["academic-citations"],
      "modules": ["citations"],
      "permission": {
        "edit": "deny",
        "bash": "deny",
        "task": { "*": "deny" }
      }
    },
    {
      "id": "literature-scout",
      "name": "Literature Scout",
      "description": "External literature search, staging, and manuscript-ready summaries.",
      "builtin": true,
      "modules": ["citations", "chat-citation-staging"],
      "permission": {
        "edit": "deny",
        "bash": "deny",
        "task": { "*": "deny" }
      }
    }
  ]
}
```

- [ ] **Step 2: 创建 orchestrator manifest**

`resources/orchestrators/academic-writer/orchestrator.json`:

```json
{
  "id": "academic-writer",
  "name": "Academic Writer",
  "description": "Primary LaTeX manuscript orchestrator for ResearchPrism expert teams.",
  "builtin": true,
  "allowedExperts": ["citation-auditor", "literature-scout"],
  "modules": ["academic-writing", "citations", "math-equations", "figures-tables"]
}
```

- [ ] **Step 3: 更新 academic-writer instructions**

`resources/orchestrators/academic-writer/instructions.md` 替换 delegate 段为：

```markdown
When specialized help is needed in expert team mode, delegate via the Task tool:
- `citation-auditor` — bibliography and citation consistency
- `literature-scout` — external literature search and staged `[n]` citations

Do not guess expert outputs; wait for Task results before synthesizing.
```

- [ ] **Step 4: 创建 bundled readers**

Create `src/main/services/bundled-experts.ts` 与 `bundled-orchestrators.ts`（仿 `bundled-profiles.ts`，路径指向 `resources/experts` / `resources/orchestrators`）。

- [ ] **Step 5: Commit**

```bash
git add resources/experts resources/orchestrators src/main/services/bundled-experts.ts src/main/services/bundled-orchestrators.ts
git commit -m "feat(experts): add bundled experts and orchestrators resources"
```

---

### Task 3: `experts-sync.ts` — markdown 生成与 userData 写入

**Files:**
- Create: `src/main/services/experts-sync.ts`
- Modify: `src/main/acp/service.ts`（添加 `getOpencodeAgentsDir()` helper 若尚不存在）
- Test: `tests/main/experts-sync.test.ts`

- [ ] **Step 1: 写 failing test — renderExpertAgentMarkdown**

```typescript
// tests/main/experts-sync.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  renderExpertAgentMarkdown,
  renderOrchestratorAgentMarkdown,
  syncProjectExpertsToOpencode,
} from "../../src/main/services/experts-sync";

describe("experts-sync", () => {
  it("renders subagent markdown with mode and description", () => {
    const md = renderExpertAgentMarkdown(
      {
        id: "citation-auditor",
        name: "Citation Auditor",
        description: "Audit citations",
        permission: { edit: "deny", task: { "*": "deny" } },
      },
      "You audit citations.",
    );
    expect(md).toContain("mode: subagent");
    expect(md).toContain("description: Audit citations");
    expect(md).toContain("You audit citations.");
    expect(md).not.toMatch(/^tools:/m);
  });

  it("renders orchestrator task allowlist", () => {
    const md = renderOrchestratorAgentMarkdown(
      {
        id: "academic-writer",
        name: "Academic Writer",
        description: "Orchestrator",
        allowedExperts: ["citation-auditor", "literature-scout"],
      },
      "You orchestrate.",
      ["citation-auditor", "literature-scout"],
    );
    expect(md).toContain("mode: primary");
    expect(md).toContain("citation-auditor: allow");
    expect(md).toContain(' "*": deny');
  });
});
```

- [ ] **Step 2: 运行测试确认 FAIL**

Run: `cd prism-next && pnpm test tests/main/experts-sync.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 实现 `experts-sync.ts` 核心**

必须实现：

- `listExperts(projectRoot)`, `getExpert`, `listOrchestrators`, `getOrchestrator`
- `renderExpertAgentMarkdown(def, instructionsBody)`
- `renderOrchestratorAgentMarkdown(def, instructionsBody, allowedExpertIds)`
- `buildTaskPermissionBlock(allowedIds: string[])`
- `syncProjectExpertsToOpencode(projectRoot, options?: { agentsDir: string })`  
  - 写 `<agentsDir>/<id>.md`  
  - 写 `prism-experts-sync.json` 到 `<userData>/opencode-server/`
- `clearSyncedAgentFiles(agentsDir, agentFiles: string[])`

**agentsDir 解析：**

```typescript
import { app } from "electron";
import { join } from "node:path";

export function getOpencodeAgentsDir(): string {
  return join(app.getPath("userData"), "opencode-server", "config", "opencode", "agents");
}
```

- [ ] **Step 4: 运行测试 PASS**

Run: `cd prism-next && pnpm test tests/main/experts-sync.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/main/services/experts-sync.ts tests/main/experts-sync.test.ts
git commit -m "feat(experts): sync experts to OpenCode agents markdown"
```

---

### Task 4: `project-experts-refresh.ts` + prewarm 挂钩

**Files:**
- Create: `src/main/services/project-experts-refresh.ts`
- Modify: `src/main/acp/service.ts` — `prewarmProject` 末尾调用 refresh
- Modify: `src/main/index.ts` 或 project open 路径（与 skills prewarm 并列）

- [ ] **Step 1: 实现 refresh**

```typescript
// src/main/services/project-experts-refresh.ts
import { AcpService } from "../acp/service";
import { syncProjectExpertsToOpencode, readPrismExpertsSyncState, clearSyncedAgentFiles, getOpencodeAgentsDir } from "./experts-sync";

export async function refreshProjectExpertsIntegration(projectRoot: string): Promise<{ agentFiles: string[] }> {
  const agentsDir = getOpencodeAgentsDir();
  const prev = readPrismExpertsSyncState();
  if (prev?.agentFiles?.length) {
    clearSyncedAgentFiles(agentsDir, prev.agentFiles);
  }
  const result = syncProjectExpertsToOpencode(projectRoot, { agentsDir });
  AcpService.getInstance().prewarmProject(projectRoot);
  return result;
}

export async function refreshProjectExpertsIntegrationWithReload(projectRoot: string): Promise<void> {
  await refreshProjectExpertsIntegration(projectRoot);
  const acp = AcpService.getInstance();
  if (acp.getConnection()) {
    await acp.reloadAfterExpertsIntegration(); // 新增，仿 reloadAfterSkillsIntegration
  }
}
```

- [ ] **Step 2: 在 `AcpService` 添加 `reloadAfterExpertsIntegration`**

仿 `reloadAfterSkillsIntegration()`：`shutdown()` + `initialize()`。

- [ ] **Step 3: `prewarmProject` 调用**

在 `AcpService.prewarmProject` 末尾：

```typescript
void refreshProjectExpertsIntegration(projectRoot).catch((err) => {
  log.warn("experts refresh failed", err);
});
```

- [ ] **Step 4: Commit**

```bash
git add src/main/services/project-experts-refresh.ts src/main/acp/service.ts
git commit -m "feat(experts): refresh experts on project prewarm"
```

---

## Phase P1 — Expert team 发送链路

### Task 5: Composer 多 `@Expert` 编译

**Files:**
- Modify: `src/renderer/components/modules/chat/inline-composer/compile-composer-prompt.ts`
- Modify: `src/renderer/lib/chat/composer-parts.ts`（若需 `mentionType: "expert"`）
- Test: `tests/renderer/compile-composer-experts.test.ts`

- [ ] **Step 1: 扩展 `CompiledComposerPrompt`**

```typescript
export interface CompiledComposerPrompt {
  // existing...
  selectedProfileId: string | null;       // agent mode persona — keep
  selectedExpertIds: string[];            // expert-team mode
}
```

- [ ] **Step 2: 收集所有 profile/expert mentions**

```typescript
const selectedExpertIds: string[] = [];
for (const part of parts) {
  if (part.type === "mention" && part.mentionType === "profile") {
    selectedProfileId = part.profileId; // agent mode: last wins (legacy)
    if (!selectedExpertIds.includes(part.profileId)) {
      selectedExpertIds.push(part.profileId);
    }
  }
}
```

- [ ] **Step 3: 添加 `buildExpertTeamPreamble(expertIds, experts: ExpertInfo[])`**

在 main 或 renderer 共享 util（推荐 `src/shared/expert-team-preamble.ts`）生成 spec §7.3 文本。

- [ ] **Step 4: 写 test**

`tests/renderer/compile-composer-experts.test.ts`：两个 `@profile` chip → `selectedExpertIds.length === 2`。

- [ ] **Step 5: Commit**

---

### Task 6: `chat-store` + `chat:send` expert-team 分支

**Files:**
- Modify: `src/renderer/stores/chat-store.ts`
- Modify: `src/main/ipc/chat.ts`
- Modify: `src/preload/index.ts`, `src/renderer/types/electron.d.ts`

- [ ] **Step 1: 扩展 send 参数**

```typescript
// electron.d.ts chatSend args
chatMode?: "agent" | "expert-team";
orchestratorId?: string;
selectedExpertIds?: string[];
```

- [ ] **Step 2: `sendPrompt` 传入 chatMode 与 selectedExpertIds**

`use-chat-composer.ts` `handleSend` 读取 tab.chatMode，传入 store。

- [ ] **Step 3: `chat.ts` expert-team 分支**

当 `args.chatMode === "expert-team"`：

1. `await refreshProjectExpertsIntegration(args.projectPath)`（或 rely on prewarm + 轻量 ensure）
2. `orchestratorId = args.orchestratorId ?? readOrchestratorsManifest.defaultOrchestratorId ?? DEFAULT_ORCHESTRATOR_ID`
3. **跳过** `buildProfilePromptOverlay` / `composeProfileOverlay`
4. 使用 `getOrchestratorRuntimeFilters(orchestratorId)` 替代 profile filters
5. 若 `selectedExpertIds.length`，append preamble 到 `userPrompt`
6. 创建/继续 session 时指定 OpenCode agent = orchestratorId（**实现时读 AcpService session API** — 见 spec §15）

- [ ] **Step 4: Agent 模式保持现有 profile 路径不变**

- [ ] **Step 5: 手动验证清单**

- Expert team + `@Citation Auditor` → TaskWidget 显示 expert id
- Agent 模式 + `@Academic Writer` → 仍走 profile-overlay

- [ ] **Step 6: Commit**

---

### Task 7: OpenCode session 指定 Orchestrator agent

**Files:**
- Modify: `src/main/acp/service.ts` — session create / prompt send
- Modify: `src/main/acp/event-mapper.ts` — `markSubAgentSession` on child session create

- [ ] **Step 1: 调研 ACP `session/new` 或 OpenCode 等价参数**

在 `service.ts` 搜索 `session/new`、`createSession`，确认是否支持 `{ agent: orchestratorId }` 或需在 `opencode.json` 设置 `default_agent`。

- [ ] **Step 2: 实现 `sendChatWithAgent(sessionId, orchestratorId)`**

Expert team 每次 send 确保 session 绑定 orchestrator（若 OpenCode 仅启动时读 config，则 expert-team 切换时 patch `opencode.json` + reload — 记录于代码注释）。

- [ ] **Step 3: 子 session 标记**

在 `event-mapper.ts` 检测 `session/created` 或 task 工具返回的新 sessionId，调用 `acp.markSubAgentSession(childId)`。

- [ ] **Step 4: Commit**

---

## Phase P2 — Settings 与 Custom Expert CRUD

### Task 8: IPC `experts:*`

**Files:**
- Create: `src/main/ipc/experts.ts`
- Modify: `src/main/ipc/index.ts`（register）
- Modify: `src/preload/index.ts`, `src/renderer/types/electron.d.ts`

- [ ] **Step 1: Handlers**

| Channel | 实现 |
|---------|------|
| `experts:list` | `listExperts(projectRoot)` |
| `experts:get` | `getExpertDetail` |
| `experts:saveCustom` | 写 `.prismnext/agent/experts/custom/<id>/` |
| `experts:deleteCustom` | rm custom dir |
| `experts:setBuiltinEnabled` | manifest disabledBuiltinIds |
| `experts:saveBuiltinOverride` | manifest builtinOverrides |
| `orchestrators:list` | `listOrchestrators` |
| `orchestrators:setDefault` | manifest defaultOrchestratorId |

每次 mutating call 后：`scheduleExpertsRefresh(projectRoot)`（debounce 800ms，仿 skills）。

- [ ] **Step 2: Commit**

---

### Task 9: Settings UI — Experts 分区

**Files:**
- Modify: `src/renderer/components/modules/settings/agent-settings.tsx`
- Create: `src/renderer/components/modules/settings/expert-editor-panel.tsx`（可选，或复用 settings editor slot）

- [ ] **Step 1: 列表分区 Orchestrators / Experts**

Experts 行：name、description、bundle summary、enable toggle、edit（builtin → override panel；custom → editor）。

- [ ] **Step 2: Custom expert 创建**

表单：name, description, instructions, model, modules/skills 多选, permission 预设（Read-only / Standard / Full）。

保存 → `experts:saveCustom` → toast → reload list。

- [ ] **Step 3: Commit**

---

## Phase P3 — TaskWidget、Migration、Composer UX

### Task 10: TaskWidget 动态 expert 元数据

**Files:**
- Modify: `src/renderer/components/modules/chat/tools/task-widget.tsx`
- Modify: `src/renderer/hooks/use-chat-composer.ts` — 加载 experts 列表供 widget cache

- [ ] **Step 1: 扩展 AGENT_META 或 runtime map**

```typescript
function resolveAgentMeta(agentType: string, experts: ExpertInfo[]): { label: string; desc: string } {
  const expert = experts.find((e) => e.id === agentType);
  if (expert) return { label: expert.name, desc: expert.description };
  return AGENT_META[agentType] ?? { label: agentType, desc: "" };
}
```

- [ ] **Step 2: Commit**

---

### Task 11: Composer Expert team UX

**Files:**
- Modify: `src/renderer/components/modules/chat/inline-composer/composer-dropdown.tsx` — expert-team 下 section label "Experts"
- Modify: `src/renderer/components/modules/chat/agent-settings/chat-mode-select.tsx` — 中文 description 可选
- Modify: `use-chat-composer.ts` — expert-team 加载 experts 而非 profiles

- [ ] **Step 1: expert-team mention 源切换为 `electronAPI.expertsList`**

- [ ] **Step 2: tab 级 `orchestratorId` 可选 selector（Settings 或 toolbar 次级菜单）— V1 可仅用 manifest default**

- [ ] **Step 3: Commit**

---

### Task 12: Legacy profiles migration

**Files:**
- Create: `src/main/services/profiles-to-experts-migration.ts`
- Modify: project open / `profiles-sync.ts` 加 one-shot migration

- [ ] **Step 1: 若存在 `profiles-manifest.json` 且无 `experts-manifest.json`**

- 复制 `disabledBuiltinIds` → experts-manifest
- 复制 `profiles/custom/` → `experts/custom/`（profile.json → expert.json）
- 写标记 `.prismnext/agent/.migrated-profiles-v2`

- [ ] **Step 2: IPC `agentListProfiles` wrapper 指向 experts list（deprecated JSDoc）**

- [ ] **Step 3: 更新 CHANGELOG + 标记 `2026-06-21-agent-profiles-design.md` superseded**

- [ ] **Step 4: Commit**

---

## Phase P4 — 测试与文档

### Task 13: 集成测试与 tsc

- [ ] **Step 1: 运行全量测试**

Run: `cd prism-next && pnpm test && npx tsc --noEmit`

- [ ] **Step 2: 补 `tests/main/experts-sync.test.ts` 项目切换清理用例**

- [ ] **Step 3: 更新 `CLAUDE.md` Agent Profiles 段 → Expert Team**

- [ ] **Step 4: CHANGELOG entry**

```markdown
### Expert Team (OpenCode subagents)
- Custom experts sync to app-level OpenCode agents; Expert team mode uses orchestrator + Task delegation
- Composer supports multiple @Expert mentions
- Settings → Agent: expert CRUD and orchestrator default
```

- [ ] **Step 5: Final commit**

---

## 依赖顺序

```
Task 1 → 2 → 3 → 4 (P0 必须串行)
         ↓
Task 5 → 6 → 7 (P1)
         ↓
Task 8 → 9 (P2 可与 P1 Task 7 部分并行)
         ↓
Task 10 → 11 → 12 → 13 (P3/P4)
```

---

## 风险缓解

| 风险 | 缓解 |
|------|------|
| OpenCode 无法 runtime 切换 primary agent | expert-team 切换时 patch `opencode.json` `default_agent` + reload；tab 级 cache orchestratorId |
| custom agent task 权限 bug（OpenCode #14308） | frontmatter 仅用 `permission.task`，禁止 `tools:` |
| 多项目 expert 串扰 | `prism-experts-sync.json` 清理 + 每次 refresh 全量替换 Prism 写入文件 |
| 与 legacy profile 并存混乱 | UI 分区 + migration + Agent 模式 rename Persona |

---

## Spec 覆盖自检

| Spec 章节 | Plan Task |
|-----------|-----------|
| §5 存储 | Task 2, 8 |
| §6 Schema | Task 1, 3 |
| §7 运行时 | Task 5, 6, 7 |
| §8 迁移 | Task 12 |
| §9 UI | Task 9, 10, 11 |
| §10 IPC | Task 8 |
| §12 错误 | Task 6, 8（toast on sync fail） |
| §13 测试 | Task 3, 5, 13 |
| §14 分阶段 | P0–P4 映射 |

---

## 执行选项

Plan 已保存至 `docs/superpowers/plans/2026-07-03-expert-team-subagents-plan.md`。

**推荐执行方式：**

1. **Subagent-Driven** — 每 Task 派生子 agent，Task 间 review（适合 P0→P1 基础设施）
2. **Inline Execution** — 同一会话按 Phase checkpoint 推进（适合 P2 UI 连续改动）

实现前请先 review spec；若 OpenCode session agent 指定方式与 spec §15 不同，在 Task 7 Step 1 结论后更新 spec 一节再编码。
