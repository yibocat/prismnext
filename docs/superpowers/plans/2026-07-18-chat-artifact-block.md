# Chat Artifact Block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 1 — `ChatArtifactBlock` shell with `image` + `generic` renderers, ` ```artifact ` fence parsing, and narrow experiment auto-fallback (cap 5).

**Architecture:** Parse `language-artifact` fences in the chat code component; shared shell in `lib/markdown`. Markdown `![](path)` routes through the image specialization. Auto-fallback emits the same fences so one render path.

**Tech Stack:** React 19, react-markdown, existing `ChatProjectImage` / `openArtifactPathInFiles`, Vitest.

**Spec:** [docs/superpowers/specs/2026-07-18-chat-artifact-block-design.md](../specs/2026-07-18-chat-artifact-block-design.md)

---

### Task 1: Parse + kind helpers

**Files:**
- Create: `src/renderer/lib/markdown/chat-artifact.ts`
- Test: `tests/renderer/chat-artifact.test.ts`

- [x] `parseArtifactFenceContent`, `classifyArtifactKind`, `normalizeArtifactDisplayPath`, `assistantTextEmbedsArtifactPath`, `buildArtifactFenceMarkdown`

### Task 2: ChatArtifactBlock UI

**Files:**
- Create: `src/renderer/lib/markdown/chat-artifact-block.tsx`
- Modify: `extract-markdown-images.tsx` only if needed to export bare image body

- [x] Shell for `generic`; `image` → `ChatProjectImage` (no double plate)
- [x] Open in Files + copy path

### Task 3: Wire markdown pipeline

**Files:**
- Modify: `shiki-code-block.tsx` — `lang === "artifact"` → block
- Modify: `static-markdown.tsx` — `img` → image specialization of block (or keep ChatProjectImage if equivalent)

- [x] Fence → `ChatArtifactFence`; markdown images → `ChatArtifactBlock kind="image"`

### Task 4: Auto-fallback for all artifacts

**Files:**
- Modify: `experiment-run-figures.ts` → generalize paths + fence fallback + cap 5
- Modify: `assistant-block-list.tsx`
- Test: update `experiment-run-figures.test.ts`

- [x] All artifact kinds; snapshot-by-basename for images; fence fallback; basename dedupe

### Task 5: Prompts + changelog

**Files:**
- Modify: `reply-depth.ts`, `experiments.ts`
- Modify: `changelog/0.5.x.md`
- Modify: i18n `chat.artifact.*`

- [x] Prompt guidance + changelog + i18n

---

### Task 6: Phase 1b — tool-card galleries

**Files:**
- Modify: `experiment-tool-widget.tsx`, `assistant-block-list.tsx`, `tool-widget-dispatcher.tsx`
- Modify: `chat-artifact.ts` / `chat-artifact-block.tsx` / `experiment-run-figures.ts`

- [x] Gallery uses `ChatArtifactBlock` for all artifact kinds (not images-only)
- [x] Dedupe vs reply embeds + capped fallback; overflow may still show on the card

### Task 7: Phase 2 — PDF peek

**Files:**
- Create: `src/renderer/lib/markdown/chat-artifact-pdf.tsx`
- Modify: `shared/artifact-path.ts`, `chat-artifact.ts`, `chat-artifact-block.tsx`

- [x] `kind: pdf` — first-page peek; click → dialog with `PdfDocumentView`; Open in Files

### Later

- [ ] Phase 3+: table / html renderers
