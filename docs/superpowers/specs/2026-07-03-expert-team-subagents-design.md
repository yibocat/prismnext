# Expert Team & OpenCode Subagents — Redesign

> 日期：2026-07-03  
> 状态：Approved for implementation planning  
> 取代/补充：`2026-06-21-agent-profiles-design.md`（Profile → OpenCode 对接部分视为废弃）  
> 关联：`.cursor/rules/opencode-and-skills-layout.mdc`、`permission-gate-architecture.md`

## 1. 动机

### 1.1 现状问题

Prism 现有 **Agent Profiles**（`resources/profiles/` + `profiles-sync.ts`）本质是 **主 session 的 prompt overlay**：

- Composer `@Profile` 只切换 system 指令与 modules/skills 过滤，**不 spawn OpenCode 子 session**。
- `academic-writer/instructions.md` 文案要求 delegate 给 `citation-auditor` / `literature-scout`，但 **OpenCode 侧没有对应 agent 定义**（原设计 sync 到 `.opencode/agents/` 从未实现，且与「不在项目目录写 `.opencode/`」规则冲突）。
- Chat 已预留 **`expert-team` 模式**（`ChatExecutionMode`），但发送链路与 `agent` 模式相同，仅为 UI shell（placeholder + 隐藏全局 Model 选择）。
- `compile-composer-prompt.ts` 对多个 `@profile` **只保留最后一个**。
- `AcpService.markSubAgentSession()` 存在但 **无调用点**；子 session 隐藏依赖 OpenCode SQLite `parent_id IS NULL`。

### 1.2 产品目标

用户希望子智能体是一条 **完整链路**：

1. **应用层可自定义** Expert（instructions、model、tools 权限、skills、modules…）。
2. **与 OpenCode subagent 系统打通** — 定义 sync 为 OpenCode 可 `task` / `@` 调用的 agent。
3. **Expert team 模式**下：
   - 用户可 `@` 一个或多个 Expert，触发多专家协作；
   - Orchestrator（编排者）也可 **自主判断** 调用哪些 Expert（OpenCode `task` 工具）。
4. **Agent 模式**保持简单：单 agent + 全局 model/thought，不强制走 subagent 链（可选轻量 persona，见 §8 迁移）。

---

## 2. 目标与非目标

### 2.1 目标

| # | 目标 |
|---|------|
| G1 | 项目内可定义、启用/禁用、覆盖内置 **Expert**（subagent）与 **Orchestrator**（primary） |
| G2 | 定义 sync 到 **app-level OpenCode agents 目录**（userData），不写项目 `.opencode/` |
| G3 | **Expert team** 模式：`chat:send` 使用 Orchestrator 作主 agent；Expert 经 `task` 或 `@` 调用 |
| G4 | Composer 支持 **多个 `@Expert` chip**；编译进 user turn 与/或 OpenCode 原生 `@` 语法 |
| G5 | TaskWidget / 消息流展示 **真实 expert id**（如 `citation-auditor`），子 session 路由到同一 chat tab |
| G6 | Settings → Agent 扩展为 Expert / Orchestrator 管理（创建自定义 Expert、编辑内置覆盖） |
| G7 | 项目 open / prewarm / expert 变更时 refresh sync；切换项目时替换 agents 切片 |

### 2.2 非目标（本 redesign 不做）

- 跨项目 Expert 市场 / 导入导出库（后续）
- Expert 间实时「圆桌讨论」UI（多轮 visible debate）；V1 依赖 Orchestrator + 多个 `task` 串/并行
- 替换 OpenCode 内置 subagent 类型（`general` / `explore` / `scout` / `plan` / `build`）；它们仍可被 Orchestrator 调用
- 在 `.prismnext/` 或项目根写入 `.opencode/agents/`
- Expert team 模式下 per-expert 独立 chat tab（子 session 仍在同一 tab 内以 TaskWidget 展示）
- 自动把 legacy Profile overlay 与 Expert subagent 混为同一机制

---

## 3. 概念模型

| 概念 | OpenCode `mode` | 角色 | 典型用法 |
|------|-----------------|------|----------|
| **Orchestrator** | `primary` | 专家团编排者 | Expert team 模式主 session agent；持有 `permission.task` 白名单 |
| **Expert** | `subagent` | 可委派专家 | 经 `task(subagent_type: "<id>")` 或用户 `@Expert` 调用 |
| **Agent 模式（保留）** | — | 单 agent 对话 | 不切换 OpenCode primary；可选 **Persona overlay**（见 §8） |
| **Expert team 模式** | — | 多专家协作 | 必须选 Orchestrator；Composer `@` Experts |

