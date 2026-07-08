# Prism 平台外置能力 Phase 0 — 能力对照与 Backlog

**Date:** 2026-07-04  
**Updated:** 2026-07-08 — Sprint 0.3 ✅；对照代码库刷新 §3–§9 明细表  
**Status:** In progress — Phase 0 执行清单（**下一项：手动验收 + Phase A**）  
**Parent:** `2026-07-04-prism-academic-capability-stack-design.md`  
**Implementation plans:** `plans/2026-07-04-sprint-0.1-latex-agent-tools.md` · `plans/2026-07-07-sprint-0.2-research-brief.md` · `plans/2026-07-07-sprint-0.3-experiment-log.md`  
**Principle:** Plugin 是打包层；**先补 Platform（Tools + IPC 暴露 + Modules + Commands），再写厚 Skills/Experts，最后做 Extensions Pack。**

---

## 0. 2026-07-07 进度快照（相对原文档的变化）

| 维度 | 原文档（2026-07-05） | 当前 |
|------|----------------------|------|
| Sprint 0.1 写作链 | ✅ | ✅（`latex-bib-check` 已并入 `citation-health`） |
| Sprint 0.4 文献引用链 | 部分 | ✅ 核心完成（`citation-health` + `literature-export-bib`） |
| Sprint 0.5 `/bib-check` | ❌ P1 | ✅ 已实现 |
| Sprint 0.2 研究 brief | 下一项 | ✅ **已完成 2026-07-07** — 见 `plans/2026-07-07-sprint-0.2-research-brief.md` |
| Sprint 0.3 实验日志 | 待做 | ✅ **已完成 2026-07-08** — 见 `plans/2026-07-07-sprint-0.3-experiment-log.md` |
| Sprint 0.7 Experiments mode UI | P1 Settings 实验面板 | ✅ **Implemented 2026-07-08** — 见 `plans/2026-07-08-sprint-0.4-experiments-mode.md`（sprint 0.7） |
| Expert roster | 3 scout/auditor 型 | **5 认知型 expert** + orchestrator 重构 |
| Prompt modules | 6 个 | **+5**（`citation-audit`、`proactive-scheduling`、`research-reasoning`、`reply-depth`、`research-design`） |
| `core-persona` | LaTeX 写作助手 | **全科研闭环** agent 身份 |

**结论：** Platform Tools 路线（Sprint 0.1 → 0.4）基本按计划推进；**Idea 段 Platform P0 已完成（Sprint 0.2）**；**实验段 Platform P0 已完成（Sprint 0.3，2026-07-08）**——`methodology-auditor` 现有 `experiment-log` / `experiment-run` scaffold 支撑。

---

## 1. 产品定位（前提）

Prism 是 **科研闭环平台**，不是单纯 LaTeX 写作器：

```text
文献阅读管理 → Idea / 研究设计 → 分析 / 实验 → 写作 / 编译 → 审稿 / 发表
```

Agent 侧能力必须按这条链补全；缺一环则 Academic Plugin 只能是「空手册」。

---

## 2. 图例

| 符号 | 含义 |
|------|------|
| ✅ | 已有且 Agent 可触达（Tool 或稳定 IPC + Module/文档） |
| 🟡 | 产品有（UI/IPC/Expert/Skill），Agent **Platform 层未闭环** |
| ❌ | 缺失或仅 bash/泛泛 prompt |
| **P0** | Plugin 前必须做 |
| **P1** | Academic Core skill 深化依赖 |
| **P2** | 可延后 |
| ~~删除线~~ | 已被新实现取代（SUPERSEDED） |

**Agent 触达路径：**

- **Tool** — OpenCode `src/main/tools/*.ts`（Agent 直接调用）
- **IPC** — `electronAPI.*` / main services（需 Tool 桥接才进 Agent）
- **Module** — L1 prompt（`src/main/prompts/modules/` 或 `per-turn/`）
- **Command** — 用户 `/` 显式（`src/main/commands/builtin-commands.ts`）
- **Expert** — Task 子代理（`resources/experts/` → OpenCode `agents/*.md`）
- **Skill** — 按需加载（OpenCode `skill` 工具；非预注入 system prompt）

---

## 3. 闭环五段对照表

### 3.1 文献（Literature）— 相对最成熟

