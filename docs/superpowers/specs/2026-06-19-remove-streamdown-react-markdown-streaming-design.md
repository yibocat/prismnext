# Remove Streamdown, Unified react-markdown with Streaming

**Date:** 2026-06-19
**Status:** Approved
**Project:** prism-next

---

## Motivation

The current AI chat streaming renderer uses `streamdown` (v2.5.0) with 4 companion plugins (`@streamdown/code`, `@streamdown/math`, `@streamdown/mermaid`, `@streamdown/cjk`). Extensive effort has been invested in making streamdown handle streaming correctly, but the results have been unsatisfactory. The core problem:

- Streamdown's incremental parsing engine does heavyweight work (markdown AST parsing, Shiki syntax highlighting, KaTeX rendering, Mermaid rendering) on **every delta token**.
- This causes visible lag: the caret races ahead while content renders slowly behind it.
- The engine is a black box — we cannot change its core behavior.

Meanwhile, `react-markdown` is already used for file preview in `markdown-preview.tsx`. Unifying on one library reduces dependency burden and gives us full control over the streaming rendering strategy.

## Goal

1. **Remove** `streamdown` and all 4 companion packages entirely.
2. **Replace** the chat markdown renderer with `react-markdown` (same library as file preview).
3. **Implement** a custom streaming strategy: "block caching + lightweight tail" — the industry-standard approach used by VS Code Copilot, Claude.ai, and Cursor.
4. **Keep** Shiki syntax highlighting (dual theme), KaTeX math rendering, code folding, and copy buttons.
5. **Remove** Mermaid diagram support (rarely used; can be re-added later if needed).
6. **Remove** CJK plugin (Tailwind + browser-native CJK handling is sufficient).
7. **Share** remark/rehype plugin configuration between chat and file preview.

## Non-Goals

- Changing the OpenCode → ACP → IPC → renderer data flow.
- Modifying chat message types, store structure, or tool widgets.
- Changing the file preview (`markdown-preview.tsx`) beyond extracting shared config.

---

## Architecture

### Before vs After

```
BEFORE:
  OpenCode → ACP → EventMapper → IPC → useOpenCodeEvents
    ├── emitStreamState → ChatMessages re-render
    └── emitStreamDelta → Streamdown incremental parser
                              ├── @streamdown/code (Shiki)
                              ├── @streamdown/math (KaTeX)
                              ├── @streamdown/mermaid
                              └── @streamdown/cjk

AFTER:
  OpenCode → ACP → EventMapper → IPC → useOpenCodeEvents
    └── emitStreamState → ChatMessages re-render
                              └── MarkdownRenderer
                                    ├── isAnimating? NO → StaticMarkdown (full react-markdown)
                                    └── isAnimating? YES → useBlockSplitter(content)
                                          ├── committed → StaticMarkdown (memo, stable)
                                          └── pending → PendingLine (plain text + caret)
```

### Key Design Decision: Block Caching + Lightweight Tail

Every major AI chat application (VS Code Copilot, Claude.ai, Cursor, ChatGPT) uses the same core strategy:

> **Completed blocks → static cached rendering; last incomplete block → lightweight text-only rendering.**

The principle: **never do heavyweight rendering on incomplete content.**

Our implementation:
- **Block splitter** detects structural boundaries in the accumulated markdown text.
- **Completed blocks** (`committed`) are rendered once via `react-markdown` + Shiki + KaTeX and cached with `React.memo` — zero re-renders on subsequent deltas.
- **The last incomplete block** (`pending`) is rendered as plain text with preserved line breaks — no markdown parsing, no Shiki, no KaTeX. This is the only part that updates on every delta.

---

## Component Design

### New File Structure

```
src/renderer/
├── components/modules/chat/
│   ├── markdown-renderer.tsx          ← Rewrite: composition entry point
│   ├── static-markdown.tsx            ← NEW: memoized react-markdown renderer
│   ├── pending-line.tsx               ← NEW: plain text tail + blinking caret
│   ├── shiki-code-block.tsx           ← NEW: Shiki dual-theme code block component
│   └── use-block-splitter.ts          ← NEW: block boundary detection hook
├── lib/
│   └── markdown-config.ts             ← NEW: shared remark/rehype plugin config
└── styles/
    └── globals.css                     ← MODIFY: remove streamdown CSS
```

### `MarkdownRenderer` (rewrite)

```tsx
function MarkdownRenderer({ content, isAnimating }: Props) {
  if (!isAnimating) {
    return <StaticMarkdown content={content} />;
  }
  const { committed, pending } = useBlockSplitter(content);
  return (
    <>
      <StaticMarkdown content={committed} />
      <PendingLine content={pending} />
    </>
  );
}
```

External interface unchanged — `chat-messages.tsx` requires zero modifications.

### `StaticMarkdown` (new)

- Wraps `react-markdown` with `React.memo`.
- Uses shared remark/rehype plugin config from `markdown-config.ts`.
- Custom `code` component → `ShikiCodeBlock`.
- Custom `a` component for wikilink navigation (same as current `markdown-preview.tsx`).
- Custom table components (rounded borders, same as current).

### `PendingLine` (new)

- Renders plain text with `white-space: pre-wrap`.
- Shows a blinking block caret (`█`) at the end.
- Zero markdown parsing, zero syntax highlighting, zero math rendering.
- Extremely lightweight — just a `<span>` with text.

### `ShikiCodeBlock` (new)

- Detects code block vs inline code via `className`.
- For code blocks: calls `shiki.codeToHtml(code, { lang, themes: { light, dark } })`.
- Renders a styled wrapper with: language label header, copy button, code area.
- Implements code folding (>30 lines by default) as pure React state (no MutationObserver).
- For inline code: renders `<code class="rounded bg-muted px-1">`.

