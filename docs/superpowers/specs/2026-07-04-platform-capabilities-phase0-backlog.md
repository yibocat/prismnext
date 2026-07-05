# Prism 平台外置能力 Phase 0 — 能力对照与 Backlog

**Date:** 2026-07-04  
**Updated:** 2026-07-05 — Sprint 0.1 ✅；引用链 A/B/C ✅（提前 Sprint 0.4 核心）  
**Status:** In progress — Phase 0 执行清单（Sprint 0.1 ✅，下一项 Sprint 0.2）  
**Parent:** `2026-07-04-prism-academic-capability-stack-design.md`  
**Implementation plan:** `plans/2026-07-04-sprint-0.1-latex-agent-tools.md`  
**Principle:** Plugin 是打包层；**先补 Platform（Tools + IPC 暴露 + Modules + Commands），再写厚 Skills/Experts，最后做 Extensions Pack。**

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
| ✅ | 已有且 Agent 可触达（Tool 或稳定 IPC + 文档） |
| 🟡 | 产品有（UI/IPC），Agent **未**一等暴露（无 Tool / Module 未写） |
| ❌ | 缺失或仅 bash/泛泛 prompt |
| **P0** | Plugin 前必须做 |
| **P1** | Academic Core skill 深化依赖 |
| **P2** | 可延后 |

**Agent 触达路径：**

- **Tool** — OpenCode `src/main/tools/*.ts`（Agent 直接调用）
- **IPC** — `electronAPI.*` / main services（需 Tool 桥接才进 Agent）
- **Module** — L1 prompt（`src/main/prompts/modules/` 或 `per-turn/`）
- **Command** — 用户 `/` 显式（`src/main/commands/builtin-commands.ts`）

---

## 3. 闭环五段对照表

### 3.1 文献（Literature）— 相对最成熟

| 能力 | 产品 IPC / UI | Agent Tool | Module / Per-turn | 状态 | Backlog |
|------|---------------|------------|-------------------|------|---------|
| 库内全文检索 | `literature:search` | `literature-search` | `literature-library` | ✅ | — |
| 读元数据/摘要/高亮 | `literature:get` 等 | `literature-read` | `literature-library` | ✅ | — |
| 读 PDF 正文（MinerU） | extract 管道 | `literature-read-pdf` | `intensive-reading` (per-turn) | ✅ | P1: Module 摘要进 agent editor 说明 |
| 入库（DOI/arXiv） | `literature:addByDoi` 等 | `literature-add` | — | ✅ | P1: Module 一句「何时 add vs stage」 |
| 写入 .bib | `literature:cite` | `literature-cite` | — | ✅ | — |
| .tex ↔ library.db 引用检查 | citeCheckLiterature | `literature-cite-check` | `literature-library` | ✅ | — |
| 库 → 项目 .bib 批量同步 | `literature:exportBib` | `literature-export-bib` | `literature-library` | ✅ | — |
| 聊天外链 staging | staging bridge | `literature-stage` | `chat-citation-staging` | ✅ | — |
| 集合 / 标签 / 批注 | 大量 `literature:*` IPC | ❌ | ❌ | 🟡 | **P1** `literature-annotate` 或 read 扩展 annotations |
| 外部题录发现 | enrich 管道 | 依赖 OpenCode `websearch` | staging module 已写 | 🟡 | **P1** 文档化 websearch → stage 纪律（已在 tool workflowRules） |
| PDF 导入 | `literature:ingestPdf` | ❌ | ❌ | 🟡 | **P2** Tool: `literature-ingest-pdf`（路径参数） |

**本段结论：** 文献是 Phase 0 的**模板段**；优先 **P1 补 Agent 触达缺口**，而非从零建设。

---

### 3.2 Idea / 研究设计 — 最薄

| 能力 | 产品 IPC / UI | Agent Tool | Module | 状态 | Backlog |
|------|---------------|------------|--------|------|---------|
| 研究问题 / 假设结构化 | ❌ | ❌ | ❌ | ❌ | **P0** 项目约定：`.prismnext/research/brief.md` 或 `claims.yml` scaffold |
| 贡献 / 创新点 map | ❌ | ❌ | ❌ | ❌ | **P0** Tool: `research-brief-read` / `research-brief-update`（读写结构化 brief） |
| FINER / gap 分析流程 | ❌ | ❌ | ❌ | ❌ | **P1** Module: `research-design` |
| 与 Notebook / 笔记联动 | ❌ | ❌ | ❌ | ❌ | **P2** 视产品路线 |
| Expert：研究设计教练 | ❌ | ❌ | ❌ | ❌ | **P1** Expert `research-design-coach`（Phase C，依赖 P0 tool） |