| 能力 | 产品 IPC / UI | Agent Tool | Module / Per-turn | 状态 | Backlog |
|------|---------------|------------|-------------------|------|---------|
| 库内全文检索 | `literature:search` | `literature-search` | `literature-library` | ✅ | — |
| 读元数据/摘要/高亮 | `literature:get` 等 | `literature-read` | `literature-library` | ✅ | — |
| 读 PDF 正文（MinerU） | extract 管道 | `literature-read-pdf` | `intensive-reading` (per-turn) | ✅ | P1: Module 摘要进 agent editor 说明 |
| 入库（DOI/arXiv） | `literature:addByDoi` 等 | `literature-add` | — | ✅ | P1: Module 一句「何时 add vs stage」 |
| 库内删除 | `literature:delete` | `literature-delete` | — | ✅ | — |
| 写入 .bib | `literature:cite` (UI) | ~~`literature-cite`~~ → `literature-export-bib` | `literature-library` | ✅ | 已统一为 export-bib 同步 |
| .tex ↔ library.db 引用检查 | citation health UI | `citation-health` | `citation-audit` + `literature-library` | ✅ | ~~`literature-cite-check`~~ / ~~`latex-bib-check`~~ 已合并 |
| 库 → 项目 .bib 批量同步 | `literature:exportBib` | `literature-export-bib` | `literature-library` | ✅ | — |
| 聊天外链 staging | staging bridge | `literature-stage` | `chat-citation-staging` | ✅ | — |
| 集合 / 标签 / 批注 | 大量 `literature:*` IPC | ❌（read 可读 highlights） | ❌ | 🟡 | **P1** `literature-annotate` 或 read 扩展 |
| 外部题录发现 | enrich 管道 | OpenCode `websearch` + `literature-stage` | staging module | 🟡 | **P1** 文档化 websearch → stage 纪律（tool workflowRules 已有） |
| PDF 导入 | `literature:ingestPdf` | ❌ | ❌ | 🟡 | **P2** Tool: `literature-ingest-pdf` |

**本段结论：** 文献仍是 Phase 0 **模板段**；引用链 A/B/C 已提前完成。剩余 P1 为 annotate / ingest 等补缝。

---

### 3.2 Idea / 研究设计 — Platform P0 已闭环（Sprint 0.2 ✅）

| 能力 | 产品 IPC / UI | Agent Tool | Module | Expert | 状态 | Backlog |
|------|---------------|------------|--------|--------|------|---------|
| 研究问题 / 假设结构化 | `researchBrief:*` + Settings **Edit brief** | `research-brief-read` / `research-brief-update` | `research-design` | — | ✅ | — |
| 贡献 / 创新点 map | 同上（brief 9 节模板） | 同上 | `research-design` | — | ✅ | — |
| FINER / gap 分析流程 | — | brief tools | `research-design` | coach 有 instructions | 🟡 | **P1** 深化 FINER checklist / skill |
| Expert：研究设计教练 | — | — | — | `research-design-coach` | ✅ | orchestrator 带 brief 快照委派；coach 诊断、orchestrator 写回 |
| Command `/brief` | action + AI template | — | — | — | ✅ | ensure + agent brief workflow |

**本段结论：** Sprint 0.2 ✅ **Idea Platform P0 已闭环**。剩余 **P1**：FINER/gap 流程加厚、相关 skill 产品化。

---

### 3.3 分析 / 实验 — Platform P0 已闭环（Sprint 0.3 ✅）

| 能力 | 产品 IPC / UI | Agent Tool | Module | Expert | 状态 | Backlog |
|------|---------------|------------|--------|--------|------|---------|
| 跑 shell / 脚本 | terminal IPC | `bash`（Prism bridge） | — | — | ✅ | P1: worktree 协作文档 |
| 实验记录 / 结果 registry | Settings → Workspace **Experiment** 目录 | `experiment-log` + `experiment-run` | `experiments` | — | ✅ | — |
| 方法/设计审计 | — | — | — | `methodology-auditor` | ✅ | Expert ✅；有 experiment tool + run log 快照支撑 |
| 结果 → 图表 → tex | 手动 | ❌ | ❌ | — | ❌ | **P1** Tool: `results-snapshot` |
| 可复现 / 环境记录 | ❌ | `experiment-run` env 探测 | `experiments` | — | ✅ | P1: pip freeze / `reproducibility` module |
| 数据统计报告 | ❌ | ❌ | ❌ | skill 文字 | 🟡 | **P1** skill `data-analysis-report` 同步 |

