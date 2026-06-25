# TexWorkspace UX Polish — Design Spec

**Date:** 2026-06-23  
**Status:** Approved for implementation

## Goal

Focus TexWorkspace on LaTeX writing: full manuscript file tree, compile feedback in the PDF pane (not the sidebar), and a cleaner toolbar without template-backup noise.

## Scope

### In scope

1. **Sidebar Files tab** — show the entire bound `manuscript` directory (`.tex`, `.bib`, images, `.sty`, etc.). Build artifacts stay in `.prismnext/compile/` and remain excluded from project scan.
2. **Remove sidebar Compile tab** — raw log no longer lives in the right sidebar.
3. **Remove toolbar Backup restore** — template backups remain in Settings → Backups and template flows.
4. **Problems pane** — toolbar toggles the right-hand pane between **PDF** and **Problems**; compile failure auto-opens Problems.

### Out of scope (later)

- Compile-root badge in file tree
- Forward SyncTeX (source → PDF)
- Manual snapshot / version history
- Moving Search out of toolbar

## Architecture

### Manuscript file tree

Reuse `filterFilesByMode` / `filterFoldersByMode` from `file-filter.ts` with mode `"manuscript"`. `buildFileTree(files, folders)` drives the sidebar. Click opens via `setTexworkspaceActiveFile`; `resolveViewer` routes by extension.

### Compile output directory

Unchanged: sources live under `manuscript/`, engine runs from project root, artifacts write to `.prismnext/compile/`. File tree shows **source assets only**.

### Right pane: compile problems overlay

State: `texworkspaceProblemsOpen: boolean` (layout-store, texworkspace only).

- Default: PDF preview (`components/modules/preview/`) in the preview slot
- Compile fails: **silent** — a single `⚠` button appears in the toolbar (no extra toggle group)
- User clicks button → `texworkspaceProblemsOpen = true` → preview slot shows `modes/texworkspace-mode/compile-problems-panel.tsx`
- Compile succeeds or user switches Split/TeX/PDF view → overlay closes, back to PDF
- Log parser lives in `modes/texworkspace-mode/parse-latex-log.ts` (module-local, not `lib/`)

## Toolbar layout (target)

```
[Split][TeX][PDF] | [Compile][Engine▾][Auto] [⚠?] ······ [Search][Σ][Env]
```

`[⚠?]` only visible after a failed compile. Backup removed from toolbar.

## Sidebar layout (target)

```
[Outline][References][Files]
```

No Compile tab.

## Files

| File | Change |
|------|--------|
| `texworkspace-sidebar.tsx` | Full manuscript tree; drop Compile tab |
| `texworkspace-toolbar.tsx` | Problems/PDF pane toggles; remove backup |
| `layout-store.ts` | `texworkspaceProblemsOpen` state |
| `right-main-area.tsx` | Swap PDF slot by pane mode |
| `compile-problems-panel.tsx` | New, under `texworkspace-mode/` |
| `parse-latex-log.ts` | New, under `texworkspace-mode/` |
| `use-texworkspace.ts` | Auto pane switch on compile complete |
