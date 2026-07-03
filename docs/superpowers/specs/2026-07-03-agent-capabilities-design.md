# Agent Capabilities（L3）— 能力面与 Prompt 边界

> **日期：** 2026-07-03  
> **状态：** Approved（与 `2026-07-03-agent-prompt-stack-design.md` 配套）  
> **层级：** L3 Capabilities — **能调用什么**，不是 **怎么说**

---

## 1. 为什么单独写 Capabilities

Prompt Stack（L1）回答「模型系统侧看到什么文字」；Capabilities（L3）回答「模型能做什么」。  
两者容易混：

| 误区 | 正确做法 |
|------|----------|
| 在 Instructions 里复制 tool JSON schema | Tool `description` + OpenCode 注册即契约 |
| 把 slash command 用法写进 `_prism-system.md` | Commands 由用户触发，不进 system prompt |
| 勾选 Skill 后在 Instructions 再写一遍 SKILL.md | Skill 正文由 OpenCode 按需加载；Profile 只列 **元数据引用** |
| 用 Knowledge Module 教 `literature-search` 参数 | Module 写 **工作流与引用格式**；参数在 tool schema |

本 spec 给 Settings、Agent 编辑器和代码 review 一个 **L3 对照表**。

---

## 2. L3 四类能力

```
┌─────────────────────────────────────────────────────────┐
│ L3 Capabilities                                          │
├──────────────┬──────────────────────────────────────────┤
│ Tools        │ OpenCode ACP 工具（Prism 自定义 + 内置）   │
│ Skills       │ `.prismnext/agent/skills/<id>/SKILL.md`   │
│ MCP          │ 用户配置的 MCP server / tool allowlist    │
│ Commands     │ Slash commands（composer `/` 展开）        │
└──────────────┴──────────────────────────────────────────┘
         │                              │
         ▼                              ▼
   OpenCode runtime              不进 system prompt
   + permission registry         （L4 用户显式触发）
```

---

## 3. Tools vs Knowledge Modules

| 维度 | **Tools** | **Knowledge Modules** |
|------|-----------|------------------------|
| **载体** | `@opencode-ai/plugin` 注册；`src/main/tools/` | `src/main/prompts/modules/*.ts` |
| **注入** | OpenCode tool list（模型见 name + description + args） | `_prism-system.md` 或 `agent.md` inline（`profileOnly`） |
| **维护** | tool 文件 + `opencode-tools-config.ts` sync | PromptManager + Settings 开关 |
| **适合写** | 参数、返回 shape、错误 hint | 引用格式、委派策略、库检索工作流 |
| **不应写** | UI Popover、Task enrich 表 | Tool JSON schema 全文 |

### Prism 自定义 Tools（节选）

| Tool | 职责 | Module 分工 |
|------|------|-------------|
| `literature-search` | 库内检索（bridge → sqlite） | `literature-library`：何时搜、如何 cite `[@bibkey]` |
| `literature-read` | 单篇 metadata + highlights | 同上 |
| `literature-read-pdf` | PDF 正文（MinerU / extract） | `literature-intensive`（per-turn）+ intensive gate |
| `literature-cite` | 插入 `\cite{}` 到 .tex | 不在 module 重复 BibTeX 语法 |
| `literature-stage` | 会话 staging `[n]` | `chat-citation-staging`：web 发现 → stage → `[n]` |
| `bash` / `move` / `delete` | 文件与 shell | permission-modes + Project Rules |
| `question` | 向用户提问 | UI 在 renderer；tool 只返回结构 |

**Bridge 模式：** literature tools 在 OpenCode Bun 侧写 `*.request.json`，Electron main `literature-bridge.ts` 执行并回写 `*.result.json`。  
Capability 边界在 **tool description**；业务规则在 **modules + L0 enrich**。

---

## 4. Skills

| 项 | 说明 |
|----|------|
| **存储** | `<project>/.prismnext/agent/skills/<id>/SKILL.md` |
| **Manifest** | `.prismnext/agent/skills-manifest.json` + OpenCode `skills.paths` |
| **全局配置** | `<userData>/opencode-server/config/opencode/opencode.json` |
| **Profile 引用** | `agent.md` 末尾 `Enabled skills:` 元数据行（非全文 inline） |
| **Session 范围** | OpenCode  largely session-scoped — 改 skill 后需新 chat tab |

**不要在 Instructions 复制 SKILL.md。**  
Orchestrator/Expert 勾选 skill = allowlist；正文由 OpenCode 在 tool/skill 路径加载。

---

## 5. MCP

