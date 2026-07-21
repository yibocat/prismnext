# Agent Prompt Stack — 认知对齐与架构改进

> **日期：** 2026-07-03  
> **状态：** Approved for implementation planning（先对齐认知 → 再按计划执行）  
> **Enforcement / Hard vs Soft / 体积预算 / 瘦身：** 见 **`2026-07-21-prompt-hard-soft-architecture-design.md`**（实现计划：`plans/2026-07-21-prompt-hard-soft-architecture.md`）  
> **关联：**  
> - `2026-06-19-prompt-system-redesign.md`（Layer 体系 — 部分已落地，部分已演进）  
> - `2026-07-03-expert-team-subagents-design.md`（Orchestrator / Expert sync）  
> - `2026-07-01-chat-citation-staging-design.md`（会话引用产品契约）  
> - `.cursor/rules/opencode-and-skills-layout.mdc`

---

## 1. 为什么要写这份文档

Prism 同时存在 **Prompt 层、Agent 人设、Knowledge Modules、Project Rules、Tools、Skills、MCP、Commands**，以及 **Chat 里可点击的引用交互**。  
若边界不清，会出现：

- 在 **Agent Instructions** 里重复写 `[@bibkey]`、`[n]`、Task 收尾表；
- 以为改了 Instructions 就能改 Popover / Session citations 行为；
- Settings 里勾选的 **Rules 子集** 与 **Modules 子集** 实际注入路径不一致；
- Orchestrator / Expert 与 `_prism-system.md` **重复注入** 同一 module。

**本 spec 的目标：** 团队对「什么是什么、写在哪、谁生效」有一致 mental model；已知设计债列清；改进方向可执行。

---

## 2. 五层认知模型（先记住这个）

写任何配置或代码前，先问属于哪一层：

| 层 | 名称 | 回答的问题 | 谁维护 | Agent Instructions 能改吗 |
|----|------|------------|--------|----------------------------|
| **L0** | **产品契约** | 回复里什么可点、Task 结果 enrich 什么 | main + renderer | **不能** |
| **L1** | **Prompt Stack** | 模型系统侧看到什么文字 | PromptManager + OpenCode instructions | **不应**重复条文 |
| **L2** | **Agent Profile** | 这个角色是谁、能委派谁、权限边界 | Orchestrator / Expert 编辑器 | **只写人设与策略** |
| **L3** | **Capabilities** | 能调用什么工具 / skill / MCP / command | Tools 注册、Skills manifest、MCP 配置 | 通过勾选 scope，不复制 schema |
| **L4** | **User Turn** | 这一轮用户说了什么 | Composer、`chat:send` 追加块 | 每轮变化 |

**原则：** L0 与 L1 是产品底座；L2 是薄层；L3 是能力面；L4 是对话内容。  
**避免硬编码** = 同一规则 **单一来源**（module / tool schema / enrich 代码），不在每个 Agent 的 Instructions 里复制。

---

## 3. Prompt Stack（L1）— 实际怎么拼

### 3.1 两条 OpenCode `instructions` 文件（稳定、按项目）

OpenCode 进程级配置指向（见 `prompt-sync.ts`）：

| 文件 | 内容 | 维护方 |
|------|------|--------|
| `.prismnext/agent/AGENTS.md` | 项目级说明（结构、约定、组内习惯） | 用户 / `/setup` |
| `.prismnext/agent/_prism-system.md` | **生成文件**，Prism 写入，勿手改 | `syncProjectPromptFile()` |

`_prism-system.md` = `PromptManager.composeStableSystem()`，**不含** AGENTS.md，**不含** Project Rules：

| Priority | Layer | 进入 `_prism-system` |
|----------|-------|----------------------|
| 0 | `core-persona` | ✓（或 Settings 里的 Custom System Prompt **替换**默认 persona） |
| 1 | `agents-md` | ✗（独立 AGENTS.md） |
| 2 | `active-modules` | ✓（全局 enabled 且非 `profileOnly` 的 modules） |
| 2.5 | `custom-rules` | ✗（每轮注入，见下） |

**Settings → Prompts & Rules → System prompt** = Layer 0 的可选覆盖。  
**Settings → Knowledge modules** = 全局开关；关掉后所有 Agent profile 也无法选该 module。

### 3.2 Orchestrator / Expert 的 `agent.md`（userData，按项目 sync）

路径：`<userData>/opencode-server/config/opencode/agents/{id}.md`  
由 `syncProjectExpertsToOpencode()` 生成。