**本段结论：** Sprint 0.3 ✅ **实验段 Platform P0 已闭环**。`experiment-log` 提供 list/create/read/append_run/detect_env；`experiment-run` 封装「env 探测 → bash → append JSONL」一步完成；`experiments` module 绑定 orchestrator workflow；`methodology-auditor` instructions 增「以 structured run log 为事实依据」。剩余 P1 为 `results-snapshot`、`reproducibility` module、`data-analysis-report` skill 同步。**人类 UI 侧（Experiments RightArea mode）见 Sprint 0.7。**

---

### 3.4 写作 / LaTeX — Agent 链已闭环

| 能力 | 产品 IPC / UI | Agent Tool | Module | 状态 | Backlog |
|------|---------------|------------|--------|------|---------|
| 编辑 .tex | editor + read/write/edit | 内置 edit/read | `workspace-folders` + `latex-workspace` | ✅ | — |
| 编译 PDF | `compile:execute` | `latex-compile` | `latex-workspace` | ✅ | — |
| SyncTeX | `compile:synctex*` | ❌ | ❌ | 🟡 | **P1** Tool: `latex-synctex` |
| 解析主文件 / magic comment | compiler 内部 | `latex-root` | `latex-workspace` | ✅ | — |
| Bib / 引用一致性 | citation health UI | `citation-health` | `citation-audit` + `latex-workspace` | ✅ | ~~`latex-bib-check`~~ 已合并 |
| 编译问题诊断 | compile log UI | `latex-compile` | `latex-workspace` | ✅ | — |
| `/compile` command | action | — | — | ✅ | — |
| `/bib-check` command | action → citation health | — | — | ✅ | ~~Sprint 0.5 P1~~ 已完成 |

**本段结论：** Sprint 0.1 ✅；Sprint 0.5a ✅。SyncTeX Tool 仍留 P1。

---

### 3.5 审稿 / 发表 — Expert 超前，Platform 仍薄

| 能力 | 产品 IPC / UI | Agent Tool | Module | Expert | 状态 | Backlog |
|------|---------------|------------|--------|--------|------|---------|
| 引用 prose 审查 | citation health | `citation-health` | `citation-audit` | ~~`citation-auditor`~~ → `peer-reviewer` | ✅ | Expert 合并进 peer-reviewer |
| 结构诊断 | — | — | — | `structure-diagnostician` | 🟡 | Expert ✅；skill `paper-structure` |
| 模拟审稿 | — | — | — | `peer-reviewer` | 🟡 | Expert ✅；skill `peer-review-response` |
| 跨文献 synthesis | — | `literature-search/read` | `literature-library` | `literature-synthesizer` | 🟡 | Expert ✅；依赖 orchestrator 自己搜库 |
| Rebuttal 起草 | ❌ | ❌ | ❌ | skill 文字 | 🟡 | **P1** skill 包 + 写作 Tool |
| 格式 / venue checklist | ❌ | ❌ | ❌ | — | ❌ | **P1** `latex-venue-check` 或 references-only |
| git diff 变更摘要 | git IPC | bash? | ❌ | — | 🟡 | **P2** Tool: `git-diff-summary` |

**本段结论：** Phase C 专家多项**提前完成**；P0 不单独开大块，但 expert 效果仍受 **实验段 Platform 缺失**影响（Idea/brief 已补齐）。

---

## 4. 横切能力对照

### 4.1 OpenCode Custom Tools（当前）

| Tool | 类别 | 状态 | 备注 |
|------|------|------|------|
| `question` | utility | ✅ | |
| `bash` | utility | ✅ | 实验/脚本依赖 |
| `delete` / `move` | utility | ✅ | |
| `literature-search/stage/add/read/read-pdf/delete` | reference | ✅ | |
| `literature-export-bib` | reference | ✅ | Sprint 0.4 |
| **`citation-health`** | reference | ✅ | 合并 ~~cite-check~~ + ~~bib-check~~ + session 快照 |
| `latex-root` / `latex-compile` | compile | ✅ | Sprint 0.1 |
| ~~`literature-cite`~~ | — | SUPERSEDED | → `literature-export-bib` |
| ~~`latex-bib-check`~~ / ~~`literature-cite-check`~~ | — | SUPERSEDED | → `citation-health` |
| **`research-brief-read` / `research-brief-update`** | research | ✅ | Sprint 0.2 |
| **`experiment-log`** | project | ✅ | Sprint 0.3 |
| **`experiment-run`** | project | ✅ | Sprint 0.3 |

