# Plan Suggest (dual trigger) Design

**Date:** 2026-07-21  
**Status:** Implemented (v2: countdown + wait)  
**Depends on:** `2026-07-18-plan-workflow-l2-design.md`  
**Related UI:** `PlanSuggestBar`, `PlanChrome`, `chat-store` planSuggest\* fields

## Problem

L2 Plan workflow requires **user consent** before entering Plan. Manual entry (`/` → Modes → Plan, homepage chip) already works.

## Goal

While in **Build**, surface one shared suggest strip above the composer (Cursor-style consent window):

1. **User-message heuristic** — after user send matching plan intent, **defer `chatSend`** until decision  
2. **AI tool `suggest-plan`** — **block the turn** (like `question`) until decision  

Consent window: **15s** countdown progress; **timeout ≡ dismiss** (stay Build).  
**Enter Plan** / **Dismiss** buttons. AI must **never** auto-switch without accept.

**Approve & Build** remains a separate gate after the draft exists — **no** countdown auto-approve.

## Non-goals

- L3 auto-enter Plan without consent  
- Second UI language (drawer / toast / chat bubble)  
- Prose markers / regex on assistant text as the AI signal  
- Changing Approve & Build / Deny / per-session draft semantics  

## UX

### Placement

Reuse `PlanSuggestBar` visual language (same as Approve chrome: opaque `bg-card`, title + body + `xs` buttons).

Mount next to `PlanChrome`:

- `ai-bar.tsx` — above the morph capsule (same wrapper as PlanChrome)  
- `chat-composer-core.tsx` (panel variant) — above the input card  

### Visibility rules

Show only when **all** hold:

- Active tab `sessionAgent === "build"`  
- `planSuggestVisible === true`  
- `planSuggestDismissed === false`  

Hide / no-op when already in Plan, or when Plan Approve chrome is the active concern (Build-only gate already prevents overlap with Plan chrome).

### Actions

| Action | Behavior |
|--------|----------|
| Enter Plan | `acceptPlanSuggest` → `setSessionAgent("plan")` + existing Plan chip / soft-restore rules |
| Dismiss / × | `dismissPlanSuggest` → `planSuggestDismissed: true`, clear visible; this tab won’t suggest again until… (see persistence) |

### Copy

Keep existing i18n keys under `chat.planWorkflow.suggest*` as defaults. Optional tool `reason` may replace the body line when non-empty (clamp ~160 chars).

## Trigger A — user heuristic

After a successful user send on a Build tab (before or after stream start — prefer **immediately after enqueueing the user turn** so the strip can appear while the model thinks):

1. If `planSuggestDismissed` or not Build → skip  
2. If message text matches a **conservative** plan-intent heuristic → `showPlanSuggest`  

Heuristic intent (implementation detail in plan): multilingual cues such as plan/design/研究方案/实验设计/先规划/methodology — avoid bare “edit abstract” / compile / fix typo.

Do **not** require the assistant to finish before showing.

## Trigger B — tool `suggest-plan`

### Contract

| Field | Value |
|-------|--------|
| Name | `suggest-plan` |
| Kind | Prism custom OpenCode tool |
| Side effects | None on disk / session agent; only UI state via main → renderer |
| Input | Optional `reason?: string` (short why) |
| Output | `{ suggested: true \| false, reason?: string, status: "shown" \| "already_plan" \| "dismissed" \| "ignored" }` |

### Behavior

1. Resolve chat tab from tool session (parent session if Task sub-session — prefer **parent orchestrator tab**; if only sub-session, no-op with `ignored`).  
2. If tab is Plan → return `already_plan`, do not flip UI.  
3. If `planSuggestDismissed` → return `dismissed`.  
4. Else set `planSuggestVisible` (and optional reason for body) → return `shown`.  

Permission: treat as read-only / allow (like `question` interactivity without blocking the turn long-term). Tool should **not** wait for the user to click Enter Plan — it only posts the strip; the model continues or finishes the turn normally. User may enter Plan on a **later** turn.

### Prompt

Orchestrator / task-delegation or research-design module (thin addition):

- When work should be planned before edits/experiments, call `suggest-plan` once.  
- Do not claim Plan mode is active until the user accepts.  
- Do not use Task/@Explore for this.

## Persistence

- `planSuggestVisible` / `planSuggestDismissed` / optional `planSuggestReason` — **tab-local**, not required in `sessions-display.json` for v1.  
- New chat tab → fresh suggest eligibility.  
- Soft-restore to Plan (pending draft) clears suggest visibility (already Plan).

## Success criteria

1. Heuristic on a Build tab shows the strip; Enter Plan switches to Plan; Dismiss stops further suggests on that tab.  
2. Model call to `suggest-plan` shows the same strip; does not change `sessionAgent`.  
3. Strip appears in both AiBar and panel composer slots.  
4. Already Plan / dismissed → tool returns non-`shown` without UI spam.  
5. Approve chrome and suggest strip never both show (Build vs Plan gate).

## Implementation sketch (not binding)

| Area | Change |
|------|--------|
| `plan-suggest-bar.tsx` | Optional reason from store; already built |
| `ai-bar.tsx` / `chat-composer-core.tsx` | Mount `<PlanSuggestBar />` beside PlanChrome |
| `chat-store.ts` | Wire heuristic on send; optional `planSuggestReason`; IPC/event handler for tool |
| `src/main/tools/` | New `suggest-plan` tool + registry + permission |
| Prompts | One short module bullet |
| Tests | Heuristic pure fn; tool outcome matrix; mount smoke optional |

## Out of scope follow-ups

- Cross-tab “don’t suggest for this project” preference  
- Auto-dismiss suggest when user starts unrelated work without dismissing  
- Streaming “partial” suggest before tool completes  