| 块 | 来源 | 作用 |
|----|------|------|
| YAML frontmatter | `expert.json` / `orchestrator.json` | `mode`、`permission`、`model`… |
| Instructions 正文 | `instructions.md` | **L2 人设** |
| Available experts | orchestrator 专用 | Task 白名单说明 |
| **Module 正文 inline** | profile 勾选的 `modules[]` | `composeProfileModulePrompts()` |
| 元数据行 | `appendCapabilityRefs` | `Knowledge modules:` / `Enabled skills:` / `Active rules:` |

Subagent（Expert）**主要**靠这份 `agent.md` + OpenCode 仍会加载项目 `instructions`（AGENTS + `_prism-system`）。

### 3.3 每轮 `chat:send` 额外注入（L4 侧车）

| 注入物 | 机制 | 属于 |
|--------|------|------|
| 用户 Composer 文本 | `sendPrompt` 主 text | L4 |
| Intensive reading 提醒 | 拼进 user prompt | L1 工具契约的 per-turn 提醒 |
| Session citations 表 | `buildSessionCitationsTurnAppendix` | **L0** enrich |
| Project Rules | 独立 user block，`_meta.prism = project-rules` | L1 `custom-rules` 层 |
| Expert team preamble | 多个 `@Expert` 时拼进 user prompt | L2 编排提示 |

**注意：** `assembledPrompt = promptManager.compose(ctx)` 在 `chat:send` 里仍会算一遍，但稳定系统内容主要靠 `_prism-system.md` 文件 + OpenCode reload；Rules 走 per-turn block，**不是** `_prism-system` 的一部分。

### 3.4 Knowledge Module 的两种作用域

| 作用域 | 注入路径 | 开关 |
|--------|----------|------|
| **Global** | `_prism-system.md` 的 `active-modules` 层 | Settings → Prompts & Rules 每个 module Switch |
| **Profile** | Orchestrator/Expert `agent.md` inline | Agent 编辑器 Knowledge modules 多选 |
| **Profile-only** | 仅 profile inline（如 `task-delegation`） | 只在 orchestrator `modules[]` 里挂名；不进 global `_prism-system` |

Module 正文维护在 `src/main/prompts/modules/*.ts`（单一来源）。

---

## 4. Rules（L1）— 与 Modules、Instructions 的区别

| | Project Rules | Knowledge Modules | Agent Instructions |
|--|---------------|-------------------|-------------------|
| **存储** | `.prismnext/agent/rules/<id>/RULE.md` | `src/main/prompts/modules/` | `resources/.../instructions.md` 或 custom |
| **粒度** | 用户/项目自定义 | 产品内置领域知识 | 角色/委派 |
| **示例** | 「本 project 只用 natbib」 | `[@bibkey]` / `[n]` binding | 「你是 library scout，只查库」 |
| **注入** | 每轮 `projectRulesPrompt` | stable + profile inline | `agent.md` 正文 |

Agent 编辑器里的 **Rules 多选** 设计意图：Orchestrator/Expert 只启用 rules 子集。  
**当前实现缺口（设计债）：** ~~`getPromptProjectRules()` 未读取 orchestrator `rules[]`~~ → ✅ Phase 1.2：`chat:send` 按 orchestrator profile `rules[]` 过滤（空=全部 enabled rules）。

---

## 5. Agent Profile（L2）— Orchestrator / Expert 编辑器在组装什么

**不是**重写整个 system prompt，而是 **scoped 能力 + 薄 Instructions**：

| 编辑器区块 | 设计意图 | 实际注入 / 生效 |
|-----------|----------|-----------------|
| Instructions | 角色、委派策略、禁止事项 | `agent.md` 正文 |
| Knowledge modules | 从全局已开 modules 中选子集 | `agent.md` inline module 正文 |
| Skills | skill 白名单（空=全部） | `refreshProjectSkillsIntegration` + 元数据行 |
| MCP servers | MCP 白名单（空=全部） | session MCP reload + 元数据行 |
| Rules | project rules 子集（空=全部） | ⚠️ **未接通** chat 过滤 |
| permission | edit/bash/task… | OpenCode frontmatter |
| allowedExperts | orchestrator 专用 | Task permission + Available experts 段 |

**Agent 模式 vs Expert team 模式：** 见 `2026-07-03-expert-team-subagents-design.md`。Expert team 下主 session 绑定 Orchestrator；Expert 经 Task 或 `@` 调用。

---

## 6. Capabilities（L3）— 与 Prompt 分离

