# Files & Tab UX Design

**Date:** 2026-06-22  
**Status:** Approved for implementation  
**Out of scope:** Multi-window / drag-tab-to-new-window, Cmd+P quick open, Close Others / Close to the Right / Close Saved

## Goals

Unify file-tab behavior with VS Code conventions, improve file-tree and breadcrumb UX, and define how external files interact with AI context—without rewriting the tab system.

## Concept Model

| Concept | Store / Type | Notes |
|---------|--------------|-------|
| **Tab** | `RightTab` in `right-panel-store` | Lifecycle, preview/pin, kind |
| **File session** | `document-store.openedContents` + `fileMetadata` | Content, dirty, project vs external |
| **Preview tab** | `isPreview: true` | Italic; replaced on next single-click open |
| **Pinned tab** | `isPreview: false` | Normal weight; survives navigation |
| **MD render mode** | `viewMode: "preview" \| "source"` | Markdown **rendering** only—not tab preview |

## Tab Lifecycle

- `requestCloseTab(id)` — single entry for all closes; checks dirty (file tabs) and busy (terminal) before `closeTab`.
- Dirty file tabs: confirm dialog before close.
- Tab label: `*` prefix when dirty (in addition to existing dot indicator).
- Shortcuts (when Files/TexWorkspace tab focused):
  - `Cmd+W` — close active tab via `requestCloseTab`
  - `Cmd+S` — save active file
  - `Ctrl+Tab` / `Ctrl+Shift+Tab` — next/prev file tab in Files mode

## File Tree Context Menu

- **Reveal in Finder** — `shell.showItemInFolder(absolutePath)`
- **Copy Path** — absolute path to clipboard
- **Copy Relative Path** — project-relative path (project files only)

## Breadcrumb

- Collapse long paths: `project / … / parent / file`
- External files: full absolute path segments; non-clickable middle segments
- Click project-relative segment: expand tree **and** open file tab if segment is a file path

## Recent Files

- Persist `recentOpenedFiles` in settings (max 10)
- Updated on every project/external file open
- Shown in `NoFileOpen` empty state

## External Files × AI

- `@mention` file picker includes **open external files** (from `fileMetadata` with `isExternal`)
- Display path = absolute path for external files
- Prompt compilation reads disk when external content not cached
- **Agent cwd unchanged** — external files are context attachments only

## Markdown Naming

Toolbar tooltips: **"Rendered view"` / `"Source view"`** to avoid confusion with preview tabs.
