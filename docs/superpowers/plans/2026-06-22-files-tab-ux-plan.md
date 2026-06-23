# Files & Tab UX Implementation Plan

> **For agentic workers:** Implement phase-by-phase; run `npx tsc --noEmit` and targeted vitest after each phase.

**Goal:** Tab lifecycle, file-tree actions, breadcrumbs, recent files, external @mention—no multi-window.

**Architecture:** Extend `right-panel-store` with `requestCloseTab`; shell IPC for Reveal; settings-backed recent files; `getMentionableFiles()` for composer.

---

## Phase 1 — Tab lifecycle

- [ ] `src/renderer/lib/tab-lifecycle.ts` — dirty check helpers
- [ ] `requestCloseTab` in `right-panel-store.ts`
- [ ] Tab bar `*` prefix; wire `onClose` → `requestCloseTab`
- [ ] `use-right-area-shortcuts.ts` — Cmd+W/S, Ctrl+Tab

## Phase 2 — Tree & breadcrumb

- [ ] `shell:showItemInFolder` IPC
- [ ] Context menu: Reveal, Copy Path, Copy Relative Path
- [ ] `collapseBreadcrumbSegments()` in tab-toolbar

## Phase 3 — Recent files & MD labels

- [ ] `recentOpenedFiles` in settings (main + renderer)
- [ ] Track on file open; `NoFileOpen` recent list
- [ ] Markdown toolbar tooltip rename

## Phase 4 — External × AI

- [ ] `getMentionableFiles()` including external metadata
- [ ] `compileComposerPrompt` disk read for external files

## Tests

- [ ] `tab-lifecycle.test.ts`
- [ ] `breadcrumb-segments.test.ts`
- [ ] `mentionable-files.test.ts`
