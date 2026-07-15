# Provenance Lite — 工件溯源数据模型与产品面

**Date:** 2026-07-11（2026-07-15 修订：补全使用效果与概念对齐）  
**Status:** Implemented (2026-07-15) - Phase 1 + Phase 1.1 landed; Phase 2 (manuscript includegraphics links, global SQLite index) still open.
**Related:**

- `2026-07-07-sprint-0.3-experiment-log.md` / `src/shared/experiment-log.ts` — runs.jsonl 已有
- `2026-07-11-paper-search-mcp-integration-design.md` — 下载工件溯源（Phase 1.1）
- `⭐️2026-07-04-platform-capabilities-phase0-backlog.md` — 实验段 P1 reproducibility
- Open Science reference: `.openscience/provenance.jsonl` + `runs.jsonl`（对标，非照搬）

---

## 0. 使用效果（产品意图）

> 目标观感：**结果可指认、命令可回收、失败也说真话** — 不是另造沉重「溯源中心」，而是在熟悉的 Experiments → Run → Artifacts 上多点一下。

### 0.1 术语（务必分清）

| 概念 | 含义 |
|------|------|
| **Experiment** | 研究主题的容器（id、工作区、一串 runs） |
| **Run** | 可复现最小单元：**一次命令执行**的账（命令、exit、env、时间、可选 artifacts） |
| **Artifact** | 被这次 run **认领**的产出路径（图 / CSV / JSON 等）。磁盘上有文件 ≠ 已登记为 artifact |
| **Provenance** | 项目级 append-only 账本，把 artifact（及后续下载件）**绑回** run / 来源事件，供 UI 倒查 |

### 0.2 主路径闭环

```text
experiment-run（或 append_run）完成
  → runs.jsonl 记账（权威）
  → provenance.jsonl：run_recorded + artifact_linked（显式路径）
  → Experiments Run history 展开 → Artifacts chips
  → 点击路径 → Provenance inspector（命令可复制 / env / exit / 可选回跳 chat）
```

断链时诚实 empty：`No run recorded for this file — may be manually copied.`（不编造「看起来像」的 run。）

### 0.3 Run UI 改动范围（对齐结论）

- **不**推倒重做每个 run 卡片；现有 Run history + Artifacts chips **保留并增强**。
- Phase 1 主要改动：chips 点击 → inspector；后台双写 provenance；`ExperimentRunEntry` 仅 **可选** 增补 `chatSessionId` / `provenanceEventId`。
- 产出图/文件与溯源的关系：必须经 `artifacts[]`（或 Phase 1.1 mtime 推断）**认领**后才能稳定倒查；漏登记则倒查弱/空。

### 0.4 典型场景

| 场景 | 期望效果 |
|------|----------|
| 正常：run + `artifacts` 含 `loss.png` | 点图 → 见命令 / env / run；可复制进 Methods |
| Agent 漏填 artifacts | chips 空或仅推断；推断失败 → empty state，不假装已溯源 |
| 手拷网图进工程 | empty：「无 run」 |
| 两次 run 两套图 | 各点各的 command，不混 |
| 旧项目无 provenance 文件 | 不报错；首次 run 自动创建 |

### 0.5 分期边界（体验）

| 阶段 | 用户能感受到的 |
|------|----------------|
| **Phase 1** | Experiments 内点已认领 artifact → inspector |
| **Phase 1.1** | PDF ingest / MCP 下载 → `download_recorded`；mtime 尽力挂未列路径 |
| **Phase 2** | TeX `\includegraphics` / 预览点图 → 同一套倒查；edit lineage 等仍非目标 |

---

## 1. 问题与目标

### 1.1 现状

Prism 已有 **实验 run 记录**（`.prismnext/experiments/<id>/runs.jsonl` + Experiments UI），但：

- 产出文件（图、CSV、PDF）与 run 的链接靠 Agent 手动填 `artifacts[]`，易漏。
- 无跨 experiment / 跨 session 的 **全局溯源索引**。
- 无 UI「点图 → 看生成命令 / env / 会话」。
- Manuscript 层（.tex 图引用的脚本）与 agent 改稿（worktree）未纳入溯源。