**Primitives 不变：** Skills、MCP、Commands、Rules、Prompt modules 仍为底层能力；Expert/Orchestrator 通过 **引用 + sync 时注入 instructions** 组合它们。

---

## 4. 架构总览

```
┌──────────────────────────────────────────────────────────────────┐
│ Prism 应用层（Source of truth — 按项目）                          │
│                                                                  │
│  resources/orchestrators/     resources/experts/   （内置）         │
│  .prismnext/agent/                                               │
│    orchestrators-manifest.json                                   │
│    experts-manifest.json      { disabledBuiltinIds, overrides }  │
│    experts/custom/<id>/       expert.json + instructions.md      │
└────────────────────────────┬─────────────────────────────────────┘
                             │ refreshProjectExpertsIntegration()
                             │ （项目 open / expert 编辑 / 切换项目）
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│ OpenCode 运行时（userData — 每项目 active slice）                 │
│  <userData>/opencode-server/config/opencode/agents/              │
│    academic-writer.md        mode: primary   （Orchestrator）    │
│    citation-auditor.md       mode: subagent                      │
│    literature-scout.md       mode: subagent                      │
│    my-custom-expert.md       mode: subagent  （项目自定义）       │
│                                                                  │
│  prism-experts-sync.json     记录上次写入的文件列表（用于清理）    │
└────────────────────────────┬─────────────────────────────────────┘
                             │ ACP session + task tool
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│ Chat UI（同一 tab）                                               │
│  Orchestrator 主 session 流 + TaskWidget（子 session 结果）        │
│  parentSessionId → event-mapper 路由到 tabId                     │
└──────────────────────────────────────────────────────────────────┘
```

**与 skills 同构：** sync 目标在 `userData/opencode-server/config/`，通过 `XDG_CONFIG_HOME` 注入 OpenCode 子进程；**禁止**写入 `<project>/.opencode/`。

---

## 5. 存储布局

### 5.1 内置（app bundle）

```
resources/experts/
  manifest.json
  citation-auditor/
    expert.json
    instructions.md
  literature-scout/
    expert.json
    instructions.md

resources/orchestrators/
  manifest.json
  academic-writer/
    orchestrator.json
    instructions.md
```

### 5.2 项目（git 可跟踪）

```
.prismnext/agent/
  experts-manifest.json
  orchestrators-manifest.json
  experts/custom/<id>/
    expert.json
    instructions.md
```

### 5.3 Sync 目标（userData，不 commit）

```
<userData>/opencode-server/
  config/opencode/agents/*.md          ← OpenCode 读取
  prism-experts-sync.json              ← Prism 维护的 sync 状态
```

### 5.4 Sync 状态文件

```typescript
interface PrismExpertsSyncState {
  projectRoot: string;           // 上次 sync 对应的项目绝对路径
  syncedAt: number;              // ms timestamp
  agentFiles: string[];          // 相对 agents/ 的文件名，清理时用
  orchestratorId: string;        // 当前 expert-team 默认 orchestrator
}
```

**项目切换：** 读取 state → 删除 `agentFiles` 中 Prism 写入的文件（不删 OpenCode 自带内置 agent 若存在）→ 写入新项目 experts + orchestrator → 更新 state。若 OpenCode 需 reload 才加载新 agents，调用 `reloadAfterExpertsIntegration()`（仿 skills）。

---

## 6. Schema

### 6.1 Expert（`expert.json`）

```typescript
interface ExpertDefinition {
  id: string;                    // slug，即 OpenCode agent 名（文件名 <id>.md）
  name: string;                  // UI 显示名
  description: string;           // OpenCode frontmatter description — task 选型依据
  builtin?: boolean;
  removable?: boolean;

  /** provider/modelId，如 anthropic/claude-sonnet-4-20250514；omit = orchestrator/会话默认 */
  model?: string;
  thoughtLevel?: string;
  temperature?: number;

  /** 能力引用（与现 Profile 同义，sync 时写入 instructions 附录 + 运行时 filter） */
  skills?: string[];
  mcpServers?: string[];
  modules?: string[];
  commands?: string[];
  rules?: string[];

  /**
   * OpenCode tool permission overrides（YAML frontmatter permission 块）
   * 例：{ "*": "deny", read: "allow", grep: "allow" }
   * 不要用 legacy frontmatter `tools:` 字段（与 permission.task 冲突，见 OpenCode #7756）
   */
  permission?: Record<string, unknown>;
}
```

