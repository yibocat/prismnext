# App Hint (toolbar tooltip) Design

**Date:** 2026-07-17  
**Status:** Implemented — toolbar/button controls migrated app-wide; data/truncation `title=` retained  
**Related:** [shortcut-registry-design](./2026-07-17-shortcut-registry-design.md)

## Problem

1. Shell controls use native `title=`, which is slow, OS-styled, and ignores light/dark tokens.
2. Stock shadcn Tooltip uses inverted `bg-foreground` / `text-background` — harsh and poorly themed.
3. Many toolbar labels omit resolved shortcut chords; some hard-code `⌘…`.

## Goals

1. One **Hint** API for icon/toolbar buttons: label + optional shortcut chips.
2. Surface uses **popover tokens** (`bg-popover`, `border-border`, `text-popover-foreground`) so light/dark match menus.
3. Shortcut chips always come from `resolveShortcut` / registry (no hard-coded ⌘ in JSX).
4. Keep Radix for positioning, delay, a11y — do not reimplement floating UI.

## Non-goals (this phase)

- Replace every `title=` in the app (paths, truncated text, dense tables stay native or later).
- Remap UI / Settings shortcut editor.
- Redesign sidebar `TooltipIconButton` consumers beyond inheriting the shared surface.

## API

```tsx
<Hint label="…" shortcutId="shell.toggleRightArea" side="bottom">
  <button type="button">…</button>
</Hint>
```

| Prop | Behavior |
|------|----------|
| `label` | Visible description. If omitted and `shortcutId` set, use registry i18n label. |
| `shortcutId` | Optional. Renders resolved chord as `Kbd` chips after the label. |
| `side` | Default `bottom`. |
| `delayDuration` | Default ~400ms (toolbar-friendly). |

Empty label + no shortcut → render children only (no wrapper).

## Visual

- Compact row: `label` (muted-foreground / foreground) + gap + `Kbd` group.
- No arrow (align with menus / popovers).
- `text-[length:var(--font-size-11)]` or 12; padding `px-2 py-1`.
- Restyle shared `TooltipContent` to the same surface so existing Radix tooltips improve too.

## Migration order

1. Restyle `ui/tooltip` + add `ui/hint`. ✅
2. Shell: sidebar toggle, RightArea toggle, new agent, command palette (`shell.commandPalette` + global host / ⌘K), theme/window buttons. ✅
3. RightArea toolbar modes / maximize / close; Git refresh; welcome chrome; chat AiBar / composer / turn footer. ✅
4. Mode toolbars (TeX / Terminal / Browser / Literature / Experiments / Files / Git) + Settings/Chat icon buttons. ✅

## Out of band

Native `title` remains OK for non-control affordances (full path on truncate, DOI/URL display links, TeX symbol `sym.command`, card titles, etc.).