**本段结论：** **P0 必须立项**——至少「项目内 research brief 文件 + Agent 读写 Tool + Module」。

---

### 3.3 分析 / 实验 — 几乎空白

| 能力 | 产品 IPC / UI | Agent Tool | Module | 状态 | Backlog |
|------|---------------|------------|--------|------|---------|
| 跑 shell / 脚本 | terminal IPC | `bash`（Prism bridge） | — | 🟡 | P0: bash permission 与 worktree 文档 |
| 实验记录 / 结果 registry | ❌ | ❌ | ❌ | ❌ | **P0** 约定 `.prismnext/experiments/` + Tool: `experiment-log` |
| 结果 → 图表 → tex | 手动 | ❌ | ❌ | ❌ | **P1** Tool: `results-snapshot`（列 figures 目录 + 摘要） |
| 可复现 / 环境记录 | ❌ | ❌ | ❌ | ❌ | **P1** Module: `reproducibility` |
| 数据统计报告 | ❌ | ❌ | ❌ | ❌ | **P1** 与 skill `data-analysis-report` 同步 |
| Expert：实验分析 | ❌ | ❌ | ❌ | ❌ | **P2** Expert `analysis-coach` |

**本段结论：** **P0 先做「实验日志/结果目录约定 + 一个 experiment-log Tool」**；深度统计后移。

---

### 3.4 写作 / LaTeX — UI 强，Agent 弱

| 能力 | 产品 IPC / UI | Agent Tool | Module | 状态 | Backlog |
|------|---------------|------------|--------|------|---------|
| 编辑 .tex | editor + OpenCode read/write/edit | 内置 edit/read | `workspace-folders` + `latex-workspace` | 🟡 | P1: 在 module 中补充 editor ↔ compile 协作说明 |
| 编译 PDF | `compile:execute` | `latex-compile` | `latex-workspace` | ✅ | — |
| SyncTeX | `compile:synctex*` | ❌ | ❌ | 🟡 | **P1** Tool: `latex-synctex` 或 compile 工具参数 |
| 解析主文件 / magic comment | compiler 内部 | `latex-root` | `latex-workspace` | ✅ | — |
| Bib 一致性检查 | UI 无独立面板 | `latex-bib-check`（默认含 library.db） | `latex-workspace` | ✅ | Sprint 0.5: `/bib-check` command |
| 编译问题诊断 | compile log UI | `latex-compile`（structured errors + logTail） | `latex-workspace` | ✅ | — |
| Slash 编译 | `/compile` action | — | — | ✅ | P1: 保留；与 Tool 并存 |
| Commands：写作辅助 | 仅 `/compile` | — | — | ❌ | **P1** `/bib-check`、**P2** `/related-work`（AI 或 action） |

**本段结论：** **Sprint 0.1 已完成** — `latex-root` / `latex-compile` / `latex-bib-check` + Module `latex-workspace` + chat widget。Agent 写作链已闭环；SyncTeX Tool 与 `/bib-check` command 留待 P1 / Sprint 0.5。

---

### 3.5 审稿 / 发表 — 仅 Skill 文字

| 能力 | 产品 IPC / UI | Agent Tool | Module | 状态 | Backlog |
|------|---------------|------------|--------|------|---------|
| Rebuttal 起草 | ❌ | ❌ | ❌ | ❌ | **P1** 依赖写作 Tool + skill 目录包 |
| 格式 / venue checklist | ❌ | ❌ | ❌ | ❌ | **P1** Tool: `latex-venue-check`（轻量规则）或 references-only |
| 模拟审稿 | ❌ | ❌ | ❌ | ❌ | **P2** Expert `peer-review-coach` |
| 与 git diff / 变更 | git IPC | bash? | ❌ | 🟡 | **P2** Tool: `git-diff-summary` for revision |

**本段结论：** P0 不单独开大块；**依赖 3.4 写作 Tool + P1 skill 包**。

---

## 4. 横切能力对照

### 4.1 OpenCode Custom Tools（当前）

