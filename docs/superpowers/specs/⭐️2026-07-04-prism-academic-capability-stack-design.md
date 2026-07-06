# Prism 学术能力栈与 Extensions 页面 — 设计说明

**Date:** 2026-07-04  
**Status:** Approved — Phase 0 先行（见 backlog spec）  
**Related:**

- **`2026-07-04-platform-capabilities-phase0-backlog.md`** — ⭐ Phase 0 能力对照与 Sprint 清单
- `2026-07-03-agent-capabilities-design.md` — Skills / Experts / Tools 分层
- `2026-07-03-expert-team-subagents-design.md` — Orchestrator / Expert / Task
- `2026-07-04-skill-library-unified-design.md` — Library sources / Browse / Install
- `2026-07-04-skill-install-redesign-design.md` — GitHub / Registry 安装后端

---

## 1. 背景与问题

### 1.1 外链学术 Skills 的局限

公开科研类 Agent Skills 多数为 **Claude Code 插件** 或 **Codex 目录** 形态打包分发（skills + agents + commands + hooks + MCP）。Prism 通过 OpenCode 运行时 + `SKILL.md` 格式可以**安装**这些仓库，但：

- **格式兼容 ≠ 行为兼容**：子 agent、Claude hooks、Codex MCP 工具名等在 Prism 中常无法复现。
- **Discovery Registry**（Cloudflare、Supabase、agentskills.io）几乎无成体系学术目录；学术内容主要在 GitHub。
- 用户若依赖多个 GitHub 源，体验像「skill 超市」，且质量不可控。

### 1.2 内置 Skills 的局限

Prism Curated 现有 **17 个** bundled skill（`resources/skills/`），其中 **10 个 academic**、**7 个 general**。多数仅为 **11–17 行** 的 `SKILL.md` 纲要，缺少：

- `references/`、`assets/`、`scripts/` 等 Agent Skills 规范推荐的目录包内容；
- 与 Prism 专有工具（`literature-*`、编译、SyncTeX、Expert `task`）的显式衔接；
- 可验证的分步 workflow 与成功标准。

### 1.3 产品定位与机会

Prism 是 **科研闭环平台**（文献 → Idea → 分析/实验 → 写作/编译 → 审稿/发表），不是单纯 LaTeX 写作器。拥有文献库、编译、Citation staging、Expert team 等 Claude 插件无法假设的上下文。

**关键结论（2026-07-04 确认）：**

- **Plugin 是打包层**；须先加强 **Platform 外置能力**（Tools、Modules、Commands），再写厚 Skills/Experts，最后做 Extensions Pack。
- 当前 Agent 侧 Tools（9 个 custom）与 Modules（4 个）对全闭环**偏少**；Idea / 实验 / 写作 Agent 链缺口最大。
- 深度能力应以内置为主、外链为辅；详见 **`2026-07-04-platform-capabilities-phase0-backlog.md`**。

同时，用户已熟悉 **Cursor Plugins** 式「一个页面浏览、安装、管理扩展包」的心智。Prism 可将 Skills、Experts、未来可选 MCP 包统一为 **Extensions（扩展）** 页面，而不是散落在 Settings 多处。

---

## 2. 北极星

> **Prism Curated = 可安装的学术 Skill 目录包 + 可委派的 Expert 团队 + Prism 内置 Tools/MCP**，由 **Research Prism Orchestrator** 编排；外链（如 nature-skills）仅作可选增强。

对标关系：

| Claude Code Plugin（一整包） | Prism 等价物 |
|-----------------------------|--------------|
| 多个 `skills/` | **Prism Curated Academic Core**（10 个目录包） |
| `agents/` subagent | **Experts**（sync → OpenCode `agents/*.md`） |
| Primary / 编排 agent | **Orchestrator**（`research-prism`） |
| Bundled MCP | **Prism MCP Settings** + 内置 `literature-*` tools |
| `commands/` | **Prism Commands**（`/` 展开到 user turn） |
| 一键 `plugin install` | **Extensions 页面** — Install pack / Enable Expert |

---

## 3. 能力分层（放什么、不放什么）

与 `2026-07-03-agent-capabilities-design.md` 一致，学术栈各层职责如下：

| 层 | 存储 / 运行时 | 学术场景示例 | 禁止 |
|----|---------------|--------------|------|
| **L3 Tools** | `src/main/tools/` → OpenCode | `literature-search`、`literature-read-pdf`、`literature-cite`、bash/edit | 不要把长 workflow 塞进 tool description |
| **L3 Skills** | `.prismnext/agent/skills/<id>/` | Related Work 怎么写、citation 键规范 | 不要把 SKILL 全文复制进 system prompt |
| **L2 Experts** | `resources/experts/` → OpenCode subagent | `citation-auditor` 只审引用 | 不要与 Skill 重复大段正文 |
| **L2 Orchestrator** | `resources/orchestrators/` → OpenCode primary | `research-prism` 委派专家 | 不要替代 Skill 的细节步骤 |
| **L1 Modules** | `src/main/prompts/modules/` | `literature-library`、`chat-citation-staging` | 不要替代 SKILL 深度流程 |
| **L4 Commands** | `src/main/commands/` | 用户显式 `/compile` 等 | 不要当作 Agent 默认必知 |
| **L1 Rules** | `.prismnext/settings.json` | 「本项目 biblatex + biber」 | — |

