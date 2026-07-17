# Shortcut Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a unified shortcut registry (shell/editor fixed; workspace/product remappable-ready) with `primary` chords, resolve API, Settings page driven by registry, and tooltips that show resolved chords.

**Architecture:** Pure chord logic + registry live in `src/shared/shortcuts/`. Renderer wraps resolve with i18n for tooltips. Listeners match via `chordMatchesEvent`. `shortcutOverrides` reserved in settings (ignored for non-remappable). No remap UI yet.

**Tech Stack:** TypeScript, Vitest, existing settings store / i18n / shell hooks.

**Spec:** [`docs/superpowers/specs/2026-07-17-shortcut-registry-design.md`](../specs/2026-07-17-shortcut-registry-design.md)

---

### Task 1: Shared types, format, match

**Files:**
- Create: `src/shared/shortcuts/types.ts`
- Create: `src/shared/shortcuts/format.ts`
- Create: `src/shared/shortcuts/match.ts`
- Create: `src/shared/shortcuts/index.ts`
- Test: `tests/shared/shortcuts.test.ts`

- [x] Types: `ShortcutChord`, `ShortcutDef`, `ShortcutScope`, categories
- [x] `formatChord(chord, platform: "darwin" | "win32" | "linux")`
- [x] `chordMatchesEvent(chord, event, platform)`
- [x] Unit tests for format + match (primary on darwin vs win32; ignore overrides conceptually in Task 3)

### Task 2: Registry + resolveChord

**Files:**
- Create: `src/shared/shortcuts/registry.ts`
- Create: `src/shared/shortcuts/resolve.ts`
- Modify: `tests/shared/shortcuts.test.ts`

- [x] Seed shell / editor / workspace / product defs from spec
- [x] `resolveChord(id, overrides?)` — ignore overrides when `!remappable`
- [x] `getShortcutDef(id)`, `listShortcuts()`

### Task 3: Settings field + renderer resolve/tooltip

**Files:**
- Modify: `src/main/services/settings.ts` — optional `shortcutOverrides` on type/defaults (passthrough via raw store OK)
- Modify: `src/renderer/stores/settings-store.ts` — `shortcutOverrides?: Record<string, ShortcutChord>`
- Create: `src/renderer/lib/shortcuts/resolve.ts` — `resolveShortcut` / `shortcutTooltip` using i18n + settings overrides
- Create: `src/renderer/lib/shortcuts/index.ts`

- [x] Done

### Task 4: Wire shell + right-area listeners to registry

**Files:**
- Modify: `src/renderer/hooks/use-app-shell-shortcuts.ts`
- Modify: `src/renderer/hooks/use-right-area-shortcuts.ts`

- [x] Match keys via `chordMatchesEvent(resolveChord(...).chord, e)`
- [x] Behavior unchanged (open/close RightArea, sidebar, settings, save, git refresh, tab cycle)

### Task 5: Tooltips on shell controls

**Files:**
- Modify: `sidebar-controls.tsx`, `sidebar-toolbar.tsx`, `title-bar.tsx`, `main-toolbar.tsx`, and other obvious RightArea toggle buttons
- Use `shortcutTooltip("shell.toggleLeftSidebar")` etc.

- [x] Done

### Task 6: Settings Shortcuts page from registry

**Files:**
- Modify: `shortcuts-settings.tsx` — group by category from `listShortcuts()`
- Modify: i18n en / zh-CN / zh-HK — labelKeys for registry ids; fixed badge copy

- [x] Done

### Task 7: Verify

- [x] `pnpm exec vitest run tests/shared/shortcuts.test.ts` (16 tests with close-active-tab)
- [ ] Manual: ⌘\\ / ⌘B / tooltips show chords

---

**Out of scope this plan:** remap UI, CodeMirror keymap rewrite, menu dynamic rebuild for remappable items.