| Tool | 类别 | 备注 |
|------|------|------|
| `question` | utility | ✅ |
| `bash` | utility | ✅ 实验/脚本依赖 |
| `delete` / `move` | utility | ✅ |
| `literature-search` | reference | ✅ |
| `literature-stage` | reference | ✅ workflowRules 较完整 |
| `literature-add` | reference | ✅ |
| `literature-read` | reference | ✅ |
| `literature-read-pdf` | reference | ✅ |
| `literature-cite` | reference | ✅ |
| **`latex-*`** | compile | ✅ Sprint 0.1 |
| **`research-brief-*`** | — | ❌ **P0 新增** |
| **`experiment-log`** | — | ❌ **P0 新增** |

注册路径：`src/main/tools/` → `BUILTIN_TOOLS` → `tool-names.ts` → widget → `tool-permission-registry.ts`。

### 4.2 Prompt Modules（当前）

| Module | profileOnly | 备注 |
|--------|-------------|------|
| `workspace-folders` | no（全局） | ✅ |
| `chat-citation-staging` | yes | ✅ |
| `literature-library` | yes | ✅ |
| `task-delegation` | yes | ✅ |
| `intensive-reading` | per-turn | ✅ 不在 ALL_MODULES |
| **`research-design`** | yes | ❌ P0 |
| **`latex-workspace`** | yes | ✅ Sprint 0.1 |
| **`experiments`** | yes | ❌ P1 |

### 4.3 Builtin Commands（当前）

| Command | 类型 | 备注 |
|---------|------|------|
| `/setup` | action | ✅ |
| `/compact` | action | ✅ |
| `/undo` / `/redo` | action | ✅ |
| `/compile` | action | ✅ |
| **`/bib-check`** | action | ❌ P1 → 调 `latex-bib-check` |
| **`/brief`** | AI template | ❌ P1 → 研究 brief 维护 |

### 4.4 Experts / Orchestrator（当前）

| 角色 | 聚焦 | Backlog |
|------|------|---------|
| `research-prism` | 文献 + task + 写作 compile 链 | ✅ Sprint 0.1 轻量 tool 地图（`instructions.md`） |
| `citation-auditor` | 引用 | P1 对齐 `latex-bib-check` |
| `library-scout` / `literature-scout` | 文献 | ✅ |
| **`research-design-coach`** | Idea | ❌ P1 |
| **`latex-structure-coach`** | 结构 | ❌ P1（原 Phase C） |

---

## 5. Phase 0 执行包（建议迭代顺序）

### Sprint 0.1 — 写作 Agent 闭环（P0）✅ **已完成 2026-07-05**

| # | 交付 | 类型 | 状态 |
|---|------|------|------|
| 0.1a | Tool `latex-root` — 主 tex、engine、bib | Tool + bridge | ✅ |
| 0.1b | Tool `latex-compile` — 调 compile IPC，结构化 log/errors | Tool + widget | ✅ |
| 0.1c | Tool `latex-bib-check` — 键/引用一致性 | Tool + widget | ✅ |
| 0.1d | Module `latex-workspace` — build dir、`.prismnext/compile` | Module | ✅ |
| 0.1e | 测试 `tests/main/latex-service.test.ts`, `latex-bib-check.test.ts` | Test | ✅ 4 cases |

**实现索引：** `latex-service.ts`, `latex-bridge.ts`, `lib/latex-root.ts`, `tools/latex-*.ts`, `latex-tool-widget.tsx`

**验收：** Agent 在 chat 内可「查 root → 改 tex → compile → bib check」无需用户点 UI。  
**手动验收：** 见 `plans/2026-07-04-sprint-0.1-latex-agent-tools.md` § 用户体验验证。

### Sprint 0.2 — 研究 brief（P0）

| # | 交付 | 类型 |
|---|------|------|
| 0.2a | 约定 `.prismnext/research/brief.md`（或 YAML）模板 + project scaffold | Project |
| 0.2b | Tool `research-brief-read` / `research-brief-update` | Tool |
| 0.2c | Module `research-design` | Module |

**验收：** Agent 可读写 brief；Orchestrator prompt 提及 brief 路径。

### Sprint 0.3 — 实验日志（P0 最小）

| # | 交付 | 类型 |
|---|------|------|
| 0.3a | 约定 `.prismnext/experiments/<id>/log.md` + `results/` | Project |
| 0.3b | Tool `experiment-log` — append/run metadata | Tool |
| 0.3c | Module `experiments`（P1 可并进 0.3） | Module |

