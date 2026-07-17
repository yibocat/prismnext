# Editor Find / Replace Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace CodeMirror’s default bottom search UI with a Prism-styled top find/replace panel.

**Architecture:** Custom `createPanel` for `@codemirror/search`, shared through `editorSearchAndKeymap`. DOM panel uses app CSS variables; search state stays in CM.

**Tech Stack:** CodeMirror 6 `@codemirror/search` / `@codemirror/view`, Vitest, existing editor tokens.

---

### Task 1: Match-count helper + panel factory tests

**Files:**
- Create: `src/renderer/lib/editor/search-panel.ts`
- Create: `tests/renderer/editor-search-panel.test.ts`

- [x] Write failing tests for `countSearchMatches` / panel `top: true`
- [x] Implement helpers + `createPrismSearchPanel`
- [x] Green tests

### Task 2: Wire into editorSearchAndKeymap + styles

**Files:**
- Modify: `src/renderer/lib/editor/keymap.ts`
- Modify: `src/renderer/styles/tokens/editor.css` and/or `globals.css`
- Export from `src/renderer/lib/editor/index.ts`

- [x] Pass `createPanel` into `search({...})`
- [x] Add `.prism-cm-search` styles matching ChangesBar
- [x] tsc + vitest

### Task 3: Manual polish checklist

- [ ] ⌘F top bar; expand replace; Aa/W/.*; Esc; dark mode