### 6.2 Orchestrator（`orchestrator.json`）

```typescript
interface OrchestratorDefinition {
  id: string;
  name: string;
  description: string;
  builtin?: boolean;

  model?: string;
  thoughtLevel?: string;
  temperature?: number;

  /** 本 orchestrator 可 task 的 expert id 列表；sync 时生成 permission.task */
  allowedExperts?: string[];     // omit = 允许项目内全部 enabled experts

  skills?: string[];
  mcpServers?: string[];
  modules?: string[];
  commands?: string[];
  rules?: string[];

  permission?: Record<string, unknown>;  // merged with generated task rules
}
```

### 6.3 Manifests

```typescript
interface ExpertsManifest {
  disabledBuiltinIds?: string[];
  builtinOverrides?: Record<string, Partial<ExpertDefinition>>;
}

interface OrchestratorsManifest {
  /** Expert team 模式默认 orchestrator id */
  defaultOrchestratorId?: string;   // default "academic-writer"
  disabledBuiltinIds?: string[];
  builtinOverrides?: Record<string, Partial<OrchestratorDefinition>>;
}
```

### 6.4 OpenCode agent markdown 生成规则

每个 Expert / Orchestrator sync 为 `<agentsDir>/<id>.md`：

```markdown
---
description: <description>
mode: subagent | primary
model: <provider/modelId>          # optional
temperature: 0.2                   # optional
permission:
  task:
    "*": deny
    citation-auditor: allow
    literature-scout: allow
  edit: ask
  bash: ask
---

<body: instructions.md + 可选 capability 附录>
```

**Orchestrator 的 `permission.task` 生成逻辑：**

```typescript
function buildTaskPermissions(allowedExpertIds: string[]): Record<string, string> {
  const rules: Record<string, string> = { "*": "deny" };
  for (const id of allowedExpertIds) rules[id] = "allow";
  // OpenCode 内置 subagent 是否 allow：V1 默认 deny，避免与学术 expert 混淆；后续 manifest 可扩展
  return rules;
}
```

**Expert 的 `permission.task`：** 默认 `{ "*": "deny" }`（专家不继续委派，除非 expert.json 显式覆盖）。`literature-scout` 保持「不用 Task 做文献发现」的产品约束。

---

## 7. 运行时行为

### 7.1 Chat 模式对比

| 维度 | `agent` | `expert-team` |
|------|---------|---------------|
| OpenCode primary | 会话默认（OpenCode build / 用户习惯） | 项目 `defaultOrchestratorId` sync 后的 orchestrator |
| 全局 Model / Thought | Composer 工具栏可选 | **隐藏**；Orchestrator + 各 Expert 自带 model |
| `@` mention | Profile/Persona（可选 overlay）+ file/paper | **Expert only**（多选）+ file/paper |
| Subagent 调用 | 仅 OpenCode 内置 task 类型（若 primary 有 task 权限） | Orchestrator `task` + 用户 `@Expert` |
| Prompt overlay | 可选 `profile-overlay` layer | **不用** profile-overlay；角色由 orchestrator/expert md 承担 |

### 7.2 Expert team — `chat:send` 流程

```
1. Renderer: compileComposerPrompt()
   → selectedExpertIds: string[]   // 所有 @Expert chip，有序去重
   → chatMode: "expert-team"
   → orchestratorId: tab.orchestratorId ?? manifest.defaultOrchestratorId

2. Main: refreshProjectExpertsIntegration(projectRoot)  // 确保 agents/*.md 最新

3. Main: 构建 userPrompt
   - 若 selectedExpertIds.length > 0，追加 turn preamble（见 §7.3）
   - 保留现有 intensive reading / paper snippets 等 appendix

4. Main: ACP session prompt
   - expert-team: OpenCode session 使用 orchestrator agent（ACP 层指定 agent / mode — 实现时对接 OpenCode session create 参数）
   - 注入 orchestrator 级 modules（getOrchestratorRuntimeFilters）
   - **不** compose profile-overlay

5. OpenCode 执行
   - Orchestrator 读 expert descriptions → 自主 task
   - 或响应用户 @Expert preamble → 优先 task 指定 experts

6. EventMapper
   - 子 session parentSessionId → 父 tabId
   - task 工具 backfill 时保留 subagent_type = expert id
   - 可选：markSubAgentSession(childId) 双保险
```