Open Science 的 provenance 是产品核心；Prism 需要 **lite、Prism 风格** 的版本，绑定已有 experiment + library + chat 上下文。

### 1.2 目标（Phase 1 — Provenance Lite）

1. 定义 append-only **`.prismnext/provenance.jsonl`** 事件 schema（版本化）。
2. **Run 完成时**自动写入 `run_recorded` 事件；尽力 **link 产出文件**（显式 `artifacts[]`；mtime 窗口见 1.1）。
3. Experiments UI：**点击已有 artifact chip** → 侧栏/inspector 显示 run 命令、env 摘要、exit code、链接 chat session（若有）；可继续打开文件。
4. 与 `ExperimentRunEntry` **兼容扩展**，不破坏现有 `runs.jsonl` 读者。
5. 为 Phase 2（manuscript 引用、worktree commit、全局 SQLite 索引）留 extension points。

### 1.3 非目标（Phase 1）

- 全文件版本历史（每次 edit 一条 diff）——Open Science 级，Phase 2+。
- 全局 `runs.db` SQLite 索引（可 Phase 1.5）。
- Jupyter cell 级溯源。
- 远程 Modal/Slurm run（无远程计算时不做）。
- 替换 git history；worktree 仅记录 commit hash 快照。
- 重做整个 Experiments 信息架构（仅增强 artifact 交互）。

---

## 2. 设计原则

| 原则 | 说明 |
|------|------|
| **Run-centric** | 可复现单元是 **一次命令执行**（与 OS 一致），不是「文件被 edit 工具改过」 |
| **Claimed artifacts** | 倒查绑定的是 **被认领的路径**，不是「工作区里所有新文件」 |
| **Append-only** | `provenance.jsonl` 只追加；修正用 compensating event，不 rewrite |
| **Project-local** | 路径相对 project root；不进 library.db |
| **Prism-native links** | 可挂 `experimentId`、`runId`、`chatSessionId`、`worktreeBranch` |
| **Best-effort capture** | 被动捕获为主；Agent 显式 `artifacts[]` 优先；推断允许失败并诚实展示 |
| **Honest empty** | 无链接时明确 empty，不猜错 run |

---

## 3. 存储布局

```text
.prismnext/
├── provenance.jsonl          # NEW — 全局事件流（append-only）
├── provenance.meta.json      # NEW — schemaVersion, lastEventId (optional cache)
└── experiments/
    └── <exp-id>/
        ├── meta.json
        └── runs.jsonl        # 不变 — 仍是 experiment 域的 run 权威源
```

**双写策略（Phase 1）：**

- `runs.jsonl` 保持 **experiment 工具链的 source of truth**（`experiment-log` tool 不变）。
- `provenance.jsonl` 是 **cross-cutting 事件流**，便于未来全局搜索与 UI inspector。
- `append_run` 成功时：**先写 runs.jsonl，再 append provenance**（同一 transaction 意图；失败 log warn，不 rollback run）。

---

## 4. 事件 Schema

### 4.1  envelope（每行 JSON）

```ts
/** Schema version for forward compatibility. Bump on breaking field renames. */
export const PROVENANCE_SCHEMA_VERSION = 1;

export type ProvenanceEventType =
  | "run_recorded"      // experiment or ad-hoc bash run captured
  | "artifact_linked"   // file linked to a run (explicit or inferred)
  | "download_recorded" // MCP / ingest PDF saved to workspace (Phase 1.1)
  | "staging_recorded"; // optional P2 — paper staged in chat (usually renderer-only)

export interface ProvenanceEventBase {
  /** UUID v4 or `prov_${timestamp}_${random}` */
  id: string;
  schemaVersion: typeof PROVENANCE_SCHEMA_VERSION;
  type: ProvenanceEventType;
  /** ISO 8601 */
  at: string;
  /** Project-relative path prefix context, e.g. experiment workspace or "." */
  workspaceRel: string;
  /** OpenCode chat session id when known */
  chatSessionId: string | null;
  /** Git branch name when in worktree context (best-effort) */
  gitBranch: string | null;
  /** Short git commit at event time */
  gitCommit: string | null;
}
```

### 4.2 `run_recorded`