|  primitive | 是什么 | 进 system prompt 吗 | 配置位置 |
|-----------|--------|---------------------|----------|
| **Tools** | OpenCode 工具（含 Prism 自定义 literature-*） | **否** — schema 在 tool 注册；**binding 行为**在 modules | `src/main/tools/` + `opencode-tools-config` |
| **Skills** | OpenCode SKILL.md 能力包 | Skill 正文由 OpenCode 读；Prism 管 manifest 路径 | `.prismnext/agent/skills/` |
| **MCP** | 外部 MCP server 工具 | 不进 Prism prompt | Settings → Tools & MCP |
| **Commands** | Composer `/` 展开为 user 文本 | **否**（除非 command 故意 inject） | `.prismnext/agent/commands/` |

**分工：**

- **Tool schema** — 参数、何时调用、返回字段（给模型看）。
- **Module binding** — 产品级流程（先 stage 再 `[n]`、库内用 `[@bibkey]`）。
- **Instructions** — 何时委派 @library-scout vs @literature-scout。

---

## 7. 产品契约（L0）— Chat 交互「死的」，不随 Agent 变

以下行为由 **代码保证**；Agent Instructions 怎么写都不应成为唯一依赖：

| 能力 | 实现 | 模型侧（可选） |
|------|------|----------------|
| `[@bibkey]` 可点 Popover | `remark-library-cite-refs` + `LibraryCitationInline` | module 建议输出 `[@bibkey]` |
| `[n]` 可点 | session staging + remark | module 建议输出 `[n]` |
| `literature-stage` → 父 session staging | main tool + bridge | tool + module |
| Task 完成 append Session citations 表 | `session-citations-context` + `event-mapper` enrich | 系统自动 |
| Task result 写回 OpenCode SQLite | `patchSessionToolOutput` | 系统自动 |
| Task 展开 subagent 活动 | TaskWidget UI | **不进** orchestrator prompt |
| 权限 Ask / Accept | permission registry | 与 prompt 无关 |
| Proposed changes diff | changes-store + merge UI | 与 prompt 无关 |

**设计原则：** Module 里写输出格式，是为了 **parser 有东西可抓**；**能不能点、表从哪来** 是 L0。  
用户创建 Orchestrator/Expert 时 **不应** 为 UI 交互写小心翼翼的规则。

---

## 8. 已知设计问题（改进动机）

按优先级：

### P0 — 认知与行为不一致

| # | 问题 | 现状 | 目标 |
|---|------|------|------|
| D1 | **Module 双份注入** | ~~主 session 全局 + agent.md inline 重复~~ | ✅ Plan A：`profileOnly` modules 仅 agent.md；`_prism-system` 仅 workspace-folders |
| D2 | **Agent Rules 子集未接通** | ~~UI 可勾选；chat 仍注入全部 rules~~ | ✅ `chat:send` 按 orchestrator `rules[]` 过滤 |
| D3 | **Instructions 重复 module 条文** | ~~部分 builtin 仍写 cite 格式~~ | ✅ audit + `instructions-audit.test.ts` |
| D4 | **幽灵 module 名** | ~~`literature-intensive`、`prism-tools` 在 orchestrator.json~~ | ✅ 已清理；早期 academic 测试 modules 已删除 |

### P1 — PromptContext 与 profile 未统一

| # | 问题 | 现状 | 目标 |
|---|------|------|------|
| D5 | **`buildPromptContext` 无 orchestratorId** | `_prism-system` 无法按 tab orchestrator  scoped modules | sync / compose 时传入 active orchestrator modules |
| D6 | **Subagent module 依赖** | Expert 靠 `agent.md` inline + 可能仍读全局 `_prism-system` | Expert **仅** profile modules + AGENTS.md；不重复 global 学术 modules |
| D7 | **`assembledPrompt` 与 stable 文件关系模糊** | UI 预览与 OpenCode 实际读的文件可能不一致 | 单一 truth：Preview = 将写入 OpenCode 的内容 |

### P2 — Settings UX 与命名

| # | 问题 | 目标 |
|---|------|------|
| D8 | 「System prompt」vs「Project instructions」vs「Agent Instructions」易混 | Settings 与 Agent 编辑器加简短「注入路径」说明 |
| D9 | Knowledge modules 全局 vs profile 两层开关 | UI 标明：全局=可用池；Profile=本 Agent 选用 |

### P3 — 文档漂移

| # | 问题 | 目标 |
|---|------|------|
| D10 | `2026-06-19-prompt-system-redesign.md` 层顺序、user-override 与现实现不一致 | 本文档 supersede 注入路径描述；旧 spec 标注 Historical |

