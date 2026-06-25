# RightArea Add to Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize Terminal「Add to Chat」into a shared RightArea context-insert pipeline, then enable it for Files, TeX Workspace, and Git diff. Browser and PDF are explicitly out of scope.

**Architecture:** Shared `SelectionInsertAction` UI + `insertContextToChat()` delivery + `composer-insert-store` holding typed requests. Each surface provides a thin `*InsertHost` (Terminal done; new `CodeMirrorInsertHost` for editors). Composer gains `code-snippet` tokens alongside existing `terminal-snippet`.

**Tech Stack:** React 19, CodeMirror 6, xterm, Zustand, existing inline composer token field.

**Out of scope:** Browser webview selection, PDF/MuPDF selection, compile log panel (future).

---

### Task 1: Context insert types & store

**Files:**
- Create: `src/renderer/lib/chat/context-insert.ts`
- Modify: `src/renderer/stores/composer-insert-store.ts`
- Modify: `src/renderer/lib/chat/composer-parts.ts`
- Test: `tests/renderer/context-insert.test.ts`

- [ ] Add `CodeSnippetRequest`, `ContextInsertRequest`, `contextInsertToPart()`
- [ ] Store: `requestInsert` / `consumeInsert` (keep terminal aliases)
- [ ] Add `code-snippet` to `ComposerPart`

### Task 2: Unified insert pipeline

**Files:**
- Modify: `src/renderer/lib/chat/insert-to-chat.ts`

- [ ] `insertContextToChat(req)` — navigate to chat + enqueue
- [ ] Refactor `insertTerminalToChat` to call unified API

### Task 3: CodeMirror selection host

**Files:**
- Create: `src/renderer/lib/editor/selection-anchor.ts`
- Create: `src/renderer/components/modules/editor/codemirror-insert-host.tsx`

- [ ] Selection anchor from `EditorView.coordsAtPos`
- [ ] Host: listen selection, show chip, ⌘L shortcut

### Task 4: Wire editors

**Files:**
- Modify: `src/renderer/components/modules/editor/code-editor.tsx`
- Modify: `src/renderer/components/modules/editor/index.tsx` (LatexEditor)
- Modify: `src/renderer/modes/git-mode/git-diff-view.tsx`

- [ ] Wrap editor container with `CodeMirrorInsertHost`
- [ ] Pass `filePath`, `fileId`, `source`, `enabled={isActive}`

### Task 5: Composer rendering & prompt compile

**Files:**
- Modify: `src/renderer/components/modules/chat/chat-composer.tsx`
- Modify: `src/renderer/components/modules/chat/inline-composer/inline-composer-editor.tsx`
- Modify: `src/renderer/components/modules/chat/inline-composer/compile-composer-prompt.ts`
- Modify: `src/renderer/components/modules/chat/inline-tokens/*`

- [ ] Consume generic insert; `insertContextPart` handle
- [ ] `## Code context` section in agent prompt
- [ ] Code snippet chip variant

### Task 6: Verify

- [ ] `npx tsc --noEmit`
- [ ] `pnpm vitest run tests/renderer/context-insert.test.ts`