### 7.3 多 `@Expert` turn preamble

当用户 `@Citation Auditor` + `@Literature Scout` 时，在 user message 末尾追加（英文，供模型读）：

```markdown
---
**Expert team invocation (this turn)**
The user explicitly requested these experts for this message:
- @citation-auditor — Citation Auditor: <description>
- @literature-scout — Literature Scout: <description>

Delegate to each listed expert via the Task tool with a focused sub-prompt.
Synthesize their outputs in your final reply unless the user asked for separate sections.
---
```

**OpenCode 行为：** 文档说明用户 `@` 可直调 subagent；Prism preamble 强化 Orchestrator 在本 turn 必须 task 所列专家。两者并存。

### 7.4 Agent 模式（保留路径）

- `chatMode === "agent"`：`chat:send` **不**切换 OpenCode orchestrator。
- 可选保留 legacy `@Profile` → `profile-overlay`（Persona，非 subagent）。V1 可继续支持，Settings 文案改为「Persona（Agent 模式）」与 Expert 区分。
- 不在 Agent 模式 sync expert 为强制 task；experts 仍 sync 到 userData（供 Expert team 与其他 OpenCode 入口使用），但不改变 primary。

### 7.5 Expert 变更与 reload

| 触发 | 动作 |
|------|------|
| 项目 open / prewarm | `refreshProjectExpertsIntegration` |
| Settings 保存 expert | sync + `reloadAfterExpertsIntegration`（若 agents 变更） |
| 切换项目 | 清理旧 slice + sync 新项目 + reload |
| Git checkout 含 `.prismnext/agent/experts/` | debounced refresh（仿 `scheduleSkillsRefresh`） |

---

## 8. 与 legacy Agent Profiles 的迁移

| 旧 | 新 |
|----|-----|
| `resources/profiles/citation-auditor` | `resources/experts/citation-auditor` |
| `resources/profiles/literature-scout` | `resources/experts/literature-scout` |
| `resources/profiles/academic-writer` | `resources/orchestrators/academic-writer` |
| `profiles-sync.ts` | `experts-sync.ts` + `orchestrators-sync.ts`（或单模块 `agent-team-sync.ts`） |
| `agent-profiles.ts` 类型 | `agent-experts.ts` / `agent-orchestrators.ts` |
| `@profile` mention | Expert team：`@expert`；Agent 模式：可保留 `@persona` 或逐步改名 |
| `ProfileSelect` toolbar | Expert team 下隐藏；Agent 模式可选保留 Persona 选择 |
| `profiles-manifest.json` | 拆为 `experts-manifest.json` + `orchestrators-manifest.json` |

**兼容期（一个 minor 版本）：**

- IPC `agentListProfiles` 等可 thin-wrapper 到 experts+orchestrators，标记 `@deprecated`。
- 读取旧 `profiles-manifest.json` 一次迁移写入新 manifest（main 启动 migration）。

**Academic Writer instructions 更新：** delegate 文案改为「在 Expert team 模式下使用 Task 工具调用 `<expert-id>`」。

---

## 9. UI / UX

### 9.1 Composer

- **Chat mode**（已有）：`Agent` | `Expert team`。
- **Expert team placeholder**（已有）：`@ experts to collaborate — model per expert preset`。
- **Mention dropdown**：Expert team 下列出 enabled experts（icon 区分 builtin/custom）；Agent 模式列出 Personas（若保留）或隐藏 profile 段。
- **多 chip**：同一 draft 可含多个 `@Expert`；发送前校验 expert-team 下至少 zero experts（允许纯 orchestrator 自主调度）。

### 9.2 TaskWidget

- `AGENT_META` 扩展：内置 OpenCode 类型 + **动态 expert id**（从 `agentListExperts` 缓存 label/description）。
- Label：`Task @Citation Auditor` 而非 `Task @General`。
- 子 session 错误时在 widget 内展示 expert id + prompt 摘要。

### 9.3 Settings → Agent

分区：

1. **Orchestrators** — 列表、默认 orchestrator、编辑 builtin override、instructions 预览。
2. **Experts** — 列表、启用/禁用、新建 custom expert、编辑 model/permissions/modules。
3. **Agent mode personas**（可选折叠）— legacy profile overlay 说明。

### 9.4 Chat tab 状态（Zustand）

