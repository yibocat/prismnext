# Plan Mode Design

**Date:** 2026-07-18  
**Status:** Approved  
**Concept board:** Cursor canvas `plan-mode-concepts.canvas.tsx`

## Summary

Expose OpenCode primary agents **Build** and **Plan** as a first-class **per chat tab** session identity in prismnext, so research workflows can explicitly plan (literature, method, experiment design) without relying on Permission Mode alone to approximate “don’t edit.”

## Locked decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Plan vs Permission Mode | **Plan overrides writes/shell** — even if global mode is Auto, Plan denies file mutation + bash |
| 2 | Scope | **Per chat tab** (`sessionAgent` on `TabState`); new tabs default **Build** |
| 3 | Plan + bash | **deny** |
| 4 | Plan + literature write (`literature-add` / delete / export-bib) | **ask** |
| 5 | Plan + `research-brief-update` | **ask** (allowed plan artifact with confirm) |
| 6 | Plan → Build | **Same session** via `session/set_config_option` `agent` |
| 7 | Plan UI (v1) | **Switch + status**; improve `plan.updated` widget lightly (structured steps). No `.opencode/plans` in project tree |
| 8 | Default | **Build** |

## Concept model (do not collapse)

1. **Session agent** (`build` \| `plan`) — OpenCode primary agent identity for the tab.
2. **Permission Mode** (`ask` \| `edit_auto` \| `auto` \| `readonly`) — global prismnext gate; still applies under Build; under Plan is **capped** by Plan overrides.
3. **`plan.updated` / `session/plan`** — structured execution-plan event; not the same as “being in Plan agent.”

## Effective permission under Plan

Resolve per tool as:

```
effective = planOverride(tool) ?? permissionModeRule(tool)
```

Plan overrides (v1):

| Tool / group | Plan rule |
|--------------|-----------|
| `edit`, `write`, `apply_patch`, `delete`, `move` | **deny** |
| `bash` / shell-like | **deny** |
| `latex-compile`, `experiment-run` | **deny** |
| `experiment-log` (mutations) | **deny** |
| `literature-add`, `literature-delete`, `literature-export-bib` | **ask** |
| `research-brief-update` | **ask** |
| Read / search / `literature-search|read|read-pdf|stage`, `latex-root`, `research-brief-read`, `question`, `todowrite`, `results-snapshot`, `provenance-query` | follow Permission Mode (usually allow) |

Enforcement must happen in **ACP `requestPermission` path** (session-aware), not only by rewriting global `opencode.json` — because Plan is per-tab while `applyPermissionMode` is process-global today.

## UX

- Composer toolbar: segmented **Build | Plan** control (near Permission Mode; visual weight = session identity).
- Plan active: short hint (“规划模式 · 不改文件 / 不跑 shell”).
- Selecting Plan while an expert **orchestrator** is selected: Plan wins for ACP `agent` (`plan`); orchestrator UI shows disabled/cleared with toast or inline note — both cannot own `session/set_config_option` `agent` at once.
- Switching Build ↔ Plan mid-session: call `setConfigOption(sessionId, "agent", value)` when session exists; persist on tab for next `chat:send`.

## Architecture

| Layer | Responsibility |
|-------|----------------|
| `chat-store` `TabState.sessionAgent` | Per-tab Build/Plan; default `build` |
| Composer toolbar select | User switch; updates tab + IPC if session live |
| `chat:send` / new IPC `chat:setSessionAgent` | Pass/apply agent to OpenCode |
| `AcpService` session→agent map | Permission resolution + `setConfigOption` |
| `permission-modes` / small helper | `resolveEffectivePermissionRule(mode, agent, tool)` |
| Plan widget (optional v1 polish) | Better rendering for `plan.updated` tool_use |

## Out of scope (v1)

- Project-default Plan / Experiments-mode auto-Plan
- Writing plans into `.opencode/` or project root
- Plan-only slash commands catalog
- Changing orchestrator Task builtin deny policy
- Separate “Plan permission mode” settings page

## Success criteria

1. User can switch a tab to Plan, send a turn, and file edits / bash are denied even with Auto.
2. Literature search/read still works in Plan.
3. `research-brief-update` prompts (ask) in Plan.
4. Build restores previous Permission Mode behavior for that tab’s session.
5. Plan and orchestrator agent conflict is handled without silent mis-routing.