注册路径：`src/main/tools/` → `BUILTIN_TOOLS` → `tool-names.ts` → widget → `tool-permission-registry.ts`。

### 4.2 Prompt Modules（当前）

| Module | profileOnly | 状态 | 备注 |
|--------|-------------|------|------|
| `workspace-folders` | no（全局） | ✅ | |
| `research-reasoning` | no（全局） | ✅ | 2026-07 新增；跨文献 synthesis / 批判推理 |
| `reply-depth` | no（全局） | ✅ | 2026-07 新增；回复深度校准 |
| `chat-citation-staging` | yes | ✅ | |
| `literature-library` | yes | ✅ | |
| `citation-audit` | yes | ✅ | 2026-07 新增；绑定 `citation-health` workflow |
| `task-delegation` | yes | ✅ | |
| `latex-workspace` | yes | ✅ | Sprint 0.1 |
| `proactive-scheduling` | yes（orchestrator） | ✅ | 2026-07 新增；工具/委派主动调度 |
| `intensive-reading` | per-turn | ✅ | 不在 ALL_MODULES |
| **`research-design`** | yes（orchestrator） | ✅ | Sprint 0.2；绑定 brief tools |
| **`experiments`** | yes | ✅ | Sprint 0.3；绑定 experiment-log/run tools + methodology-auditor handoff |

`core-persona`（Layer 0）：✅ 已扩展为全科研闭环身份；详细推理规则在 `research-reasoning` module，避免重复。

### 4.3 Builtin Commands（当前）

| Command | 类型 | 状态 | 备注 |
|---------|------|------|------|
| `/setup` | action | ✅ | |
| `/compact` | action | ✅ | |
| `/undo` / `/redo` | action | ✅ | |
| `/compile` | action | ✅ | |
| `/bib-check` | action | ✅ | Sprint 0.5a 已完成 |
| **`/brief`** | action + AI template | ✅ | ensure + agent brief workflow |

### 4.4 Experts / Orchestrator（当前 — 2026-07 重构）

| 角色 | 聚焦 | 状态 | 备注 |
|------|------|------|------|
| `research-prism` | 全链 orchestrator | ✅ | modules: staging, citation-audit, literature-library, task-delegation, latex-workspace, proactive-scheduling, **research-design** |
| ~~`citation-auditor`~~ | — | SUPERSEDED | → `citation-audit` module + `peer-reviewer` |
| ~~`library-scout`~~ / ~~`literature-scout`~~ | — | SUPERSEDED | orchestrator 直接调 literature tools + `proactive-scheduling` |
| `literature-synthesizer` | 跨文献 synthesis | ✅ | skill: `literature-review` |
| `research-design-coach` | Idea / 假设压测 | ✅ | brief tool + Task 快照委派（Sprint 0.2） |
| `methodology-auditor` | 方法/统计/可复现审计 | 🟡 | Expert ✅；**缺 experiment-log** |
| `structure-diagnostician` | 结构/论证链诊断 | ✅ | skill: `paper-structure` |
| `peer-reviewer` | 模拟审稿 + 引用 prose | ✅ | skills: `peer-review-response`, `academic-citations` |

Task 委派：✅ `task-delegation` module + `task-orchestrator-gate`（deny OpenCode builtin subagents，allow Prism experts only）。

---

## 5. Phase 0 执行包（建议迭代顺序）

### Sprint 0.1 — 写作 Agent 闭环（P0）✅ **已完成 2026-07-05**

| # | 交付 | 状态 | 备注 |
|---|------|------|------|
| 0.1a | Tool `latex-root` | ✅ | |
| 0.1b | Tool `latex-compile` | ✅ | |
| 0.1c | Tool ~~`latex-bib-check`~~ → `citation-health` | ✅ | 引用链重构时合并 |
| 0.1d | Module `latex-workspace` | ✅ | |
| 0.1e | 测试 | ✅ | `latex-service.test.ts`, `latex-bib-check.test.ts`（service 层） |