**分工原则：**

- **Skill** = 按需加载的操作手册（OpenCode **Skill** 工具）。
- **Expert** = 带 model/权限/人设的**子会话**（OpenCode **Task** 工具或 `@Expert`）。
- **Tool** = 可执行 IPC/ACP 能力。
- **Module** = 轻量、每轮可能注入的背景知识。

---

## 4. Prism Curated — Academic Core（10 包）

### 4.1 清单与写作流水线

| 阶段 | Skill ID | 升级后目录包应含 |
|------|----------|------------------|
| 结构 | `paper-structure` | `references/imrad-checklist.md`、venue 差异 |
| 文献 | `literature-review` | `references/synthesis-templates.md`；**Tools in Prism** |
| 引用 | `academic-citations` | `references/bibtex-patterns.md`；`literature-cite`、编译后验 |
| 正文 | `academic-english` | ESL / hedge 词表 |
| 公式 | `math-equations` | `references/ams-envs.md` |
| 图表 | `latex-figures-tables` | `assets/figure-table-starter.tex` |
| 结果 | `data-analysis-report` | 统计报告 checklist |
| 审稿回复 | `peer-review-response` | `assets/rebuttal-letter.md` 模板 |
| 基金 | `grant-proposal` | NSF/NSFC 结构对照 |
| 学位论文 | `thesis-dissertation` | 章节与前辅文 checklist |

### 4.2 General（7 包，次要展示）

`git-commit-messages`、`code-review`、`debug-systematic`、`technical-writing`、`api-design`、`meeting-notes`、`skill-creator`。

- 保留在 Prism Curated，但在 UI / manifest 中与 Academic Core **分组**。
- `skill-creator` 升级为 **「编写 Prism 风格 Skill 目录包」** 的官方指南。

### 4.3 目录包标准结构（标杆模板）

```
resources/skills/<id>/
├── SKILL.md              # 元数据 + 主流程
├── references/           # 长文、checklist（按需加载）
├── assets/               # .tex / .md 模板（可选）
└── scripts/              # 仅当有真实自动化需求（慎用）
```

### 4.4 `SKILL.md` 推荐章节

1. **When to use** — 含中英文 trigger 关键词（利于 OpenCode discovery）。
2. **Prerequisites** — 依赖的 `.bib`、主 `.tex`、文献库状态等。
3. **Workflow** — 分步流程 + 每步成功标准。
4. **Tools in Prism** — 应调用的 tools / Experts / 编译说明。
5. **Anti-patterns** — 常见错误（混用 natbib/biblatex 等）。
6. **References** — 指向 `references/*.md`（progressive disclosure）。

### 4.5 质量门槛（Academic Core）

每个 skill 至少满足：

- `SKILL.md` **≥ 80 行**（或等价信息量）；
- 至少 **1 个** `references/` 文件；
- 必须有 **Tools in Prism** 一节；
- `description` frontmatter 同时描述 **what + when**（Agent Skills 规范）。

---

## 5. Expert Team（对标插件内 `agents/`）

### 5.1 现状

| 角色 | ID | 绑定 |
|------|-----|------|
| Orchestrator | `research-prism` | modules: `chat-citation-staging`, `literature-library`, `task-delegation` |
| Expert | `citation-auditor` | skill: `academic-citations` |
| Expert | `library-scout` | module: `literature-library` |
| Expert | `literature-scout` | module: `chat-citation-staging`（+ 外部检索行为） |

定义见 `resources/orchestrators/`、`resources/experts/`；sync 至 `<userData>/opencode-server/config/opencode/agents/*.md`。

### 5.2 Phase C 建议新增 Expert

| Expert ID | 职责 | 绑定 skill | permission 倾向 |
|-----------|------|------------|-----------------|
| `latex-structure-coach` | IMRaD、章节逻辑 | `paper-structure` | 初版 `edit: deny` |
| `rebuttal-coach` | 审稿回复 | `peer-review-response` | `edit: deny` |
| `figure-table-coach` | 图表与 cross-ref | `latex-figures-tables` | `edit: deny` |

Orchestrator `allowedExperts` 与 `task-delegation` module 同步更新，写明 **何时 task 谁**。

### 5.3 Prism 工具 — 应在 Skills 中显式引用

