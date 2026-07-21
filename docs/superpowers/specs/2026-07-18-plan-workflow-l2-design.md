# Plan Workflow L2 Design

**Date:** 2026-07-18  
**Status:** Approved  
**Supersedes (product intent):** identity-only framing in `2026-07-18-plan-mode-design.md` for *workflow UX*  
**Keeps:** session agent `build`/`plan` + Plan permission overrides (technical substrate)

## Problem

v0.5.13-era Plan Mode shipped as an **OpenCode primary-agent switch** (manual Build|Plan + stricter permissions). That is useful substrate, but it is **not** the research Plan workflow users expect:

- Agent-suggested entry (with consent)
- Clear composer Plan chrome
- Iterate plan → **Approve & execute** → only then Build/write/run

Without the workflow layer, Plan feels “not working” even when the permission gate is correct.

## Product model (L2)

```
[Chat] → Agent or user suggests Plan
      → User consents → Enter Plan (sessionAgent=plan + Plan chrome)
      → Iterate plan (A): steps/draft update in UI (+ optional draft file)
      → User Approves & Executes (B): persist formal plan → switch Build → execute
      → If user exits Plan without approve: optional snapshot to plans/
```

**L2 rule:** Agent may *propose* entering Plan; **only user consent** enters Plan.  
**Build rule:** Agent must not perform write/shell/experiment execution until user has **approved & executed** (or user manually chose Build without that gate — see open point below).

### Cursor vs Claude Code (reference)

| | Entry | Approx. level |
|--|--------|----------------|
| Cursor Plan | Suggest / UI; user confirms | **L2** |
| Claude Code Plan | Agent can switch agent | **L3** |
| prismnext target | Suggest + user consent | **L2** |

## Relationship to existing pieces

| Piece | Role after L2 |
|-------|----------------|
| `sessionAgent` + Plan permission overrides | Still the enforcement engine while in Plan |
| Composer Build\|Plan control | Keep as **manual override**; also reflect L2 state |
| `plan.updated` / PlanWidget | Drive **draft** steps during Iterate (A) |
| `.prismnext/research/brief.md` | Living project design — **not** a plan file |
| `.prismnext/research/plans/*.md` | Session plan snapshots (draft → approved) |

## UX

### Enter Plan

1. **Suggest bar** (in chat or above composer): “建议进入 Plan 模式以先规划再执行” + **进入 Plan** / **忽略**.
2. Triggers for suggest (v1 heuristics, conservative):
   - User asks to design/plan/method/实验设计/研究方案 without asking to edit files now
   - Agent emits a structured suggest signal (preferred) or main/renderer heuristic on user text
3. On **进入 Plan**: `setSessionAgent("plan")`, show Plan chrome on composer.

### Plan chrome (composer)

While `sessionAgent === "plan"`:

- Visible Plan chrome: planning banner + **查看草稿** + **同意并执行** + **退出规划**
- Plan chip next to composer `+`
- Soft-block leaving Plan when `current-draft.md` is non-empty

### Iterate (A)

- **Align with OpenCode built-in `plan` agent** (`agent.ts`): defaults allow tools (including bash); `edit` denied except plan markdown paths.
- Prism plan-of-record path is `.prismnext/research/plans/**` (not project `.opencode/plans/` — packaging/layout rule). Synced into app-level `opencode.json` → `agent.plan.permission.edit`.
- ACP Plan overrides only mirror that edit gate (+ deny execution tools like latex-compile / experiment-run). **Bash follows Permission Mode** (Auto → allow).
- OpenCode `plan.updated` may show an optional Checklist widget; formal plan is the draft file.
- User discusses revisions in chat; agent updates the draft until Approve.

### Approve & Execute (B)

1. Read `current-draft.md`; refuse if missing/empty.
2. **Rename** draft → `.prismnext/research/plans/<yyyy-mm-dd>-<short-id>.md` (`status: approved`) — refresh frontmatter in place, then rename (no copy left). That file is the execution plan of record.
3. Switch `sessionAgent` to `build`.
4. Composer **confirm panel** above the input (standalone, not a gate drawer). Stream shows a **Created Plan** card (click → open plan in RightArea). On Approve: decision card + silent Build kick (agent `read`s the plan file). On Reject: decision card, discard draft, cancel in-flight turn, brief agent ack — session stays open.
5. Only then may edits / bash / experiments proceed under normal Permission Mode.

