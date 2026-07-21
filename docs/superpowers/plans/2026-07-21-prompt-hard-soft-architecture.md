# Prompt Hard / Soft Architecture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Progress:** **P0–P3 landed** (2026-07-21). Optional follow-up: trim research-reasoning/reply-depth to hit ≤800 global tokens.

**Goal:** Converge prompt/module/tool responsibilities under the three iron rules; remove duplicate BINDING prose without weakening HARD gates (Plan path, intensive PDF, suggest-plan consent, Approve todo seed).

**Architecture:** See `docs/superpowers/specs/2026-07-21-prompt-hard-soft-architecture-design.md`. Canvas: `prompt-architecture.canvas.tsx`.

**Tech stack:** TypeScript, Vitest, existing `PromptManager` / `BUILTIN_TOOLS` / ACP — no new frameworks.

---

## File map (create / modify / delete)

| Path | Action |
|------|--------|
| `src/main/prompts/modules/plan-consent.ts` | **Delete** |
| `src/main/prompts/modules/index.ts` | Remove plan-consent registration |
| `src/main/prompts/modules/proactive-scheduling.ts` | Slim Plan/intensive to one-liners |
| `src/main/prompts/modules/research-design.ts` | Plan one-liner only |
| `src/main/prompts/modules/literature-library.ts` | Remove intensive how-to |
| `src/main/prompts/modules/chat-citation-staging.ts` | Remove duplicated BINDING |
| `src/main/prompts/modules/citation-audit.ts` | Slim to when-to-call |
| `src/main/prompts/modules/experiments.ts` | Remove HARD-covered venv/bash essay |
| `src/main/prompts/layers/core-persona.ts` | Rename “Plan first”; optional trim |
| `src/main/prompts/per-turn/plan-mode.ts` | Path-only default appendix |
| `src/main/prompts/per-turn/intensive-reading.ts` | List-first, short gate line |
| `src/shared/research-plan.ts` / `plan-suggest.ts` | Structure hints on accept/kick only |
| `src/main/tools/index.ts` + `suggest-plan.ts` | Keep short; sole Plan soft how-to |
| `src/shared/session-agent.ts` | P3: brief.md edit deny |
| `tests/main/prompt-modules.test.ts` | **Create** if missing — registry + budgets |
| `tests/shared/research-plan.test.ts` | Appendix / accept hints |
| `tests/shared/session-agent.test.ts` | P3 brief deny |
| `docs/superpowers/specs/2026-07-03-agent-prompt-stack-design.md` | Link to new spec |
| `.cursor/rules/prism-next-development.mdc` | Prompt homes + iron rules |
| `changelog/0.5.x.md` | Unreleased bullets per phase |

**Do not create:** parallel `prompts/bindings/` tree, ticket-named helpers.

---

### Task 1: Registry test — no plan-consent + global list

**Files:**
- Create: `tests/main/prompt-modules.test.ts`
- Modify: (none yet)

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it } from "vitest";
import { ALL_MODULES } from "../../src/main/prompts/modules";
import { resolveStableSystemModules } from "../../src/main/prompts/resolve-active-modules";