| Tool / 能力 | 优先写入的 Skill |
|-------------|------------------|
| `literature-search` / `literature-read` / `literature-read-pdf` | `literature-review` |
| `literature-cite` / `literature-add` | `academic-citations` |
| `literature-stage` + citation staging | `literature-review`, `academic-citations` |
| Compile（`compile:execute`、SyncTeX） | `latex-figures-tables`, `academic-citations` |
| Expert `task` | `paper-structure` |

---

## 6. 外链 GitHub 策略

| 策略 | 说明 |
|------|------|
| 主叙事 | 「Prism 自带学术套件」 |
| 默认快捷 Add | **仅 `nature-skills`**（Nature/高刊深度，短期不自建） |
| 其他 GitHub 源 | 用户可手动 Add source；不占 Extensions 黄金推荐位 |
| 与内置去重 | 文档说明：日常 LaTeX 用 Prism Curated；Nature 作图/专利等用 nature-skills |

---

## 7. Extensions 页面（仿 Cursor Plugins）

### 7.1 动机

当前 Skills 能力分散在 Settings → Skills（Installed / Browse Library / Library sources）。用户难以理解 **Skill vs Expert vs 外链源** 的关系。Extensions 页面统一「扩展」心智：**浏览 → 安装/启用 → 管理**。

### 7.2 页面信息架构（草案）

```
Settings → Extensions          （或独立侧栏入口「扩展」）
├── Featured                   # 官方推荐包
│   ├── Prism Academic Core    # 10 skill 目录包（可一键 Install all / 逐个）
│   └── nature-skills          # 外链 GitHub 源快捷 Add（可选卡片）
├── Installed                  # 本项目已安装 skill + 已启用 Expert
├── Browse
│   ├── Official               # Prism Curated（bundled）
│   ├── Community              # 已 Connect 的 GitHub / Registry 源
│   └── Search
└── Experts & Orchestrators    # 与 Extensions 同页或子 Tab
    ├── Research Prism         # Orchestrator 说明 + 默认
    └── Expert cards           # citation-auditor 等，Enable / 编辑
```

### 7.3 「扩展包（Extension Pack）」概念

逻辑上的 pack（不一定单独 zip），用于 UI 分组，**不改变** OpenCode 底层仍按 skill 目录加载：

| Pack ID | 类型 | 内容 |
|---------|------|------|
| `prism-academic-core` | bundled | 10 个 academic skill 目录包 |
| `prism-general` | bundled | 7 个 general skill |
| `nature-skills` | github source | 指向 `Yuan1z0825/nature-skills` |
| `prism-expert-team` | experts | 内置 3 Expert + `research-prism`（展示用，非「安装」） |

**Install pack** 行为：

- Academic Core → 批量 `copyBundledSkillToProject` + refresh OpenCode sync。
- GitHub pack → 现有 `addLibrarySourceFromInput` + 可选 Browse Install all。
- Expert pack → 无复制；仅 manifest `disabled` / Expert enable 状态（Experts 始终 sync，用户可 disable builtin）。

### 7.4 与现有 Skill Library 面板关系

| 阶段 | UI |
|------|-----|
| **过渡期** | 保留 `skill-library-panel.tsx`；Extensions 页面新建 |
| **收敛** | Extensions 为主；Skills Settings 重定向或嵌入 Extensions 子视图 |
| **数据** | 仍用 `skills-manifest.json` sources + installs；不新增平行 manifest |

### 7.5 非目标（Extensions V1）

- Prism Extensions **Marketplace**（用户上传、付费、审核）
- 克隆 Claude Code `hooks/` 运行时
- 私有 GitHub OAuth
- 离线 `.skill` 归档 sideload（可后续）

---

## 8. 实施路线

```text
Phase 0  Platform Tools + Modules + Commands（必须先做）
    ↓
Phase A  标杆 skill 目录包 + skill-pack 规范
    ↓
Phase B  Academic Core 10 包 rollout
    ↓
Phase C  Expert Team 扩展
    ↓
Phase D  Extensions 页面 + Plugin Pack 一键安装
```

### Phase 0 — 平台外置能力（阻塞 Plugin）

**Spec：** `2026-07-04-platform-capabilities-phase0-backlog.md`

| Sprint | 焦点 | P0 交付 |
|--------|------|---------|
| **0.1** | 写作 Agent 闭环 | Tools: `latex-root`, `latex-compile`, `latex-bib-check` + Module `latex-workspace` |
| **0.2** | Idea / 研究设计 | `.prismnext/research/brief` 约定 + Tools: `research-brief-read/update` + Module `research-design` |
| **0.3** | 实验（最小） | `.prismnext/experiments/` 约定 + Tool `experiment-log` |
| **0.4** | 文献补缝 | P1: `literature-export-bib` 等 |
| **0.5** | Commands | P1: `/bib-check` 等 |

