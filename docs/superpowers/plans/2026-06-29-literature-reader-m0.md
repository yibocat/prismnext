# Literature Reader M0–M3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task.

**Goal:** Ship Literature RightArea mode with project library, Lector reader, AI context, and Agent tools.

**Architecture:** Project-scoped SQLite library; main-process service + IPC; literature-mode UI; OpenCode tools via bun:sqlite.

**Tech Stack:** better-sqlite3, @anaralabs/lector, pdfjs-dist, Zustand, OpenCode plugin tools

---

## Completed Tasks

### Task 1: Native + package wiring
- [x] Add `better-sqlite3`, `@types/better-sqlite3`, `@codemirror/autocomplete`
- [x] `postinstall`: `electron-rebuild -f -w node-pty -w better-sqlite3`
- [x] `electron.vite.config.ts`: external `better-sqlite3`
- [x] `electron-builder.yml`: `asarUnpack` for better-sqlite3 + node-pty

### Task 2: Main service + IPC
- [x] `src/main/lib/bibtex-parse.ts`
- [x] `src/main/services/literature-service.ts`
- [x] `src/main/ipc/literature.ts`
- [x] Register in `src/main/ipc/index.ts`
- [x] Preload + `electron.d.ts` literature API

### Task 3: Literature mode UI
- [x] `mode-registry`: `literature` tab kind + fields
- [x] `modes/literature-mode/` (sidebar, toolbar, content, reader)
- [x] `stores/literature-store.ts`
- [x] `layout-store`: `RightToolbarTab` includes `literature`
- [x] `right-panel-store.openLiteraturePaper`

### Task 4: AI context (M0/M1)
- [x] `paper-snippet` in `context-insert.ts` + `composer-parts.ts`
- [x] `compile-composer-prompt.ts` Literature context section
- [x] Inline tokens for paper-snippet + @paper mention

### Task 5: Agent tools (M1)
- [x] `literature-search.ts`, `literature-read.ts`, `literature-cite.ts`
- [x] `BUILTIN_TOOLS` + `tool-permission-registry`

### Task 6: Write loop (M1)
- [x] `lib/literature/cite-autocomplete.ts` wired in `code-editor.tsx` for `.tex`

### Task 7: Review + polish (M2/M3)
- [x] `@paper` mention in composer dropdown
- [x] Reading-list sidebar view + Generate Review toolbar
- [x] Zotero BibTeX import + cross-project import actions

### Task 8: Tests + docs
- [x] `tests/main/literature-service.test.ts` (bibtex-parse)
- [x] Design spec: `docs/superpowers/specs/2026-06-29-literature-reader-design.md`

## Verification

```bash
cd prism-next
pnpm test tests/main/literature-service.test.ts
npx tsc --noEmit
pnpm dev   # manual: activate Literature mode, import PDF, highlight, Send to AI
```

## Notes

- Vitest runs on system Node; `better-sqlite3` is rebuilt for Electron. Full DB integration tests require Electron runtime or node-target rebuild before vitest.
- Agent tools require OpenCode session with project cwd pointing at manuscript root (`.prismnext/library` relative to cwd).