Emitted when `experiment-log` `append_run` or `experiment-run` completes (exit code captured).

```ts
export interface ProvenanceRunRecorded extends ProvenanceEventBase {
  type: "run_recorded";
  experimentId: string | null;  // null for ad-hoc non-experiment runs (P2)
  runId: string;
  command: string;
  cwd: string;                  // project-relative preferred
  exitCode: number;
  startedAt: string;
  finishedAt: string;
  /** Subset mirror of ExperimentEnv */
  env: {
    python: string | null;
    pythonVersion: string | null;
    platform: string;
    gitCommit: string | null;
  };
  /** Explicit artifact paths from run payload (project-relative) */
  artifacts: string[];
  stdoutTailBytes: number;
  stderrTailBytes: number;
}
```

### 4.3 `artifact_linked`

Links a file to a prior run. Sources:

1. **Explicit** — `artifacts[]` on run append.
2. **Inferred (P1.1)** — mtime within `[startedAt, finishedAt + grace]` under experiment workspace（bounded scan，借鉴 OS 思路，grace 500ms）。

```ts
export interface ProvenanceArtifactLinked extends ProvenanceEventBase {
  type: "artifact_linked";
  runId: string;
  experimentId: string | null;
  /** Project-relative file path */
  artifactPath: string;
  linkMethod: "explicit" | "mtime_inferred";
  /** MIME or extension hint */
  mediaType: string | null;
  bytes: number | null;
}
```

### 4.4 `download_recorded` (Phase 1.1)

When MCP `download_with_fallback` or `literature:ingestPdf` writes a file:

```ts
export interface ProvenanceDownloadRecorded extends ProvenanceEventBase {
  type: "download_recorded";
  artifactPath: string;
  source: "paper-search-mcp" | "literature-ingest" | "manual";
  identifier: string | null;   // DOI / arXiv
  sourceUrl: string | null;
  bytes: number | null;
}
```

### 4.5 `provenance.meta.json`（可选）

```json
{
  "schemaVersion": 1,
  "lastEventId": "…",
  "lastAppendedAt": "2026-07-11T…"
}
```

用于 UI 快速判断文件是否存在；**非权威**（以 jsonl 为准）。

---

## 5. 与 `ExperimentRunEntry` 的关系

现有 `ExperimentRunEntry`（`runs.jsonl` 行）**保持不变**。

| 字段 | runs.jsonl | provenance `run_recorded` |
|------|------------|---------------------------|
| runId, command, env, artifacts | ✅ 权威 | 镜像 |
| chatSessionId | ❌ 暂无 | ✅ 新增（从 bridge context） |
| gitBranch | ❌ | ✅ best-effort |
| provenance event id | ❌ | ✅ |

**Optional extension** to `ExperimentRunEntry` (backward compatible):

```ts
export interface ExperimentRunEntry {
  // … existing fields …
  /** OpenCode chat tab that triggered the run (optional). */
  chatSessionId?: string | null;
  /** Links into provenance.jsonl run_recorded event (optional). */
  provenanceEventId?: string | null;
}
```

Service 在 append 时填充；旧行无这些字段 — reader 必须 optional。

---

## 6. 写入路径（main process）

| 触发点 | 事件 |
|--------|------|
| `experiment-log-service` `appendRun` | `run_recorded` + 每个 artifact `artifact_linked` |
| `experiment-run` executor 完成 | 同上（经 appendRun） |
| `literature:ingestPdf` 成功 | `download_recorded` (Phase 1.1) |
| Passive bash capture | **Phase 2** — 非 experiment 的 ad-hoc run |

新建：`src/main/services/provenance-service.ts`

```ts
appendProvenanceEvent(projectRoot: string, event: ProvenanceEvent): Promise<void>
linkArtifactsForRun(projectRoot: string, opts: LinkArtifactsOpts): Promise<void>
queryArtifactsForRun(projectRoot: string, runId: string): ProvenanceArtifactLinked[]
resolveRunForArtifact(projectRoot: string, artifactPath: string): ProvenanceRunRecorded | null
```

IPC（renderer Experiments UI）：

