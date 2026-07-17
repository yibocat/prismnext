# Editor Find / Replace Panel — Design

**Status:** approved  
**Date:** 2026-07-17  
**Approach:** CodeMirror `search({ createPanel })` — floating top-right widget (VS Code–style)

## Problem

`⌘F` must not use CodeMirror’s default bottom form. A full-width top bar also steals vertical space for a transient action.

## Goals

- Floating find widget, top-right of the editor content (over the scroller)
- Find by default; expand to replace
- Full match toggles: case (`Aa`), whole word (`ab`), regexp (`.*`) — inside the find field
- Keep registry shortcuts: `editor.find` / `editor.closeSearch`
- Shared by `LatexEditor` and `CodeEditor`

## Non-goals

- Project-wide / manuscript search (sidebar)
- React Hint chips inside the panel (native `title` OK)
- Remapping find chords
- “Find in selection” (can add later)

## Placement

```
[ Mode / tab toolbar ]
[ ChangesBar? ]
[ Editor document ]
        └── floating find (absolute, top-right, z-25)
```

CM still uses `Panel.top`, but CSS takes `.cm-panels-top:has(.prism-cm-search--float)` out of flow so the scroller is not pushed down.

## Layout

### Collapsed (find only)

| Zone | Control |
|------|---------|
| Left | Expand replace toggle |
| Main | Find field: input + in-field toggles Aa / ab / .* |
| Meta | Match count `i/n` or `0` / `—` |
| Nav | Prev · Next · Close |

### Expanded — second row

| Zone | Control |
|------|---------|
| Main | Replace input (gutter-aligned under expand) |
| Actions | Replace · Replace all |

## Chrome

- Popover surface: `bg-popover`, border, rounded — no drop shadow
- Inset from editor top/right (`top`/`right` ~16px / 12px) so it is not flush under the toolbar
- Compact ~26–28px row height; width `--width-search-float` (capped to editor)
- Active toggle: primary-tinted chip
- Invalid regexp: count `—`, destructive ring on find field

## Keyboard

| Key | Behavior |
|-----|----------|
| ⌘F | `openSearchPanel` / focus find |
| Esc | `closeSearchPanel` |
| Enter (find) | next |
| ⇧Enter (find) | prev |
| ⌘Enter (replace focused) | replace current |

## Implementation

- Home: `src/renderer/lib/editor/search-panel.ts` (+ CSS under editor tokens / globals)
- Wire via `search({ createPanel: createPrismSearchPanel })` in `editorSearchAndKeymap`
- Use CM APIs only: `SearchQuery`, `setSearchQuery`, `findNext`, `findPrevious`, `replaceNext`, `replaceAll`, `closeSearchPanel`
- Do not restyle the default panel via CSS hacks

## Testing

- Unit: panel factory returns `top: true`; query sync helpers (case/word/regexp)
- Manual: open ⌘F on TeX + code file; expand replace; toggles; Esc; theme light/dark