describe("prompt modules registry", () => {
  it("does not register plan-consent (soft Plan entry is tool-owned)", () => {
    expect(ALL_MODULES.some((m) => m.key === "plan-consent")).toBe(false);
  });

  it("global baseline keys stay judgment-only", () => {
    const keys = resolveStableSystemModules().map((m) => m.key).sort();
    expect(keys).toEqual(
      expect.arrayContaining(["workspace-folders", "research-reasoning", "reply-depth"]),
    );
    expect(keys).not.toContain("plan-consent");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL** (plan-consent still registered)

```bash
cd prism-next && pnpm exec vitest run tests/main/prompt-modules.test.ts
```

- [ ] **Step 3: Delete module + unregister**

- Delete `src/main/prompts/modules/plan-consent.ts`
- In `modules/index.ts`: remove import, `ALL_MODULES` entry, and comment mentioning plan-consent

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit** (only if user asks)

```text
refactor(prompts): remove global plan-consent module
```

---

### Task 2: suggest-plan remains sole soft Plan entry

**Files:**
- Modify: `src/main/tools/suggest-plan.ts`, `src/main/tools/index.ts` (`BUILTIN_TOOLS.suggestPlan`)
- Modify: `src/main/prompts/modules/proactive-scheduling.ts`, `research-design.ts`

- [ ] **Step 1: Tighten tool description** to ≤ ~150 tokens assembled — when to call, accept → follow `instruction`/`draftPath`. No essay.

- [ ] **Step 2: proactive-scheduling** — capability line only:

```text
- **Written plan before large work** — call `suggest-plan` (see that tool). Do not wait for the user to name Plan mode.
```

Remove any longer Plan paragraphs.

- [ ] **Step 3: research-design** — one pointer line to `suggest-plan` tool; no consent procedure reprint.

- [ ] **Step 4: Manual check** — new chat, multi-step experiment request still can call suggest-plan (tool visible in OpenCode).

- [ ] **Step 5: Changelog** under `## 0.5.x (Unreleased)` — prompt slim / plan-consent removed.

---

### Task 3: Plan appendix = path only; hints on accept/kick

**Files:**
- Modify: `src/main/prompts/per-turn/plan-mode.ts`
- Modify: `src/shared/research-plan.ts` / `src/shared/plan-suggest.ts` as needed
- Modify: `tests/shared/research-plan.test.ts`

- [ ] **Step 1: Failing test** — `buildPlanModeTurnAppendix("ses_x")` contains `sessionDraftPlanRel` and **does not** contain full `PLAN_DOC_STRUCTURE_HINTS` string (or key phrases like `depth ≤ 2` if those live only in hints).

- [ ] **Step 2: Implement** — appendix = BINDING path + chat≠plan one-liner + no Task; structure hints only in `buildPlanSuggestAcceptedResult` / `planDraftMissingRedirectNote` (or kick note).

- [ ] **Step 3: Run `pnpm exec vitest run tests/shared/research-plan.test.ts`

- [ ] **Step 4: Smoke** — Plan turn still writes draft; missing write still kicks.

---

### Task 4: Intensive single home

**Files:**
- Modify: `src/main/prompts/modules/literature-library.ts`
- Modify: `src/main/prompts/modules/proactive-scheduling.ts`
- Modify: `src/main/prompts/per-turn/intensive-reading.ts`

- [ ] **Step 1: literature-library** — one sentence: need PDF body → `literature-intensive-reading` add then `literature-read-pdf`. Delete step-by-step tutorial.

- [ ] **Step 2: proactive-scheduling** — one line pointer to intensive-reading tool (or drop if literature-library covers).

- [ ] **Step 3: intensive-reading.ts** — keep bibkey list; shrink rules to evidence priority + cite `[@bibkey]`; “gate enforced by tool” one line.

- [ ] **Step 4: Do not change** `literature-bridge.ts` HARD gate.

- [ ] **Step 5: Smoke** — without intensive, read-pdf fails with hint to intensive-reading tool.

---

### Task 5: Citation single home (P1)

**Files:**
- Modify: `src/main/prompts/modules/chat-citation-staging.ts`
- Modify: `src/main/prompts/modules/citation-audit.ts`
- Keep: `BUILTIN_TOOLS` `literature-stage` / `citation-health` as BINDING home

- [ ] **Step 1: Diff module vs tool rules** — delete module lines that duplicate tool `workflowRules` verbatim.

- [ ] **Step 2: Module keeps** Task handoff + reply layout examples only.

- [ ] **Step 3: citation-audit** — when to call; no “never Task/read” essay if tool already says it.

- [ ] **Step 4: Changelog** citation prompt slim.

---

### Task 6: Experiments + persona (P2)

**Files:**
- Modify: `src/main/prompts/modules/experiments.ts`
- Modify: `src/main/prompts/layers/core-persona.ts`

- [ ] **Step 1: experiments** — remove long shared-venv / bash-blocked paragraphs already enforced in main; keep island workflow + Methods judgment.

- [ ] **Step 2: core-persona** — replace “Plan first” with e.g. “Incremental steps” wording so it ≠ Plan mode.

- [ ] **Step 3: Optional budget test** in `tests/main/prompt-modules.test.ts`:

```ts
function tokens(s: string) {
  return Math.round(s.length / 4);
}
it("global static modules under 800 tokens", () => {
  const staticGlobals = resolveStableSystemModules().filter((m) => m.prompt);
  const sum = staticGlobals.reduce((a, m) => a + tokens(m.prompt!), 0);
  expect(sum).toBeLessThanOrEqual(800);
});
```

Tune if workspace-only dynamics make this flaky — measure only `prompt` fields.

---

### Task 7: Docs + Cursor rule

**Files:**
- Modify: `docs/superpowers/specs/2026-07-03-agent-prompt-stack-design.md` (banner link)
- Modify: `.cursor/rules/prism-next-development.mdc` — domain table row for Prompt

- [ ] **Step 1: 07-03 banner** after title:

```md
> **Enforcement / Hard vs Soft / size budgets:** see `2026-07-21-prompt-hard-soft-architecture-design.md`.
```

- [ ] **Step 2: Add to prism-next-development.mdc** under Domain map:

```md
### Prompt stack (runtime agent)

| Concern | Home |
|--------|------|
| Layers / modules / per-turn | `src/main/prompts/` |
| Tool how-to (short) | `src/main/tools/index.ts` + `tools/<name>.ts` |
| HARD gates | `shared/session-agent.ts`, bridges, ACP — not modules |

Iron rules: (1) HARD never re-stated as BINDING essays (2) tool how-to only in tool description (3) modules = when to enable, not manuals.
```

- [ ] **Step 3: Update canvas Status pill** to “Spec approved / implementing” if desired.

---

### Task 8: brief.md HARD deny (P3)

**Files:**
- Modify: `src/shared/session-agent.ts` and/or permission resolution used for build agent
- Modify: `tests/shared/session-agent.test.ts`

- [ ] **Step 1: Failing test** — `edit`/`write` on `.prismnext/research/brief.md` → deny (build + plan).

- [ ] **Step 2: Implement** path match → deny with note to use `research-brief-update`. Prefer extend existing permission helpers; **no new patch file**.

- [ ] **Step 3: Pass tests + smoke** brief tools still work.

---

## Verification matrix (after P0 at minimum)

| Scenario | Expect |
|----------|--------|
| New chat, complex experiment ask | May call `suggest-plan` or heuristic strip; no dependence on plan-consent module |
| Accept Plan | Still writes `drafts/<sid>.md` |
| Chat-only plan dump | Auto-kick / redirect still works |
| Approve & Build | Todo UI seeds; execute continues |
| read-pdf without intensive | HARD error + intensive-reading hint |
| citation stage | Still works; module shorter |

```bash
cd prism-next && pnpm exec vitest run \
  tests/main/prompt-modules.test.ts \
  tests/shared/research-plan.test.ts \
  tests/shared/plan-suggest.test.ts \
  tests/shared/session-agent.test.ts
```

---

## Done when

Spec §11 Acceptance criteria checked; P0 merged at least; P1–P3 tracked or done in follow-ups.
