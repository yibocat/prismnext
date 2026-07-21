# Plan Suggest (dual trigger) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show shared `PlanSuggestBar` above the composer from (A) user-message heuristic and (B) `suggest-plan` tool — user must consent before Plan.

**Architecture:** Reuse existing store actions + `PlanSuggestBar`. Pure heuristic in `src/shared/plan-suggest.ts`. AI path uses file bridge → main resolves parent session / Plan / dismissed → `chat:stream` `plan.suggest` → renderer `showPlanSuggest`. Tool does not wait for user click.

**Tech Stack:** Electron main bridge, OpenCode custom tool, Zustand chat-store, existing PlanSuggestBar.

**Spec:** `docs/superpowers/specs/2026-07-21-plan-suggest-design.md`

---

### Task 1: Heuristic + tests

**Files:**
- Create: `src/shared/plan-suggest.ts`
- Create: `tests/shared/plan-suggest.test.ts`

- [x] Pure `shouldSuggestPlanFromUserMessage(text): boolean` — conservative multilingual cues
- [x] Tests: plan-like true; edit/compile/typo false

### Task 2: Mount bar + reason + heuristic on send

**Files:**
- Modify: `plan-suggest-bar.tsx`, `ai-bar.tsx`, `chat-composer-core.tsx`, `chat-store.ts`

- [x] Mount `<PlanSuggestBar />` next to `PlanChrome`
- [x] Tab field `planSuggestReason`; bar prefers reason over default i18n body
- [x] After enqueue user turn (Build, not dismissed): if heuristic → `showPlanSuggest`
- [x] `dismissPlanSuggest` IPC-notifies main dismissed map; accept/enter Plan clears reason

### Task 3: `suggest-plan` tool + bridge

**Files:**
- Create: `src/main/tools/suggest-plan.ts`
- Create: `src/main/services/plan-suggest-bridge.ts`
- Modify: `tool-names.ts`, `tools/index.ts`, `bridge-paths.ts`, `prism-bridge-paths.ts`, `tool-permission-registry.ts`, `index.ts` (start/stop), research-design prompt, preload/events as needed

- [x] Tool writes bridge request; returns status JSON
- [x] Bridge: parent session, `getSessionAgent`, dismissed set, emit `plan.suggest`
- [x] Renderer listens → `showPlanSuggest(tabId, reason)`
- [x] Tests for resolve status helper if extracted pure

### Task 4: Changelog + verify

- [x] `changelog/0.5.x.md` under 0.5.14
- [x] `pnpm exec vitest run` on new/related tests