### Exit without approve (deny)

- Switch to Build.
- **Delete** `current-draft.md` (no snapshot file).
- Do **not** auto-start execution.

While a decision is pending, the living file is only `current-draft.md`. Prior approved dated plans from earlier Approve cycles may remain in `plans/` as history.

**Session ownership:** Prism stamps draft frontmatter `sessionId` when a Plan-mode tab first sees a non-empty unclaimed draft. Approve chrome / soft-block / promote only apply when that `sessionId` matches the active chat session; another session’s draft does not surface the bar.

## Data layout

```
.prismnext/research/
  brief.md                 # living design (unchanged role)
  plans/
    current-draft.md       # living Plan draft (iterate until approve)
    2026-07-18-a3f2.md     # approved or snapshot plans
```

Frontmatter (approved/snapshot):

```yaml
---
id: a3f2
status: draft | approved | snapshot
sessionId: ...
createdAt: ...
updatedAt: ...
title: ...
---
```

Body: the agent-written plan markdown (intact). Not shredded from chat into fake Steps/Conclusions.

**Promotion to brief:** never automatic. Agent may suggest `research-brief-update` after approve; still ask.

## Technical notes

- Reuse `applySessionAgent` / Plan overrides with **path-scoped allow** for `current-draft.md`.
- Suggest must not call `applySessionAgent("plan")` until consent.
- “Allow always” already blocked for Plan ask tools; keep that.

## Out of scope (this L2 slice)

- Full L3 auto-enter without consent
- Auto-merge plan conclusions into `brief.md`
- Project-default “always Plan”
- Replacing Permission Mode

## Locked: Manual Build while draft exists

**(B)** Soft-block when draft file is non-empty: prompt “有未确认的计划 — 同意并执行 / 丢弃并 Build”.  
Empty Plan session (no draft file) may exit to Build freely.

## Success criteria

1. User enters Plan (slash Modes / chip); Plan chrome appears.
2. Agent writes/updates `current-draft.md`; user can **View draft**; chat stays commentary.
3. Approve renames non-empty draft to dated `plans/*.md`, switches Build, execution turn runs against that file.
4. Exit Plan without approve deletes the draft (no snapshot).
5. `brief.md` remains living design, not overwritten by plan files.

## Implementation status

| Capability | Status |
|------------|--------|
| Manual Build\|Plan + Plan permissions | **Shipped** (draft-path write allow) |
| L2 suggest + consent | **Shipped** (slash Modes → Plan; suggest bar removed) |
| Approve & Execute | **Shipped** (promote disk draft) |
| `plans/` persistence | **Shipped** (`current-draft.md` + dated approved/snapshot) |
| Plan chrome / soft-block | **Shipped** |
| Chat ≠ plan body | **Shipped** (prompt + path allow + promote) |
| Plan doc standard (Analysis / Plan / Checklist) | **Shipped** (`PLAN_DOC_STRUCTURE_HINTS` + Plan turn appendix) |
| Approve → todowrite + dual progress | **Shipped** (`buildApprovedPlanExecutePrompt`) |

Agent-emitted structured “suggest Plan” signal: see `2026-07-21-plan-suggest-design.md` (`suggest-plan` tool + user heuristic).

## Plan document standard (L2.1)

Cursor-style plan-of-record body (required section order):

1. **## Analysis** — brief background and constraints
2. **## Plan** — Phase → Step (or flat Steps); **nesting depth ≤ 2**, but each unit is **concrete** (files, commands, metrics, acceptance) — not one-line slogans
3. **## Checklist** — **step-execution gates**: exactly **one** `- [ ]` per top-level Plan unit (N Phases ⇒ N checklist items). Not a flattened dump of every inner bullet

**Progress dual-track (after Approve & Execute only):**

1. Rename draft → dated `plans/*.md` (plan of record), switch Build
2. Execution turn requires immediate **todowrite** seeded 1:1 from Checklist (same count/wording)
3. On each completed gate: update todowrite **and** mark the matching `- [ ]` → `- [x]` in the plan file
4. Re-read the plan file when progress is unclear

Plan-mode iteration must **not** force todowrite; chat remains commentary while the draft file is the plan of record.
