# Agent Prompt Stack — 实施计划

> **日期：** 2026-07-03  
> **设计：** `specs/2026-07-03-agent-prompt-stack-design.md`  
> **Phase 1：** ✅ 已完成  
> **Phase 2–3：** ✅ 已完成（Preview + Settings UX copy）  
> **Phase 4–5：** ✅ 已完成（Capabilities spec + L0 Task library enrich）

---

## Phase 0 — 认知对齐 ✅

- [x] Design spec + 五层模型 + Plan A 共识

---

## Phase 1 — P0 设计债 ✅

见 git history / spec §8（D1–D4 已关闭）

---

## Phase 2 — Profile 与 Preview ✅

### 2.1 Plan A 合并 ✅

- [x] `_prism-system` baseline only；profile modules → agent.md

### 2.2 Subagent ✅

- [x] Expert modules inline in agent.md（experts-sync tests）
- [x] Subagent 仍读 OpenCode project instructions（AGENTS + baseline _prism-system）— documented in stack preview

### 2.3 Preview truth ✅

- [x] `buildPromptStackPreview` + `settings:getPromptStackPreview` IPC
- [x] `settingsGetAssembledPrompt` → segmented markdown（非误导性 `compose()` 全文）
- [x] Settings「Preview stack」+ 注入路径说明
- [x] `tests/main/prompt-stack-preview.test.ts`

---

## Phase 3 — Settings UX copy ✅

- [x] Prompts & Rules：System / AGENTS / Modules / Rules 注入路径
- [x] Knowledge modules 每行 `Injected into: …`
- [x] Agent 编辑器：Modules / Rules / Instructions 说明更新

---

## Phase 4 — Capabilities 文档 ✅

- [x] `specs/2026-07-03-agent-capabilities-design.md` — Tools / Skills / MCP / Commands vs Modules

---

## Phase 5 — L0 增强 ✅

- [x] Task library bibkey auto-enrich — `library-task-context.ts` + bridge 记录 subagent search/read hits；`enrichTaskToolResultContent` append `## Library papers (this Task)` 表
- [x] `[@bibkey]` parser 归一化 — `shared/normalize-library-cite-markers.ts`（enrich + remark）

---

## 验证

```bash
pnpm test tests/main/prompt-stack-preview.test.ts \
  tests/main/experts-sync.test.ts \
  tests/main/prompt-sync.test.ts \
  tests/main/instructions-audit.test.ts \
  tests/main/library-task-context.test.ts \
  tests/main/session-citations-context.test.ts \
  tests/shared/normalize-library-cite-markers.test.ts \
  tests/renderer/remark-library-cite-refs.test.tsx
```

手动：Settings → Prompts & Rules → **Preview stack** 应分段显示 _prism-system / AGENTS / rules / orchestrator agent.md。