### Sprint 0.2 — 研究 brief（P0）✅ **已完成 2026-07-07**

| # | 交付 | 类型 | 状态 |
|---|------|------|------|
| 0.2a | `.prismnext/research/brief.md` 模板 + project scaffold | Project | ✅ |
| 0.2b | Tool `research-brief-read` / `research-brief-update` | Tool | ✅ |
| 0.2c | Module `research-design` | Module | ✅ |
| 0.2d | Settings UI + `/brief` command | UI + Command | ✅ |

**Plan:** `docs/superpowers/plans/2026-07-07-sprint-0.2-research-brief.md`

**验收：** Agent 可读写 brief；`research-design-coach` Task 可基于 brief 而非纯口述。

### Sprint 0.3 — 实验日志（P0 最小）✅ **已完成 2026-07-08**

| # | 交付 | 类型 | 状态 |
|---|------|------|------|
| 0.3a | Workspace **Experiment** 目录下 `<slug>/` 实验岛 + `meta.json` + `runs.jsonl` + `scripts/` + `results/` | Project | ✅ |
| 0.3b | Tool `experiment-log`（list/create/read/append_run/detect_env）+ `experiment-run`（env→bash→append wrapper） | Tool | ✅ |
| 0.3c | Module `experiments`（orchestrator）+ workspace-folders/proactive-scheduling/research-design 微调 + methodology-auditor log 说明 | Module | ✅ |

**Plan:** `docs/superpowers/plans/2026-07-07-sprint-0.3-experiment-log.md`

**路径约定：** Registry 在 `.prismnext/experiments/<id>/`（meta + runs）；Workspace **Experiment** 目录下 `<id>/` 为干净工作区（无固定子目录）。未配置 Experiment 文件夹时 tool 返回 `no_experiment_folder`。

**测试：** `tests/main/experiment-log-service.test.ts`（13 例，含 slug/CRUD/append 原子性/resolve not_configured）；`resolve-active-modules.test.ts` + `instructions-audit.test.ts` 扩展断言。

### Sprint 0.4 — 文献 Agent 补缝（P1）✅ **核心已完成**

| # | 交付 | 状态 |
|---|------|------|
| 0.4a | Tool `literature-export-bib` | ✅ |
| 0.4a′ | ~~`literature-cite-check`~~ → `citation-health` | ✅ |
| 0.4a″ | `citation-health` 含 library.db 检查 | ✅ |
| 0.4b | `literature-read` 扩展 annotations 或 annotate 说明 | 🟡 read 已返 highlights；独立 annotate tool 待做 |

**推荐 Agent 链：** `citation-health` → `literature-export-bib` → 必要时 `latex-compile`

### Sprint 0.5 — Commands（P1）🟡 **部分完成**

| # | 交付 | 状态 |
|---|------|------|
| 0.5a | `/bib-check` action | ✅ |
| 0.5b | `/compile` 文档与 Tool 行为一致 | 🟡 行为一致；独立文档待补 |
| 0.5c | `/brief` | ✅ Sprint 0.2 已完成 |

### Sprint 0.6 — Prompt / Expert 栈（原文档未单列）✅ **2026-07 已完成**

| # | 交付 | 状态 |
|---|------|------|
| 0.6a | `core-persona` 全科研闭环身份 | ✅ |
| 0.6b | Global modules: `research-reasoning`, `reply-depth` | ✅ |
| 0.6c | Orchestrator module: `proactive-scheduling` | ✅ |
| 0.6d | Module: `citation-audit`（替代 citation-auditor expert） | ✅ |
| 0.6e | Expert roster 重构（5 认知型 expert） | ✅ |
| 0.6f | Instructions audit + experts-sync 测试更新 | ✅ |

> **注：** 0.6 不在原 Phase 0 迭代表中，但与「Platform 就绪后再写厚 Experts」原则存在张力——Expert 已先行；Sprint 0.2 已补齐 design-coach，**Sprint 0.3 需尽快补齐 methodology-auditor**。

### Sprint 0.7 — Experiments RightArea Mode（P1）✅ **Implemented 2026-07-08**

> Sprint 编号 0.7 避让已完成的 Sprint 0.4（文献 Agent 补缝）。plan 文件名 `plans/2026-07-08-sprint-0.4-experiments-mode.md` 为历史命名，标题已改 0.7。

