# Plan Workflow L2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** L2 Plan workflow — suggest+consent to enter Plan, iterate draft, Approve & Execute (persist plan + Build), soft-block/discard when leaving with draft; snapshots under `.prismnext/research/plans/`.

**Architecture:** Keep existing `sessionAgent` + Plan permission overrides as the enforcement layer. Add per-tab plan workflow state (draft steps, suggest dismissed, pending soft-block). Main-process `research-plan-service` writes markdown under `.prismnext/research/plans/`. Composer Plan chrome + suggest bar drive consent and Approve/Exit. `plan.updated` feeds draft steps (and optional draft file overwrite).

**Tech Stack:** Electron IPC, Zustand chat-store, existing session-agent, React composer UI, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-18-plan-workflow-l2-design.md`

**Constraints:** Do not git commit unless user asks. Do not unstage unrelated staged files. No `.opencode/plans`. Do not auto-overwrite `brief.md`.

---

## File map

| File | Role |
|------|------|
| `src/shared/research-plan.ts` | Paths, frontmatter types, filename helpers, markdown serialize/parse |
| `src/main/services/research-plan-service.ts` | ensure dir, write draft/approved/snapshot |
| `src/main/ipc/research-plan.ts` (or extend research-brief ipc) | `researchPlan:write` / `researchPlan:writeDraft` |
| preload + `electron.d.ts` | Expose APIs |
| `src/renderer/stores/chat-store.ts` | Per-tab planDraft, suggestPlan, approve/exit actions |
| `src/renderer/lib/chat/plan-suggest.ts` | Heuristic: should suggest enter Plan from user text |
| `src/renderer/components/modules/chat/plan-suggest-bar.tsx` | Consent UI |
| `src/renderer/components/modules/chat/plan-chrome.tsx` | Banner + Approve & Execute / Exit |
| `composer-toolbar` / `chat-composer-core` | Mount chrome + soft-block dialog |
| `use-opencode-events.ts` | On plan.updated → update tab draft (+ optional draft write IPC) |
| i18n en / zh-CN / zh-HK | Strings |
| `changelog/0.5.x.md` | `0.5.14 (Unreleased)` |
| tests | `tests/shared/research-plan.test.ts`, `tests/main/research-plan-service.test.ts`, renderer suggest/soft-block tests |

---

### Task 1: Shared research-plan model + service

**Files:**
- Create: `src/shared/research-plan.ts`
- Create: `src/main/services/research-plan-service.ts`
- Create: `tests/shared/research-plan.test.ts`
- Create: `tests/main/research-plan-service.test.ts`

- [ ] **Step 1: Shared types**

```ts
export const RESEARCH_PLANS_DIR_REL = ".prismnext/research/plans";
export type ResearchPlanStatus = "draft" | "approved" | "snapshot";

export interface ResearchPlanMeta {
  id: string;
  status: ResearchPlanStatus;
  sessionId?: string;
  createdAt: string;
  updatedAt: string;
  title?: string;
}

export interface ResearchPlanStep {
  text: string;
  status?: string;
}

export interface ResearchPlanDoc {
  meta: ResearchPlanMeta;
  goal?: string;
  steps: ResearchPlanStep[];
  conclusions?: string;
  nextActions?: string;
}