### `useBlockSplitter` (new)

State machine that tracks one boolean: `isInFencedBlock` (code or math).

Block boundaries (safe to commit all text up to and including the boundary):
| Signal | Meaning | Why Safe |
|--------|---------|-----------|
| `\n\n` (in normal state) | Paragraph/heading/list/quote end | Subsequent text is always start of new block |
| Closing ` ``` ` (balanced) | Code block end | Fenced code blocks don't nest |
| Closing `$$` (balanced) | Math block end | Fenced math blocks don't nest |

Incremental scanning: only scans text *after* the last split point, never re-scans committed text.

### `markdown-config.ts` (new, shared)

```tsx
export const REMARK_PLUGINS = [remarkGfm, remarkMath, remarkWikilinks];
export const REHYPE_PLUGINS = [rehypeKatex];
export const MARKDOWN_COMPONENTS = { /* table, th, td, tr, a */ };
```

Used by both `StaticMarkdown` and `MarkdownPreview` (file preview).

---

## Data Flow Changes

### `useOpenCodeEvents` simplification

- **Remove**: `emitStreamDelta()` calls — no longer needed.
- **Keep**: `emitStreamState({ text })` — triggers re-render with full accumulated text.
- **Remove**: `useStreamDelta()` subscription in `MarkdownRenderer`.

### `emitStreamState` unchanged

The module-level `flushSync()` bypass mechanism stays. `ChatMessages` still subscribes via `useStreamText()`. This ensures per-delta re-renders bypass Zustand's batching.

---

## Cleanup Scope

### Package.json — Remove (5 packages)

```
- streamdown@^2.5.0
- @streamdown/cjk@^1.0.3
- @streamdown/code@^1.1.1
- @streamdown/math@^1.0.2
- @streamdown/mermaid@^1.0.2
```

### globals.css — Remove

- 5 `@source` directives for streamdown node_modules
- All `[data-streamdown=*]` CSS selectors (~20 lines)

### Files Modified

| File | Change |
|------|--------|
| `chat/markdown-renderer.tsx` | Full rewrite (~250 lines → ~30 lines) |
| `chat/chat-messages.tsx` | None (interface unchanged) |
| `hooks/use-opencode-events.ts` | Remove `emitStreamDelta` calls; remove `clearStreamDelta` |
| `editor/markdown-preview.tsx` | Refactor to use shared `markdown-config.ts` |
| `styles/globals.css` | Remove streamdown CSS |
| `package.json` | Remove 5 dependencies |
| `pnpm-lock.yaml` | Auto-updated by `pnpm install` |

### Files Added

| File | Purpose |
|------|---------|
| `chat/static-markdown.tsx` | Memoized react-markdown renderer |
| `chat/pending-line.tsx` | Plain text tail + caret |
| `chat/shiki-code-block.tsx` | Shiki dual-theme code block with folding |
| `chat/use-block-splitter.ts` | Block boundary detection state machine |
| `lib/markdown-config.ts` | Shared remark/rehype config |

### Existing Dependencies Kept

`react-markdown`, `remark-gfm`, `remark-math`, `rehype-katex`, `katex`
- **New dependency**: `shiki@^3.x` (was previously pulled in transitively via `@streamdown/code`; we now need it directly)

---

## Risks & Edge Cases

### 1. Shiki Cold Start
Shiki loads grammar files and themes asynchronously. First code block rendering may have a small delay. Mitigation: preload common languages (python, javascript, typescript, bash, json) on app startup via a `Highlighter` singleton.

### 2. Very Long Messages
Accumulated `committed` text grows with message length. `React.memo` with string comparison is O(n) where n is committed length. Mitigation: committed text rarely changes (only when a new block boundary is detected), so memo comparison runs infrequently. For messages >10k words, consider splitting committed into per-block components.

### 3. Rapid Delta Burst
If deltas arrive faster than React can render, the pending text may lag. Mitigation: `flushSync` already forces synchronous renders. The lightweight `PendingLine` (plain text, no parsing) makes this manageable.

### 4. Edge Cases in Block Detection
- Nested `$$` inside ` ``` ` (or vice versa): state machine correctly ignores fences inside fences.
- Incomplete fence (` ``` ` without closing): text stays in pending until balanced.
- Single `$` inline math: not a block boundary; stays in pending until `\n\n`.
- `\n\n` inside a code block: state machine ignores it (IN_CODE_FENCE state).
- Indented code blocks (4 spaces): treated as paragraphs; commit on `\n\n`.

### 5. TeX Math Rendering During Streaming
KaTeX parsing is expensive. Inline `$...$` math that spans a `\n\n` boundary would be split mid-formula. Mitigation: the block splitter doesn't cut at `\n\n` when inside `$...$`. For simplicity, we only track `$$` blocks; inline `$...$` is rare across paragraph boundaries and the cost of getting it wrong (temporary visual glitch until the `$` closes) is acceptable.

---

## Implementation Order

1. Create `lib/markdown-config.ts` — shared config (no deps on other new files)
2. Create `chat/shiki-code-block.tsx` — Shiki code component
3. Create `chat/use-block-splitter.ts` — block boundary hook
4. Create `chat/static-markdown.tsx` — memoized react-markdown renderer
5. Create `chat/pending-line.tsx` — plain text tail
6. Rewrite `chat/markdown-renderer.tsx` — composition entry point
7. Refactor `editor/markdown-preview.tsx` — use shared config
8. Simplify `hooks/use-opencode-events.ts` — remove emitStreamDelta
9. Clean up `styles/globals.css` — remove streamdown CSS
10. Remove streamdown packages from `package.json`
11. Run `pnpm install` and verify build