- `provenance:getForArtifact` `{ projectRoot, artifactPath }`
- `provenance:getForRun` `{ projectRoot, runId }`
- `provenance:listRecent` `{ projectRoot, limit? }` — P1.5

---

## 7. UI（Experiments Mode）

### 7.1 Phase 1

在现有 **Experiments detail → Run history → Artifacts chips**（`experiments-runs-table.tsx`）上增强——**不重做**整表布局：

- 点击已登记的 `.png` / `.csv` / `.json` 等路径 → **Provenance inspector**（右栏或 modal）优先展示溯源；并保留「Open in Files」：
  - Command（可复制）
  - Exit code / duration
  - Env 摘要（Python / platform / git commit）
  - linkMethod：`explicit` | `mtime_inferred`（可信度提示）
  - 「Open chat session」（若 `chatSessionId` 仍可加载）

无 run 链接时显示 honest empty：「No run recorded for this file — may be manually copied.」

Inspector 字段对照见 §0（使用效果）。

### 7.2 Phase 1.5

- Experiments grid card badge：「N artifacts traced」
- 全局 Settings → Workspace → 「Provenance log」只读 tail（debug）

### 7.3 Phase 2（Manuscript）

- TeX `\includegraphics{…}` 点击 → 若 provenance 有 link，显示生成 run；否则 fallback SyncTeX/editor。

---

## 8. Agent / Module 影响

**Phase 1：** Agent 无新 tool。`experiments` module 加一句：

> After `experiment-run`, prefer listing output paths in `artifacts` so provenance links survive.

**Phase 2 tool（可选）：** `provenance-query` — 只读，供 methodology-auditor。

---

## 9. 与 Open Science 对标

| 能力 | Open Science | Prism Provenance Lite |
|------|--------------|------------------------|
| Run log | `runs.jsonl` + SQLite index | `runs.jsonl` + `provenance.jsonl` |
| File↔run link | mtime + passive bash | explicit artifacts + P1.1 mtime |
| Edit lineage | edit diff in provenance | Phase 2 |
| Global search | `runs.db` | Phase 1.5 SQLite optional |
| Manuscript | weak | Phase 2 + citation-health |
| Worktree | git snapshot | `gitBranch` on events |

---

## 10. 实现任务（摘要）

| # | 任务 |
|---|------|
| 1 | `src/shared/provenance.ts` — types + schema version |
| 2 | `provenance-service.ts` — append, read, link |
| 3 | Hook `experiment-log-service.appendRun` |
| 4 | Extend `ExperimentRunEntry` optional fields + tests |
| 5 | IPC + preload + `electron.d.ts` |
| 6 | Experiments UI inspector component |
| 7 | `download_recorded` on ingestPdf (1.1) |
| 8 | mtime inference (1.1) — bounded scan under experiment workspace |

**Plan doc:** `docs/superpowers/plans/2026-07-11-provenance-lite-plan.md`

---

## 11. 验收标准

### 11.1 技术

1. `experiment-run` 完成后 `.prismnext/provenance.jsonl` 新增 `run_recorded` 行。
2. `artifacts: ["experiment/exp-…/plot.png"]` 产生对应 `artifact_linked`（`linkMethod: explicit`）。
3. Experiments UI 点击该 path 显示 command + env（inspector）。
4. 旧项目无 provenance 文件时不报错；首次 run 自动创建。
5. `runs.jsonl` 旧读者无 breaking change。

### 11.2 产品效果（与 §0 对齐）

1. **不**要求用户阅读 jsonl；主路径是 Experiments → chip → inspector。
2. 未认领文件出现 honest empty，不误绑其它 run。
3. Run 列表观感与现网一致，仅 Artifacts 交互增强。
4. Agent / prompt 仍强调：正式实验用 `experiment-run` 并尽量填 `artifacts`。

---

## 12. 开放问题

| # | 问题 | 倾向 |
|---|------|------|
| Q1 | provenance 是否进 `.gitignore`? | 默认 **commit**（可复现）；用户可选 gitignore 模板 条目 |
| Q2 | 单文件 vs 按 experiment 分 jsonl? | 单文件 global（简单）；量大后 shard by month |
| Q3 | staging 进 provenance? | Phase 2；renderer staging 仍 primary |