**Phase 0 就绪标准：** Agent 可在 chat 内完成「brief → 改 tex → compile → bib check」，且不依赖 GitHub skill 外链。达标后再进入 Phase A。

### Phase A — 标杆 + 规范

- [ ] 文档化 **skill-pack 模板**（本章 §4.3–4.4）
- [ ] 升级 **1 个标杆包**：**`literature-review`**（引用 Phase 0 `literature-*` + `latex-*` tools）
- [ ] 对齐 **`citation-auditor`** instructions（若选 citations 标杆）
- [ ] `manifest.json` 增加 `tier`: `academic-core` | `general`

**验收：** 不装 GitHub 源，Agent 可通过 Skill 工具完成一条完整 citation 或 Related Work 辅助链路。

### Phase B — Academic Core rollout

| 批次 | Skills |
|------|--------|
| B1 | `literature-review`, `paper-structure`, `academic-citations` |
| B2 | `latex-figures-tables`, `math-equations`, `academic-english` |
| B3 | `peer-review-response`, `data-analysis-report` |
| B4 | `grant-proposal`, `thesis-dissertation` |

### Phase C — Expert Team 扩展

- [ ] 新增 1–2 Expert（优先 `latex-structure-coach`）
- [ ] 更新 `research-prism` + `task-delegation`
- [ ] 用户文档：Expert team 下 `@Expert` vs Orchestrator 自主 `task`

### Phase D — Extensions 页面

- [ ] Settings 新路由 / 模式：`Extensions`（UI 仿 Cursor Plugins 卡片网格）
- [ ] Featured：`Prism Academic Core` + `nature-skills`
- [ ] Installed / Browse 复用现有 IPC（`fetchSkillLibraryCatalog`、`installLibraryCatalogItem` 等）
- [ ] Experts 子 Tab 或同页卡片
- [ ] 逐步 deprecate 独立 Browse Library 重复入口

---

## 9. 成功标准

0. **Phase 0**：五段闭环中文献/写作/Idea/实验各有 ≥1 Agent Tool（见 backlog §6）。
1. **零外链**：用户可完成 文献检索 → Related Work 起草 → citation 插入 → 编译 → Expert 审引用。
2. **Academic Core 10 包**均满足 §4.5 质量门槛。
3. **Orchestrator** 在 Expert team 模式下至少有 **3 类**明确 task 委派场景（文献 / 引用 / 结构）。
4. **Extensions 页面**上用户能在 **30 秒内**理解：装 Academic Core vs 加 nature-skills vs 启用 Expert 的区别。

---

## 10. 方案对比（已选方向）

| 方案 | 描述 | 结论 |
|------|------|------|
| A. 内置优先 | Phase A–B 为主，外链仅 nature-skills | **✅ 采用** |
| B. 外链为主 | 多 GitHub preset，内置保持短文 | ❌ 体验不可控 |
| C. 混合 | 5 个深包 + nature-skills | 仅作 B 完成前过渡 |

---

## 11. 已确认项（2026-07-04）

| 项 | 决定 |
|----|------|
| 建设顺序 | **Phase 0 Platform 先于 Plugin / Skills 加厚** |
| 标杆 skill | **`literature-review`**（Phase A，在 Phase 0 写作/文献 tools 就绪后） |
| Extensions 入口 | **Settings 子页**（Phase D；不抢 Phase 0 资源） |
| Phase D 时机 | **Phase B1 完成后再做 UI** |
| General 7 包 | **与 Academic Core 分开两个 Pack**（`prism-general` / `prism-academic-core`） |
| 外链 preset | 仅 **nature-skills** 快捷 Add |

---

## 12. 相关代码索引

|  Concern | Path |
|----------|------|
| Bundled skills | `resources/skills/`, `src/main/services/bundled-skills.ts` |
| Skills sync | `src/main/services/skills-sync.ts` |
| Skill library UI | `src/renderer/components/modules/settings/skill-library-panel.tsx` |
| GitHub presets | `src/shared/skill-libraries.ts` → `GITHUB_SKILL_PRESETS` |
| Experts / Orchestrators | `resources/experts/`, `resources/orchestrators/`, `experts-sync.ts` |
| Prism tools | `src/main/tools/literature-*.ts` |
| Prompt modules | `src/main/prompts/modules/` |

---

## 13. 下一步

1. ✅ Phase 0 backlog 已写入 `2026-07-04-platform-capabilities-phase0-backlog.md`
2. **当前执行：** 从 Sprint **0.1**（`latex-root` / `latex-compile` / `latex-bib-check`）开 implementation plan
3. Phase 0 达标 → Phase A 标杆 `literature-review` 目录包
4. Phase D 前可另起 `extensions-page-design.md` 细化 UI