为实验段提供 **Right Area 专用 Experiments mode**（非 Settings 子面板）：人类浏览 registry / runs / brief 摘录、UI 触发 `experiment-run` 等价执行。与 Sprint 0.3 Agent 平台层**共用同一 service**，不新增存储。

| # | 交付 | 类型 | 状态 |
|---|------|------|------|
| 0.7a | `experiment:*` IPC（list/read/detectEnv/getPaths/run/cancelRun）+ `resolveExperimentCtx` 共享 helper | IPC | 📋 |
| 0.7b | executor refactor（`resPath` optional + `onComplete`） | Service | 📋 |
| 0.7c | `experiment-store` + `experiments-mode`（list-in-Content，非 reader 壳） | Renderer | 📋 |
| 0.7d | Brief strip + Runs 表（单 output 列）+ Run panel（mode 内 modal confirm） | UI | 📋 |
| 0.7e | Open lab in Files / Terminal | UI | 📋 |

**P0 不含** `create`/`updateMeta`/New 表单（挪 P1.3/1.5）。**Plan:** `docs/superpowers/plans/2026-07-08-sprint-0.4-experiments-mode.md`（源码核查修订版）

**验收：** UI Run 与 Agent `experiment-run` 写同一 `runs.jsonl`；methodology-auditor 事实依据不破。

---

## 6. Phase 0 完成后的「Platform 就绪」标准

| # | 标准 | 进度 |
|---|------|------|
| 1 | 闭环五段中 **文献 / 写作 / Idea / 实验** 均有 ≥1 个 **Agent Tool** | ✅ 文献 ✅、写作 ✅、Idea ✅、**实验 ✅（Sprint 0.3）** |
| 2 | 新增 Tool 均有 **Module 段落** 或 **workflowRules** | ✅ 写作/文献/引用/brief/experiment 全覆盖 |
| 3 | **至少 3 个**新 Tool 有 chat **Widget** | ✅ latex + literature + citation-health + research-brief + **experiment** widgets |
| 4 | `research-prism` orchestrator 可协调全链 | ✅ Idea ✅、**实验 ✅（experiments module 挂载）** |
| 5 | Expert 有 Platform 支撑（非纯 prompt 角色） | ✅ research-design-coach（brief）+ **methodology-auditor（experiment log）**；synthesizer 仍部分依赖 orchestrator 搜库 |
| 6 | 达标后启动 **Phase A**（标杆 skill `literature-review` 产品化） | 🟡 可启动（待手动验收 Sprint 0.3） |

---

## 7. 与 Plugin / Extensions 的关系

```text
Phase 0（本文）Platform Tools + Modules + Commands
    ↓
Phase A–B  Academic Core skill 目录包（引用 Phase 0 Tools）
    ↓
Phase C    Experts 扩展  ← 部分已提前完成（0.6）
    ↓
Phase D    Extensions 页面 + Academic Plugin Pack 一键安装
```

**Academic Plugin Pack 内容（未来）应声明依赖：**

- Phase 0 Tools 已注册（含 `citation-health`、`research-brief-*`；待 `experiment-log`）；
- 18 个 bundled skill 目录包（`resources/skills/`）；
- 5 Experts + 1 Orchestrator；
- 推荐 rules 模板；
- commands：`/compile`、`/bib-check`、**`/brief`** 等。

---

## 8. 代码索引（实现时）

| Concern | Path |
|---------|------|
| 新增 Tool | `src/main/tools/`, `src/shared/tool-names.ts`, `tool-permission-registry.ts` |
| Tool → IPC bridge | `src/main/tools/bridge-paths.ts`, `src/main/services/*-bridge.ts` |
| 引用链 | `citation-health.ts`, `citation-health.ts` (service), `session-cite-audit-context.ts` |
| LaTeX Agent | `latex-service.ts`, `latex-bridge.ts`, `lib/latex-root.ts`, `tools/latex-*.ts` |
| Literature | `literature-service.ts`, `literature-bridge.ts`, `tools/literature-*.ts` |
| Modules | `src/main/prompts/modules/`（含 `latex-workspace`, `citation-audit`, `proactive-scheduling`, `research-design` 等） |
| core-persona | `src/main/prompts/layers/core-persona.ts` |
| Research brief | `research-brief-service.ts`, `research-brief-bridge.ts`, `tools/research-brief-*.ts`, `shared/research-brief.ts` |
| Chat Widget | `latex-tool-widget.tsx`, `literature-tool-widget.tsx`, `research-brief-tool-widget.tsx`, `tool-widget-dispatcher.tsx` |
| Commands | `src/main/commands/builtin-commands.ts`, `src/renderer/actions/builtin-actions.ts` |
| Experts / Orchestrator | `resources/experts/`, `resources/orchestrators/research-prism/` |
| Experts sync | `src/main/services/experts-sync.ts` |
| Skills sync | `src/main/services/skills-sync.ts` |

