# Chat open-tabs (ContentTopBar) — Design

Date: 2026-07-17

## Problem

Chat already uses in-memory `TabState` (bound to an optional OpenCode `sessionId`), with ⌘T / Ctrl+Tab / ⌘W. Users cannot see which chat tabs are open — only the left sidebar’s persistent session history.

## Decision

Expose **open chat tabs** in the center `ContentTopBar` as a light strip.

- Show only when `tabs.length >= 2` (single-tab UI stays as today’s status dot + `SessionTitle`).
- Do **not** reuse RightArea `TabBar` (`RightTab` is a different model).
- Left sidebar remains the **disk session** directory; the strip is **open tabs only**.

## Behavior

| Action | Result |
|--------|--------|
| Click tab | `setActiveTab` |
| Close (×) | `closeTab` — does not archive/delete the session |
| Close while streaming | Disabled (store already no-ops) |
| Drop to 1 tab | Strip hides; single `SessionTitle` returns |
| ⌘T / Ctrl+Tab | Unchanged; now aligned with visible strip |

## UI

- Live in `content-top-bar/` (domain home for center chrome).
- Compact chips: truncated title (`resolveSessionTitle` + `displayChatTitle`), streaming dot, ×.
- Chips use `no-drag` inside the titlebar drag region.
- Horizontal overflow scroll when many tabs; no reorder / context menu in v1.

## Follow-ups (included)

- Opening a history session **drops disposable empty** New Chat tabs (no sessionId / messages / draft).
- Open-tabs strip scrolls horizontally (including vertical-wheel → horizontal).
- Hover on each chip (and single-tab title) shows **session-scoped** context: title, checkout/worktree, staged citations count, AI terminal — not project/agent chrome.

## Out of scope (v1)

- Drag-reorder, pin, right-click menu
- Merging strip into RightArea chrome
- Changing session archive/delete semantics
- Showing the project’s current git branch for local (non-worktree) sessions
