# Prompt Hard / Soft Architecture — 职责收敛设计

**Date:** 2026-07-21  
**Status:** Approved — **P0–P3 landed**（体积预算 ≤800 global 仍为后续 trim research-reasoning/reply-depth）  
**Canvas:** Cursor canvas `prompt-architecture.canvas.tsx`（注入流水线 + 重复簇 + 瘦身顺序）  
**Depends on / supersedes in part:**

| Doc | Relationship |
|-----|----------------|
| `2026-07-03-agent-prompt-stack-design.md` | **底座保留**：L0–L4 认知模型、`_prism-system` / AGENTS / profile / per-turn 注入路径仍成立 |
| `2026-06-19-prompt-system-redesign.md` | 历史 Layer 设计；运行时以 07-03 + 本文为准 |
| `2026-07-21-plan-suggest-design.md` | Plan consent UI/工具契约；本文规定 **prompt 侧只留短判断** |
| Plan L2 / intensive / citation specs | 产品行为不变；本文规定 **条文写在哪一层** |

**Related code homes:** `src/main/prompts/` · `src/main/tools/` · `src/shared/session-agent.ts` · bridges under `src/main/services/`

---

## 1. Problem

当前同时存在：

1. **Prompt 过重** — 典型 research orchestrator 会话固定开销约 **8–10k tokens**（global + profile + tool schemas），其中大量是重复 BINDING 散文。  
2. **Module ↔ Tool 职责糊** — 注释写「per-tool 行为只在 `BUILTIN_TOOLS`」，但 citation / intensive / plan 在 module + tool description + per-turn **各写一遍**。  
3. **软约束冒充硬约束** — Plan 写路径、精读 PDF、suggest-plan consent、Approve 升格 **已有 HARD 门禁**，prompt 仍长篇复述「必须 / BINDING」。  
4. **最近膨胀** — 全局 `plan-consent` module（~900 chars）与 `suggest-plan` tool / `proactive-scheduling` / `research-design` 四重重叠；方向（主动提议 Plan）对，落点偏软。

**后果：** 模型上下文被手册占满 → 自主判断变差；真安全却不依赖这些散文；改一处规则要改三处。

---

## 2. Goals

1. **三条铁律**成为产品约定（见 §3），并落到代码结构与审查清单。  
2. **每个领域单一 Home**（HARD / Tool / Module / Per-turn），消灭跨层拷贝。  
3. **体积预算**（§5）可测：瘦身前后可用 `composeStableSystem` + profile compose 字符数对比。  
4. **不削弱** Plan / intensive / citation / experiment 的真实安全（HARD 层只加强不削弱）。  
5. **代码结构清晰**：新条文进既有 home；禁止再开「又一个全局 BINDING module」。

## 3. Non-goals

- 重做整个 PromptManager / Layer 注册机制（07-03 栈保持）。  
- L3「无人确认自动进 Plan」。  
- 改 OpenCode 上游 tool 模型。  
- 一次 PR 重写所有 module 正文（按 P0→P3 分批）。  
- 把 scholarly judgment（research-reasoning / reply-depth）删掉——它们是合法软判断。

---

## 4. Iron rules（三条铁律）

| # | Rule | Meaning |
|---|------|---------|
| **R1** | **能 deny / 能桥接失败的 → 绝不靠 prompt 复述** | ACP、bridge、IPC、UI gate 是 truth；prompt 最多一句「失败看 tool error」 |
| **R2** | **工具怎么用 → 只写在该工具 description（短）** | `BUILTIN_TOOLS` + synced `tools/*.ts`；禁止在 module 里复制 workflowRules |
| **R3** | **Module 只留「何时启用这类能力」** | 判断地图 / 边界；不写逐步操作手册 |

**附加：**

- **Per-turn** 只放本轮可变事实（session 草稿路径、精读 bibkey 列表、staged citations、redirect note）。  
- **Core persona** 不写领域 BINDING；「Plan first」不得与 **Plan mode** 撞名（改措辞）。

---

## 5. Cognitive model（相对 07-03 的增量）

保留 07-03 的 L0–L4。新增横切维度 **Enforcement**：

| Kind | Where it lives | Example |
|------|----------------|---------|
| **HARD** | ACP / bridge / IPC / UI | Plan path allowlist；`literature-read-pdf` intensive gate；suggest-plan consent bridge |
| **SOFT judgment** | Short module / persona | 「这次要不要先 suggest-plan」「回复该多长」 |
| **SOFT how-to** | Tool description only | `literature-stage` 参数与 2–4 条关键规则 |

