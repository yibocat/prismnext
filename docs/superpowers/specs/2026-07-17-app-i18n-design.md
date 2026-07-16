# App UI i18n (prismnext) — Design

**Date:** 2026-07-17  
**Status:** P1–P6 largely done — Git commit/toolbar, Shortcuts, Quick Command, Zotero disconnect, Files delete, Literature secondary panes · remaining: git-store toasts, browser/tex empty states, literature type/origin labels, low-freq chat toasts  
**Out of scope:** AI reply language; cache clearing (later)

## Goal

App **UI language** (not agent reply language). Persist preference; switch Settings / Welcome / common dialogs first, then shell UI later.

## Preference model

| Value | Meaning |
|-------|---------|
| `en` | English（默认；列表第一项） |
| `zh-CN` | 简体中文 |
| `zh-HK` | 繁體中文（香港） |

Stored as `appLocale` in electron-store / settings store. Default: `en`.  
No follow-system option; legacy stored `"system"` normalizes to `en`.

Regenerate `zh-HK.json` from `zh-CN.json` with `node scripts/generate-zh-hk-locale.mjs` after large dictionary updates.

## Stack

- `i18next` + `react-i18next` in renderer
- JSON catalogs under `src/renderer/lib/i18n/locales/`
- Main-process application menu uses a small shared string table keyed by resolved locale (rebuild menu when `appLocale` changes)

## Phases

1. **P1 (done):** Infrastructure + persist + General “App language” + Settings sidebar / General + Welcome + New Project / Setup dialogs + menu
2. **P2 (done):** TitleBar, left nav, Chat shell
3. **P3a (done):** Mode toolbar labels / tab titles / RightArea chrome; Git Changes·History + empty states; Literature reader tabs; Settings list page titles; Appearance + Models bodies; settings slot titles
4. **P3b (done):** Files/Browser/Terminal/TeX toolbars & sidebars; Literature library/toolbar; Settings section headers & primary actions
5. **P3c (done):** Settings detail editors (Save/Cancel, empty states), pageDesc, high-visibility toasts
6. **P4 (in progress):** Settings long row descriptions / form labels; Dialogs (tab close, permission, worktree, literature collections, commands import, git toolbar, etc.)
7. **Later:** Shortcuts reference table; remaining mode dialog bodies (Zotero connect, template switch); low-frequency copy

## Non-goals (P1)

- Translating every Settings detail panel
- AI reply language setting
- Cache clearing UI