**验收：** Agent 可记录一次实验运行摘要到项目内。

### Sprint 0.4 — 文献 Agent 补缝（P1）

| # | 交付 | 状态 |
|---|------|------|
| 0.4a | Tool `literature-export-bib` | ✅ |
| 0.4a′ | Tool `literature-cite-check`（.tex ↔ library.db） | ✅ |
| 0.4a″ | `latex-bib-check` 默认 `includeLibraryCheck` | ✅ |
| 0.4b | `literature-read` 扩展 annotations 或轻量 annotate 说明 | 🟡 待做 |

**推荐 Agent 链：** `literature-cite-check` → `literature-export-bib` → `latex-bib-check`

### Sprint 0.5 — Commands（P1）

| # | 交付 |
|---|------|
| 0.5a | `/bib-check` action → latex-bib-check |
| 0.5b | `/compile` 文档与 Tool 行为一致 |

---

## 6. Phase 0 完成后的「Platform 就绪」标准

| # | 标准 | 进度 |
|---|------|------|
| 1 | 闭环五段中 **文献 / 写作 / Idea / 实验** 均有 ≥1 个 **Agent Tool** | 🟡 文献 ✅、写作 ✅；Idea / 实验 ❌（Sprint 0.2–0.3） |
| 2 | 新增 Tool 均有 **Module 段落** 或 **usageHint/workflowRules** | 🟡 写作 ✅、文献引用链 ✅；research-brief / experiment-log 待做 |
| 3 | **至少 3 个**新 Tool 有 chat **Widget** | ✅ latex + literature 引用链 widgets |
| 4 | `research-prism` orchestrator instructions 含 **Tools 地图** | ✅ 写作 compile 链已写入 |
| 5 | 达标后启动 **Phase A**（标杆 skill `literature-review`） | ❌ 待 Sprint 0.2–0.3 |

---

## 7. 与 Plugin / Extensions 的关系

```text
Phase 0（本文）Platform Tools + Modules + Commands
    ↓
Phase A–B  Academic Core skill 目录包（引用 Phase 0 Tools）
    ↓
Phase C    Experts 扩展
    ↓
Phase D    Extensions 页面 + Academic Plugin Pack 一键安装
```

**Academic Plugin Pack 内容（未来）应声明依赖：**

- Phase 0 Tools 已注册；
- 10 个 skill 目录包；
- 3–5 Experts；
- 推荐 rules 模板；
- commands：`/compile`、`/bib-check` 等。

---

## 8. 代码索引（实现时）

|  Concern | Path |
|----------|------|
| 新增 Tool | `src/main/tools/`, `src/shared/tool-names.ts`, `tool-permission-registry.ts` |
| Tool → IPC bridge | `src/main/tools/bridge-paths.ts`, `src/main/services/*-bridge.ts` |
| LaTeX Agent（Sprint 0.1） | `latex-service.ts`, `latex-bridge.ts`, `lib/latex-root.ts`, `tools/latex-*.ts` |
| Compile（复用） | `src/main/services/compiler.ts`, `src/main/ipc/compile.ts`, `lib/bib-path-resolve.ts` |
| Literature | `src/main/services/literature-service.ts`, `literature-bridge.ts`, `tools/literature-cite-check.ts`, `tools/literature-export-bib.ts` |
| Modules | `src/main/prompts/modules/`（含 `latex-workspace.ts`） |
| Chat Widget | `src/renderer/components/modules/chat/tools/latex-tool-widget.tsx`, `tool-widget-dispatcher.tsx` |
| Commands | `src/main/commands/builtin-commands.ts`, `src/renderer/actions/builtin-actions.ts` |
| Experts / Orchestrator | `resources/experts/`, `resources/orchestrators/research-prism/` |

---

## 9. 下一步

1. ~~Sprint 0.1~~ ✅ — 见 `plans/2026-07-04-sprint-0.1-latex-agent-tools.md`
2. **Sprint 0.2** — research brief scaffold + `research-brief-read` / `research-brief-update` + Module `research-design`
3. **Sprint 0.3** — experiment-log Tool + `.prismnext/experiments/` 约定
4. 每 Sprint 合并后更新本文 **状态列**；Phase 0 达标后更新 parent spec Status → Phase A ready