| 项 | 说明 |
|----|------|
| **配置 UI** | Settings → MCP servers（`mcp-servers-store`） |
| **运行时** | OpenCode 子进程；与 Prism IPC 无直接耦合 |
| **Prompt 影响** | 通常 **无** 额外 system 段落；server 自带 tool descriptions |
| **权限** | `tool-permission-registry` + ACP permission gate（与 bash 同类） |

MCP tool 名进入 activity 流；**不**写入 `_prism-system.md`。

---

## 6. Commands（Slash）

| 项 | 说明 |
|----|------|
| **注册** | `src/main/commands/`（parser, expander, registry, builtins） |
| **触发** | Composer `/command` — **用户显式** |
| **展开** | `commands:expand` IPC → 注入 **user turn**（L4），非 instructions |
| **模板** | `src/main/commands/` + 用户自定义 JSON import |

**原则：Commands 不进 L1 system prompt。**  
若某 workflow 应「总是知道」，用 **Knowledge Module** 或 **Project Rule**，不是 slash command 文档。

---

## 7. 与 Agent Profile（L2）的交界

`orchestrator.json` / `expert.json` 字段：

| 字段 | 层 | 说明 |
|------|-----|------|
| `instructions.md` | L2 | 人设、委派语气、领域策略 |
| `modules[]` | L1（profile 路径） | `profileOnly` modules → `agent.md` inline |
| `rules[]` | L1（per-turn） | allowlist → `buildPromptContext({ ruleAllowlist })` |
| `skills[]` | L3 | allowlist 元数据 |
| `allowedExperts[]` | L2+L3 | Task 委派白名单 |
| `tools` / permission | L3 | OpenCode frontmatter + Prism permission modes |

`appendCapabilityRefs()` 在 `agent.md` 生成 **索引行**，不是能力全文。

---

## 8. 与 L0 产品契约

L0（main + renderer）**不**通过 Instructions 配置：

| 行为 | 实现 home |
|------|-----------|
| `[@bibkey]` 可点 Popover | `remark-library-cite-refs.ts` + literature store |
| `[n]` Session citations | `session-citations-context.ts` + staging bridge |
| Task 完成 enrich 表 | `enrichTaskToolResultContent` + `library-task-context.ts` |
| Task 子 agent activity 展开 | `TaskWidget` + `AssistantBlockList` |
| Permission 门 | `permission-gate-panel` + `acp/permission.ts` |

**L3 tool 产出** 可被 **L0 enrich** 消费（例：Task 内 `literature-search` hits → 完成时 append library 表）。

---

## 9. Settings 心智模型（给用户）

| Settings 区 | 层 | 用户问题 |
|-------------|-----|----------|
| System prompt / Knowledge modules | L1 | 「所有 chat 默认知道什么」 |
| Project Rules | L1（per-turn） | 「这条规则每轮要不要带上」 |
| AGENTS.md | L1 | 「这个项目结构与习惯」 |
| Orchestrator / Expert 编辑器 | L2 + L1 subset | 「这个角色是谁、带哪些 module/rule/skill」 |
| MCP servers | L3 | 「连哪些外部工具」 |
| Skills 面板 | L3 | 「项目里有哪些 skill 包」 |
| Commands | L3 + L4 | 「/ 快捷指令」 |
| Preview stack | L1 调试 | 「实际注入路径 truth」 |

---

## 10. 检查清单（PR / 配置 review）

1. Instructions 是否重复了 module 里的 cite / staging 条文？→ 删，改指向 module。
2. 新 tool 是否只在 `src/main/tools/` 写 schema，而未塞进 `_prism-system`？→ 正确。
3. 新 skill 是否只更新 manifest + profile 勾选，而未粘贴 SKILL 全文到 Instructions？→ 正确。
4. 新 slash command 是否只 expand 到 user message，而未 sync 到 prompt file？→ 正确。
5. UI 行为（可点、enrich 表）是否落在 main/renderer，而非 agent.md？→ 正确。

---

## 11. 相关代码索引

|  Concern | Path |
|----------|------|
| Tools 注册 | `src/main/tools/`, `services/opencode-tools-config.ts` |
| Tool 权限 | `services/tool-permission-registry.ts`, `acp/permission.ts` |
| Skills sync | `services/skills-sync.ts` |
| Rules sync | `services/rules-sync.ts` |
| Experts / Orchestrator sync | `services/experts-sync.ts` |
| Commands | `src/main/commands/` |
| Stack preview | `src/main/prompts/stack-preview.ts` |
| Prompt 五层设计 | `specs/2026-07-03-agent-prompt-stack-design.md` |