export function researchPlanFileName(meta: Pick<ResearchPlanMeta, "id" | "createdAt">): string
export function serializeResearchPlan(doc: ResearchPlanDoc): string
export function parseResearchPlan(markdown: string): ResearchPlanDoc | null
```

- [ ] **Step 2: Service** `writeResearchPlan(projectRoot, doc)` → absolute path; `writeDraftPlan(...)` uses stable `current-draft.md` or id `draft` overwritten; `writeApprovedPlan` / `writeSnapshotPlan` use dated id filenames.

- [ ] **Step 3: Tests** serialize round-trip; write to temp dir; path under `.prismnext/research/plans`.

- [ ] **Step 4: Run** `pnpm exec vitest run tests/shared/research-plan.test.ts tests/main/research-plan-service.test.ts`

---

### Task 2: IPC + preload

**Files:**
- Create or extend: `src/main/ipc/research-plan.ts` + register in main ipc index
- Modify: `src/preload/index.ts`, `src/renderer/types/electron.d.ts`

- [ ] **Step 1:** `researchPlan:write` args `{ projectRoot, doc }` → `{ ok, path?, error? }`
- [ ] **Step 2:** Expose `researchPlanWrite`
- [ ] **Step 3:** No commit

---

### Task 3: Chat-store plan workflow state

**Files:**
- Modify: `src/renderer/stores/chat-store.ts`

Per-tab fields (defaults):

```ts
planSuggestVisible: boolean;      // show L2 suggest bar
planSuggestDismissed: boolean;    // ignore for this tab until reset
planDraftSteps: ResearchPlanStep[];
planDraftTitle: string | null;
planDraftDirty: boolean;          // non-empty draft → soft-block on Build
planExitDialogOpen: boolean;      // soft-block UI
```

Actions:

- `suggestEnterPlan()` / `dismissPlanSuggest()` / `acceptPlanSuggest()` → setSessionAgent("plan"), hide suggest
- `setPlanDraftFromEvent(steps, title?)` → update draft, mark dirty if steps.length
- `approveAndExecutePlan()` → write approved via IPC, setSessionAgent("build"), clear dirty, `sendPrompt` with plan path context
- `exitPlanDiscardAndBuild()` → snapshot write, setSessionAgent("build"), clear draft
- `requestSetSessionAgent(agent)` — if switching to build while dirty → open exit dialog instead of immediate switch; empty draft → allow

Wire `setSessionAgent` through soft-block when leaving Plan with dirty draft.

---

### Task 4: Suggest heuristic + PlanSuggestBar

**Files:**
- Create: `src/renderer/lib/chat/plan-suggest.ts`
- Create: `tests/renderer/plan-suggest.test.ts`
- Create: `src/renderer/components/modules/chat/plan-suggest-bar.tsx`
- Mount in chat messages / composer area (above composer when Build + suggest visible)

Heuristic (conservative): user message matches plan-intent keywords (plan/设计/方案/研究问题/实验设计/methodology…) and does not look like “改一下 xxx.tex / compile / run experiment”. Only when `sessionAgent === "build"` and not dismissed.

On send (Build): if heuristic hits → `planSuggestVisible = true` (do not auto-enter Plan).

---

### Task 5: Plan chrome + soft-block dialog

**Files:**
- Create: `src/renderer/components/modules/chat/plan-chrome.tsx`
- Modify: composer shell to show chrome when `sessionAgent === "plan"`
- Dialog for soft-block: Approve & Execute / Discard & Build / Cancel
- i18n keys under `chat.planWorkflow.*`

---

### Task 6: plan.updated → draft (+ optional draft file)

**Files:**
- Modify: `src/renderer/hooks/use-opencode-events.ts` (plan.updated case)
- Reuse `parsePlanSteps` from `src/renderer/lib/chat/parse-plan-steps.ts`
- Call `setPlanDraftFromEvent`; if projectRoot + in Plan, optionally `researchPlanWrite` draft overwrite

---

### Task 7: Changelog + verification

- Append bullets under `## 0.5.14 (Unreleased)` for L2 workflow (not just Build|Plan switch).
- Run vitest for new tests + session-agent tests.
- Manual smoke checklist from spec success criteria.

---

## Spec coverage

| Spec | Task |
|------|------|
| L2 suggest + consent | 3, 4 |
| Plan chrome Approve/Exit | 5 |
| Iterate draft from plan.updated | 6 |
| plans/ persist approved + snapshot | 1, 2, 3 |
| Soft-block Build with draft | 3, 5 |
| brief.md untouched | 1 (no brief writes) |

---

## Execution

User preference: Subagent-Driven, **no auto-commit**.