```typescript
interface ChatTab {
  // existing...
  chatMode: "agent" | "expert-team";
  orchestratorId: string | null;     // expert-team；null → manifest default
  /** @deprecated */ activeProfileId?: string | null;  // agent mode persona
}
```

---

## 10. IPC & Main 模块

| 通道 / 模块 | 职责 |
|-------------|------|
| `experts:list`, `experts:get`, `experts:save`, `experts:delete` | Expert CRUD |
| `orchestrators:list`, `orchestrators:get`, `orchestrators:setDefault` | Orchestrator 管理 |
| `experts:refreshIntegration` | 手动 refresh + reload |
| `src/main/services/experts-sync.ts` | 读定义 → 写 agents/*.md + sync state |
| `src/main/services/project-experts-refresh.ts` | debounce + notify + reload（仿 skills） |
| `src/main/ipc/chat.ts` | expert-team 分支：orchestratorId、selectedExpertIds |
| `src/main/acp/service.ts` | session create 指定 agent；reload hooks |

---

## 11. 权限与安全

- Expert `permission` 默认比 Orchestrator 更严格（如 citation-auditor：read/grep allow，edit deny unless user asks）。
- Orchestrator `permission.task` 仅 allow 项目 enabled experts。
- Prism tool permission registry **不变**；OpenCode frontmatter 管 subagent 内工具，Prism gate 管 ACP 请求。
- Custom expert 的 bash/edit 默认 `ask` 或 `deny`，Settings 编辑器显式开启。

---

## 12. 错误处理

| 场景 | 行为 |
|------|------|
| Sync 写 agents 失败 | toast + log；chat send 阻塞并提示「Expert 配置未能同步」 |
| Expert id 含非法字符 | 保存时 reject（slug：`[a-z0-9-]+`） |
| `@` 已 disabled expert | Composer 发送前过滤并 toast |
| OpenCode task 目标 expert 不存在 | TaskWidget error；Orchestrator 可见 OpenCode 返回 |
| 切换项目 mid-stream | 不打断当前 tab stream；下次 send 用新项目 experts |

---

## 13. 测试策略

| 层 | 用例 |
|----|------|
| `tests/main/experts-sync.test.ts` | markdown 生成、permission.task、builtin override、disabled expert 不出现在 sync |
| `tests/main/experts-sync.test.ts` | 项目 A → B 切换清理 agentFiles |
| `tests/main/orchestrators-sync.test.ts` | default orchestrator、allowedExperts |
| `tests/renderer/compile-composer-experts.test.ts` | 多 `@Expert` → selectedExpertIds + preamble |
| `tests/renderer/chat-mode-expert-team.test.ts` | expert-team send  payload 含 orchestratorId |
| 手动 | Expert team 发消息 → TaskWidget 出现 → 子 session 不污染 sidebar |

---

## 14. 分阶段交付

| Phase | 交付物 | 用户可见 |
|-------|--------|----------|
| **P0** | experts-sync + userData agents + project refresh | 无（基础设施） |
| **P1** | Expert team send + orchestrator + multi `@` | Expert team 可委派内置 2 expert |
| **P2** | Settings Expert 编辑器 + custom expert | 用户自定义 expert |
| **P3** | TaskWidget 动态 label + tab orchestrator 选择 + migration | 完整专家团体验 |
| **P4**（可选） | Agent mode Persona 与 Expert 文案完全分离 | 文档与 UI 清晰 |

---

## 15. 开放问题（实现前可定）

1. **OpenCode session 如何指定 primary agent id** — 实现 Task 1 时读 ACP `session/new` 参数与 OpenCode 文档；若仅支持 config default，则 expert-team 模式通过 `opencode.json` 的 `default_agent` 临时 patch + reload。
2. **是否 allow Orchestrator task OpenCode 内置 `explore`** — V1 建议 deny；学术 expert 优先。
3. **Legacy `resources/profiles/` 删除时机** — P3 完成后删 bundle + migration 代码。

---

## 16. 成功标准

- [ ] 用户在 Expert team 模式 `@Citation Auditor` 发送后，出现 `Task @Citation Auditor` widget，且子 session 消息在同一 tab。
- [ ] 用户不 `@` 任何 expert，Orchestrator 仍可因任务自主 `task` 到 `literature-scout`。
- [ ] 用户创建 custom expert 保存后，OpenCode agents 目录出现对应 md，且可被 task。
- [ ] 切换项目后，旧项目 custom expert md 从 userData agents 清除，新项目 expert 生效。
- [ ] 项目目录无 `.opencode/agents/` 写入。