---

## 9. 路线评价与建议（2026-07-07）

### 可以继续按此路线走吗？

**可以，且应继续。** 原文档「Platform 先于 Plugin/Skill 加厚」的原则仍然正确。当前进度说明：

1. **文献 + 写作 + Idea Platform 已验证可行** — Sprint 0.1/0.2/0.4 是正确模板（Tool → Module → Widget → Command）。
2. **Prompt/Expert 重构（Sprint 0.6）有价值**；Sprint 0.2 已让 `research-design-coach` 脱离「纯口述」——**Sprint 0.3 需同样补齐 methodology-auditor**。
3. **下一优先级：Sprint 0.3（experiment-log）**。这是 Phase 0 Platform 达标的最后一块 P0。

### 建议调整的优先级（相对原文档）

| 原优先级 | 建议 | 理由 |
|----------|------|------|
| Sprint 0.2 P0 | **已完成 ✅** | brief scaffold + tools + module + `/brief` |
| Sprint 0.3 P0 | **保持 P0 — 当前焦点** | `methodology-auditor` 仍缺 experiment-log |
| 0.4b annotations P1 | 可略延后 | read 已可读 highlights |
| SyncTeX Tool P1 | 可略延后 | UI 已有 SyncTeX |
| Phase A skill 包 | **仍应在 Phase 0 达标后** | skill 无 tool 支撑仍是空手册 |
| Expert 继续扩 | **暂停新增** | 先让现有 5 expert 有 Platform 支撑 |

### 下一步（执行顺序）

1. **手动验收 Sprint 0.3**（experiment 文件夹配置 → create → experiment-run → methodology-auditor handoff → Python 岛隔离）
2. **Phase A** — `literature-review` skill 与 Platform Tools 绑定验收；`data-analysis-report` skill 显式引用 `experiment-log` / `experiment-run` workflow
3. P1 补缝：0.4b annotate、SyncTeX tool、FINER/gap skill 加厚、`results-snapshot` tool、`reproducibility` module、`/experiment` command、~~Settings 实验面板~~ → **Experiments RightArea mode（Sprint 0.7，见 plans/2026-07-08-sprint-0.4-experiments-mode.md）**
4. 启动 **Phase A** 全量 skill 产品化

---

## 10. 变更日志

| 日期 | 变更 |
|------|------|
| 2026-07-05 | Sprint 0.1 ✅；引用链 A/B/C 提前完成 |
| 2026-07-07 | 全文对照代码库刷新；Expert/Prompt 重构入账 Sprint 0.6；`citation-health` 取代 bib-check 系列；Sprint 0.5a ✅；明确 0.2/0.3 仍为 P0 阻塞 |
| 2026-07-07 | Sprint 0.2 ✅；§3.2/§4/§6/§9 明细表对齐；下一项改为 Sprint 0.3 |
| 2026-07-08 | Sprint 0.3 ✅ — `experiment-log`/`experiment-run` tool + `experiments` module + methodology-auditor log 说明；§3.3/§4/§5/§6/§9 对齐；Phase 0 Platform P0 全段闭环 |
| 2026-07-08 | Sprint 0.7 Experiments RightArea mode 进入 Planning（源码核查修订 plan；§3.3/§9「Settings 实验面板」→ RightArea mode；sprint 编号 0.7 避让 0.4 literature） |
| 2026-07-08 | Sprint 0.7 ✅ Implemented - Task 1–8 完成（experiment:* IPC + executor onComplete refactor + resolveExperimentCtx + store + mode shell + detail/brief/runs + run panel/permission modal + terminal/files 集成）；本地 commit 未 push，待手动验收 + final review |
