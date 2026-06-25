# RightArea Add to Chat — Design

**Date:** 2026-06-23  
**Status:** Implemented (Phase 1)

## Goal

Unify「选区 → Add to Chat」across RightArea text surfaces so any context can be sent to the Agent composer with one interaction pattern.

## In scope

| Surface | Host | Composer token |
|---------|------|------------------|
| Terminal (user + AI) | `TerminalInsertHost` | `terminal-snippet` |
| Files editor | `CodeMirrorInsertHost` | `code-snippet` |
| TeX Workspace editor | `CodeMirrorInsertHost` | `code-snippet` |
| Git diff | `CodeMirrorInsertHost` (`source: git-diff`) | `code-snippet` |

## Out of scope (future dedicated work)

- Browser / webview selection
- PDF / MuPDF text selection
- Compile log / problems panel plain-text selection

## Architecture

```
SelectionInsertAction (shared UI)
        ↑
 *InsertHost per surface (selection + anchor)
        ↓
insertContextToChat()  →  composer-insert-store
        ↓
ChatComposer  →  code-snippet | terminal-snippet token
        ↓
compileComposerPrompt  →  ## Code context | ## Terminal context
```

## Adding a new surface

1. Detect non-empty selection and anchor rect in the mode's view.
2. Call `insertContextToChat({ kind: "code" | "terminal", ... })` or add a new `kind` in `context-insert.ts`.
3. Extend `contextInsertToPart`, composer chip, and `compile-composer-prompt` if a new token type is needed.

## UX

- Floating inline chip at selection top-right
- Shortcut: **⌘L** (same as Terminal)
- Inserts structured token in composer; agent prompt includes fenced code block with path + line range