---

## 9. 目标架构（改进后）

### 9.1 Prompt 注入矩阵（目标态）

| 内容 | Orchestrator 主 session | Expert subagent | 每轮 user block |
|------|----------------------|-----------------|-----------------|
| Core persona / custom system | `_prism-system` | `_prism-system`（或 subagent 精简版，待定） | — |
| AGENTS.md | instructions | instructions | — |
| Global modules（workspace-folders 等 baseline） | `_prism-system` | AGENTS 同级 | — |
| Profile modules（citations, literature-library…） | **仅** orchestrator `agent.md` | **仅** expert `agent.md` | — |
| profileOnly modules（task-delegation） | orchestrator `agent.md` | — | — |
| Project rules（scoped） | per-turn block | per-turn 或 subagent 不含（待定） | ✓ |
| Session citations appendix | — | — | ✓ enrich |
| Instructions 人设 | orchestrator `agent.md` | expert `agent.md` | — |

### 9.2 「写在哪」决策树

```
要改 Chat 里引用能不能点？
  → L0 renderer / enrich / staging（不是 Instructions）

要改模型该怎么 cite / stage？
  → L1 Knowledge Module（单一 TS 源）

要改「这个项目」的写作约定？
  → AGENTS.md 或 Project Rule

要改「这个 Expert 负责什么」？
  → Agent Instructions（短）

要改工具参数或返回值？
  → Tool schema（L3）

要改 Composer /foo 行为？
  → Command 定义（L3）
```

### 9.3 Module 注册规范（避免再乱）

每个 module 在 `ALL_MODULES` 必须声明：

- `key`, `label`, `description`, `enabled` 默认值  
- `profileOnly?: boolean` — 仅 orchestrator/expert profile 注入  
- `prompt` 或 `build` — 正文单一来源  
- **禁止**在 `resources/**/instructions.md` 复制同一 binding 段落

Citation 相关 module 分工（保持）：

| Module | 负责 |
|--------|------|
| `chat-citation-staging` | 外部文献 `[n]` + stage 流程 + external Task 收尾 |
| `literature-library` | 库内 `[@bibkey]` + library Task 收尾 |
| `task-delegation` | orchestrator Task 路由与合成纪律（profileOnly） |
| `citations` | LaTeX 稿 `\cite{}` / BibTeX（手稿，非 chat marker） |

---

## 10. 与历史文档关系

| 文档 | 关系 |
|------|------|
| `2026-06-19-prompt-system-redesign.md` | Layer 思想仍有效；**注入路径以本文为准** |
| `2026-06-21-agent-profiles-design.md` | Profile overlay 已 supersede → Expert/Orchestrator |
| `2026-07-03-expert-team-subagents-design.md` | L2 sync 与 Task 链路；配合本文 L1/L0 |
| `2026-07-01-chat-citation-staging-design.md` | L0 会话引用；module 是 L1 binding |

---

## 11. 非目标（本改进不做）

- 重写 OpenCode ACP 协议  
- 把 Cursor `.cursor/rules` 自动读进 runtime  
- 用户可视化编辑 module 正文（仍走代码 + Settings 开关）  
- 一次性重写所有 builtin Instructions（分阶段 audit）

---

## 12. 验收标准（改进完成后）

1. 新建 custom Expert **只写 Instructions + 勾选 modules**，无需写 cite 格式即可正确 `[n]` / `[@bibkey]` 行为。  
2. Settings Preview 与 OpenCode 实际 instructions **一致**（或明确标注差异）。  
3. Agent Rules 子集与 chat 注入 **一致**。  
4. Orchestrator 主 session **无 duplicate module 段落**（token 与认知双收）。  
5. 团队文档：任何人 5 分钟内能答「AGENTS.md vs System prompt vs Instructions 区别」。

---

## 附录 A — 关键代码索引

|  Concern | Path |
|----------|------|
| Layer 注册 | `src/main/prompts/index.ts` |
| Module 注册 | `src/main/prompts/modules/index.ts` |
| Stable 文件写入 | `src/main/services/prompt-sync.ts` |
| Project rules 读取 | `src/main/services/rules-sync.ts` |
| Agent sync | `src/main/services/experts-sync.ts` |
| chat:send 组装 | `src/main/ipc/chat.ts` |
| Citation enrich | `src/main/services/session-citations-context.ts` |
| Chat cite UI | `src/renderer/lib/markdown/remark-library-cite-refs.ts` |