```
┌─────────────────────────────────────────────────────────────┐
│  OpenCode instructions（稳定）                               │
│  AGENTS.md  +  _prism-system.md (persona + global modules)   │
│  + profile agent.md (instructions + profile modules)         │
│  + tool schemas (always visible to model)                    │
└─────────────────────────────────────────────────────────────┘
                              +
┌─────────────────────────────────────────────────────────────┐
│  chat:send per-turn（可变）                                   │
│  user text · project rules · intensive list · citations ·    │
│  plan appendix (path only) · redirects                       │
└─────────────────────────────────────────────────────────────┘
                              ×
┌─────────────────────────────────────────────────────────────┐
│  HARD gates（不进 prompt，决定成败）                          │
│  session-agent · literature-bridge · plan-suggest-bridge ·   │
│  draft snapshot / Approve seed                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Size budgets（可测）

| Surface | Target | Measure |
|---------|--------|---------|
| Core persona (default) | **&lt; 400 tokens** (~1600 chars) | `CORE_PERSONA_PROMPT.length / 4` |
| Global modules (合计，不含 workspace 动态) | **&lt; 800 tokens** | sum of static global module prompts |
| Each profile module | **&lt; 600 tokens** | per `modules/*.ts` |
| Each tool description (assembled) | **&lt; 150 tokens** | `buildOpencodeToolDescription` output |
| Plan per-turn appendix | **&lt; 120 tokens** 常态；结构 hints 仅 kick/accept | `buildPlanModeTurnAppendix` |

Tokens ≈ `chars / 4`（与现有 breakdown 一致）。CI 可选：vitest 断言上限（P2）。

---

## 7. Domain homes（单一来源表）

| Domain | HARD home | Tool home（短） | Module home（判断） | Per-turn |
|--------|-----------|-----------------|---------------------|----------|
| **Plan 写路径** | `shared/session-agent.ts` + draft snapshot (`ipc/chat.ts`) + migrate (`research-plan-service.ts`) | `suggest-plan` accept result: `draftPath` + 1 行 instruction | **一行**：大改前 call `suggest-plan`（见 §8：全局不设长 module） | **仅** `sessionDraftPlanRel(sessionId)` 一行 |
| **Plan 文档结构** | Approve UI；empty-draft auto-kick | accept / kick 时附 `PLAN_DOC_STRUCTURE_HINTS` | — | 不在每轮附录展开 |
| **Plan consent UI** | `plan-suggest-bridge.ts` + 15s consent（`shared/plan-suggest.ts` helpers）— **不含**用户句关键词启发式 | `suggest-plan` tool description（短；**何时 call = 软判断**：科研多步骤/多阶段即可，非「大改代码才 Plan」） | proactive / research-design **各最多一行指针** | — |
| **精读 PDF** | `literature-bridge.ts` gate | `literature-intensive-reading` + `literature-read-pdf` | literature-library：**一句**「需要正文就 intensive-reading add」 | **本轮 bibkey 列表**（缩 `intensive-reading.ts`） |
| **外部 [n] 引用** | （可选后续：回复校验） | `literature-stage` workflowRules = **唯一 BINDING** | `chat-citation-staging`：Task handoff + 布局示例 only | staged citations 表 |
| **库内 [@bibkey]** | — | `literature-read` / search | literature-library：发现与引用边界 | — |
| **实验 venv / run** | experiment-run / bash gate | `experiment-log` / `experiment-run` | `experiments`：island / Methods 判断；**删除**已被 HARD 覆盖的 venv 复述 | — |
| **Research brief** | **缺口 → P3**：ACP 禁 generic edit/write on `brief.md` | `research-brief-read/update` | `research-design`：何时读/写 / coach | — |
| **学术推理 / 回复深度** | — | — | `research-reasoning` / `reply-depth`（合法软判断） | — |

---

## 8. Module inventory（目标态）

### 8.1 Global（`profileOnly: false` → `_prism-system.md`）

| key | Keep? | Target content |
|-----|-------|----------------|
| `workspace-folders` | Yes | 动态文件夹说明 |
| `research-reasoning` | Yes | 软判断（可略缩） |
| `reply-depth` | Yes | 软判断（可略缩） |
| **`plan-consent`** | **Remove as module** | 见 §8.3 |

### 8.2 Profile-only

| key | Action |
|-----|--------|
| `proactive-scheduling` | 保留能力维度列表；**删** intensive / suggest-plan 逐步说明 → 各一行指针到 tool |
| `literature-library` | 删 intensive 逐步手册；保留 search/cite 边界 |
| `chat-citation-staging` | 删与 `literature-stage` 重复的 BINDING 条；留示例 + Task |
| `citation-audit` | 缩到「何时 call citation-health」；细则归 tool |
| `research-design` | 保留 brief/coach；Plan 仅一行指针 |
| `experiments` | 拆掉 HARD 已覆盖的 venv/bash 长段 |
| `latex-workspace` | 保持动态 |
| `task-delegation` | 保持短 |

### 8.3 Plan consent 落点（替换 `plan-consent` module）

**删除** `src/main/prompts/modules/plan-consent.ts` 与 `ALL_MODULES` 注册。

主动提议进 Plan 的软文 **单点**：

1. **`suggest-plan` tool description**（主）：何时 call、accept 后跟 `instruction`。  
2. **`proactive-scheduling`** 能力维度一行：`Written plan → suggest-plan`。  
3. **可选**：`core-persona` 或 global **不超过两句**（若实测无 profile 的会话从不 call，再加；默认不加）。

HARD / UI：bridge + 15s consent。**触发**仅 AI call `suggest-plan`（或用户手动 `/` → Plan）— 禁止 App 对用户句做关键词硬判。

---

## 9. Code structure（项目落点 — 不新开平行体系）

遵循 `.cursor/rules/prism-next-development.mdc`：**扩展既有 home，禁止 ticket 式小文件**。

### 9.1 Prompt 栈（已有，收敛内容）

```
src/main/prompts/
  index.ts                 # PromptManager
  composer.ts
  layers/
    core-persona.ts        # L0 — 瘦身 + 改名 Plan first
    agents-md.ts
    active-modules.ts      # 只拼 global modules
    custom-rules.ts        # per-turn project rules
  modules/
    index.ts               # ALL_MODULES 注册表（删 plan-consent）
    *.ts                   # 每模块一文件；只放判断文
  per-turn/
    plan-mode.ts           # 附录：默认仅路径一行
    intensive-reading.ts   # 附录：仅列表 + 一句 gate
  resolve-active-modules.ts
```

**禁止：** 再新增 `*-binding.ts` / `*-consent.ts` 全局 module，除非通过本 spec 修订。

### 9.2 Tools（已有）

```
src/main/tools/
  index.ts                 # BUILTIN_TOOLS — usageHint + 短 workflowRules（唯一 how-to）
  tool-description.ts      # 组装 description
  <name>.ts                # OpenCode 侧执行（自包含）
```

**规则：** module 不得复制 `workflowRules` 列表；若 tool 与 module 冲突，以 tool + HARD 为准并删 module 副本。

### 9.3 HARD / Shared（已有）

| Concern | Path |
|---------|------|
| Plan / Build 权限 | `src/shared/session-agent.ts` |
| Plan 路径 / 序列化 / Approve prompt | `src/shared/research-plan.ts` |
| Plan suggest 启发式 / accept payload | `src/shared/plan-suggest.ts` |
| Tool 名常量 | `src/shared/tool-names.ts` |
| ACP 执行 | `src/main/acp/service.ts` |
| 精读 gate | `src/main/services/literature-bridge.ts` |
| Plan consent bridge | `src/main/services/plan-suggest-bridge.ts` |
| Draft 文件 | `src/main/services/research-plan-service.ts` |
| 回合检测 / kick | `src/main/ipc/chat.ts` |
| Approve seed todo | `src/renderer/stores/chat-store.ts` |

**P3 新硬约束（允许小改 session-agent，不新文件）：**  
`brief.md` 在任意 agent 下对 generic `edit`/`write`/`apply_patch` → deny（或 ask），强制走 `research-brief-*`。

### 9.4 文档与 Cursor 规则

| Artifact | Action |
|----------|--------|
| 本文 | 权威：Hard/Soft + homes + budgets |
| `2026-07-03-agent-prompt-stack-design.md` | 文首加链接：「Enforcement / 瘦身见 2026-07-21-prompt-hard-soft…」 |
| `.cursor/rules/prism-next-development.mdc` | Domain map 增补一行 Prompt homes（指向 `src/main/prompts/` + 三条铁律摘要） |
| Canvas | 与本文同步；实现后更新 Status |

### 9.5 Tests

| Area | Path |
|------|------|
| Module 注册 / 无 plan-consent | `tests/` 下扩展现有 prompt 或 modules 测试（若无则 `tests/main/prompt-modules.test.ts`） |
| Appendix 长度 / 仅路径 | `tests/shared/research-plan.test.ts` 或 plan-mode 测试 |
| Budget（可选 P2） | 同文件 assert char caps |
| session-agent brief deny（P3） | `tests/shared/session-agent.test.ts` |

---

## 10. Phased rollout

### P0 — 去重 Plan + Intensive（最高杠杆）

1. 删除 global `plan-consent` module；收紧 `suggest-plan` tool 文案为唯一主软入口。  
2. `proactive-scheduling` / `research-design`：Plan 各留一行指针。  
3. `plan-mode` appendix：默认仅 BINDING 路径一行；`PLAN_DOC_STRUCTURE_HINTS` 只出现在 accept result + missing-draft kick。  
4. Intensive：缩短 `literature-library` + `proactive-scheduling` + `per-turn/intensive-reading`；HARD/tool 不动。

### P1 — Citation 单 home

5. `chat-citation-staging` 去掉与 `literature-stage` 重复 BINDING。  
6. `citation-audit` 缩到触发判断。

### P2 — Experiments + persona + budgets

7. `experiments` 去掉 HARD 已覆盖的 venv/bash 长复述。  
8. `core-persona` Rule 1 改名（如「Incremental steps」），避免 Plan mode 混淆。  
9. Vitest budget 断言（global + 抽样 tool）。

### P3 — 补硬缺口

10. ACP：禁止对 `.prismnext/research/brief.md` 的 generic edit/write（强制 brief tools）。  
11. （可选）citation 回复未 stage 的 `[n]` 检测 — 另开 spec，不阻塞本系列。

每阶段：更新 changelog `0.5.x` Unreleased；跑相关 vitest；**新开聊天**验证 system 指纹刷新。

---

## 11. Acceptance criteria

- [ ] 无 `plan-consent` 注册于 `ALL_MODULES`。  
- [ ] Global static modules（不含 workspace）&lt; 800 tokens。  
- [ ] Plan 每轮 appendix 默认不含完整 `PLAN_DOC_STRUCTURE_HINTS`（hints 在 kick/accept）。  
- [ ] `literature-stage` workflowRules 为外部引用 BINDING 唯一长文；`chat-citation-staging` 无逐条拷贝。  
- [ ] Intensive：per-turn 以 bibkey 列表为主；module 无逐步 add→read-pdf 教程。  
- [ ] Plan path / intensive PDF / suggest-plan bridge / Approve todo seed **行为回归通过**（手工或现有测试）。  
- [ ] `prism-next-development.mdc` 含 Prompt homes + 三条铁律摘要。  
- [ ] 07-03 agent-prompt-stack 文首指向本文。

---

## 12. Risks

| Risk | Mitigation |
|------|------------|
| 删 `plan-consent` 后无 profile 的会话更少 call suggest-plan | 保留 heuristic strip + 强 tool description；必要时再加 persona 两句 |
| Module 缩太狠导致编排变差 | P0 只砍重复，不砍 research-reasoning / reply-depth |
| Tool description 仍过长 | P1/P2 单独砍 `literature-stage` / experiment 文案，设 150 tok 预算 |
| brief ACP deny 误伤 | P3 仅匹配 brief 路径；legacy 路径测全 |

---

## 13. Review checklist（以后加条文时）

合并前自问：

1. 这是 HARD、tool how-to，还是 module 判断？  
2. 是否已有 home？是否在拷贝？  
3. 是否超过 §5 预算？  
4. 能否改成 bridge error hint 而不是 system BINDING？

---

## 14. Open questions（需产品确认）

1. **无 profile 的裸 Build 会话**：是否接受「仅靠 tool description + 用户启发式」驱动 suggest-plan，还是必须在 persona 留两句？**默认：不留，P0 后观测。**  
2. **Settings 里 Knowledge modules 全局关**：瘦身后仍尊重开关；budget 按「全开最坏情况」测。  
3. **Custom system prompt 替换 persona**：用户覆盖后失去默认两句 plan 提示 — 可接受（现有行为）。

---

## 15. Approval

请确认：

- [ ] 三条铁律  
- [ ] Domain homes 表  
- [ ] 删除 `plan-consent` module 的落点  
- [ ] P0→P3 顺序  

通过后按 `docs/superpowers/plans/2026-07-21-prompt-hard-soft-architecture.md` 执行实现。
