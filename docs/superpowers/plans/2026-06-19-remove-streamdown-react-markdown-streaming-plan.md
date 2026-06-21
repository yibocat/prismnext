# Remove Streamdown, Unified react-markdown with Streaming — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove streamdown and its 4 companion packages, replace with react-markdown + custom streaming engine ("block caching + lightweight tail"), and unify markdown rendering across chat and file preview.

**Architecture:** A `useBlockSplitter` hook detects stable markdown block boundaries in the streaming text. Completed blocks render via a memoized `react-markdown` + Shiki + KaTeX component (zero re-renders). The trailing incomplete block renders as plain lightweight text. On stream end, the full text renders statically.

**Tech Stack:** react-markdown v10, shiki v4, katex v0.16, remark-gfm, remark-math, rehype-katex, React 19, TypeScript strict, Tailwind CSS 4.

## Global Constraints

- All new files in `src/renderer/components/modules/chat/` and `src/renderer/lib/`
- Shared markdown config extracted to `src/renderer/lib/markdown-config.ts`
- External interface of `MarkdownRenderer` unchanged (same props: `content`, `isAnimating`)
- `chat-messages.tsx` requires zero modifications
- Remove 5 packages: `streamdown`, `@streamdown/code`, `@streamdown/math`, `@streamdown/mermaid`, `@streamdown/cjk`
- Add 1 package: `shiki@^4.2.0`
- No new test files (project has no existing renderer tests; verify with `pnpm build` + `npx tsc --noEmit`)

---

### Task 1: Create shared markdown config module

**Files:**
- Create: `src/renderer/lib/markdown-config.ts`

**Interfaces:**
- Produces: `REMARK_PLUGINS: PluggableList`, `REHYPE_PLUGINS: PluggableList`, `MARKDOWN_COMPONENTS: Components` (shared table/a/code components for react-markdown)

- [ ] **Step 1: Write the file**

```typescript
// src/renderer/lib/markdown-config.ts
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { remarkWikilinks } from "@/lib/remark-wikilinks";

export const REMARK_PLUGINS = [remarkGfm, remarkMath, remarkWikilinks];
export const REHYPE_PLUGINS = [rehypeKatex];

// Shared custom components for react-markdown (tables, links).
// Code component is NOT here — chat uses ShikiCodeBlock, file preview
// overrides with its own simpler code rendering.
export const MARKDOWN_COMPONENTS: Components = {
  table: ({ children }) => (
    <div className="my-4 overflow-hidden rounded-lg border border-border">
      <div className="overflow-x-auto">
        <table className="min-w-full">{children}</table>
      </div>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-border">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-4 py-2.5 text-sm">{children}</td>
  ),
  tr: ({ children }) => (
    <tr className="border-b border-border last:border-0">{children}</tr>
  ),
  a: ({ href, children, ...props }: any) => {
    if (href?.startsWith("wikilink:")) {
      const target = href.slice("wikilink:".length).split("#")[0];
      // Wikilink component is imported where needed (depends on store access)
      // Fallback: render as internal link
      return (
        <span className="text-primary underline decoration-dotted underline-offset-2 cursor-pointer" {...props}>
          {children}
        </span>
      );
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline" {...props}>
        {children}
      </a>
    );
  },
};
```

- [ ] **Step 2: Type-check**

```bash
cd prism-next && npx tsc --noEmit
```

Expected: no errors related to `markdown-config.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/lib/markdown-config.ts
git commit -m "feat: add shared markdown config module for react-markdown

Extracts remark/rehype plugins and table/link components into a shared
module — will be used by both chat StaticMarkdown and file MarkdownPreview.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Create Shiki code block component

**Files:**
- Create: `src/renderer/components/modules/chat/shiki-code-block.tsx`

**Interfaces:**
- Produces: `ShikiCodeBlock` — react-markdown `components.code` handler
- Props: `{ className?: string; children?: React.ReactNode }` (standard react-markdown code props)

- [ ] **Step 1: Write the component**

```typescript
// src/renderer/components/modules/chat/shiki-code-block.tsx
import { useState, useCallback, useEffect, useRef, memo } from "react";
import { createHighlighter, type Highlighter } from "shiki";
import { CheckIcon, CopyIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";

// ── Shared highlighter singleton ──
// Created lazily on first code block render with common languages preloaded.
let _highlighterPromise: Promise<Highlighter> | null = null;
const COMMON_LANGS = ["python", "javascript", "typescript", "tsx", "jsx", "bash", "shell", "json", "yaml", "css", "html", "xml", "markdown", "sql", "tex", "latex", "rust", "go", "java", "c", "cpp"];

function getHighlighter(): Promise<Highlighter> {
  if (!_highlighterPromise) {
    _highlighterPromise = createHighlighter({
      themes: ["github-light", "github-dark"],
      langs: COMMON_LANGS,
    });
  }
  return _highlighterPromise;
}

// ── Code fold threshold ──
const MAX_LINES = 30;

// ── Copy button ──
const CopyButton = memo(({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex size-6 items-center justify-center rounded text-muted-foreground/60 hover:bg-white/10 hover:text-muted-foreground transition-colors"
      title="Copy"
    >
      {copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
    </button>
  );
});
CopyButton.displayName = "CopyButton";

// ── ShikiCodeBlock ──
export const ShikiCodeBlock = memo(function ShikiCodeBlock({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const lang = className?.replace("language-", "") || "";
  const code = String(children).replace(/\n$/, "");
  const [html, setHtml] = useState<string>("");
  const [lines, setLines] = useState(0);
  const [folded, setFolded] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Inline code
  if (!className) {
    return (
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[length:var(--font-code)]">
        {children}
      </code>
    );
  }

  // Code block — async Shiki highlight
  useEffect(() => {
    const run = async () => {
      const hl = await getHighlighter();
      if (!mountedRef.current) return;
      // Attempt to highlight; if lang not found, Shiki auto-detects or falls back to plain text
      const langForShiki = COMMON_LANGS.includes(lang) ? lang : "text";
      const result = hl.codeToHtml(code, {
        lang: langForShiki,
        themes: { light: "github-light", dark: "github-dark" },
      });
      if (mountedRef.current) {
        setHtml(result);
        setLines(code.split("\n").length);
      }
    };
    run();
  }, [code, lang]);

  const shouldFold = lines > MAX_LINES;
  const isFolded = shouldFold && folded;

  return (
    <div className="my-4 overflow-hidden rounded-lg border border-border">
      {/* Header bar: language label + copy button */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-muted/50 border-b border-border">
        <span className="text-xs text-muted-foreground font-mono">{lang || "text"}</span>
        <CopyButton text={code} />
      </div>

      {/* Code area */}
      <div className="relative">
        <div
          className={isFolded ? "overflow-hidden" : "overflow-x-auto"}
          style={isFolded ? { maxHeight: "29.5rem" } : undefined}
        >
          <div
            className="[&_pre]:!bg-transparent! [&_pre]:!p-4! [&_pre]:!m-0! [&_pre]:text-[length:var(--font-code)]! [&_pre_shiki]:!bg-transparent!"
            dangerouslySetInnerHTML={{ __html: html || `<pre><code>${escapeHtml(code)}</code></pre>` }}
          />
        </div>

        {/* Fold gradient + button */}
        {isFolded && (
          <>
            <div
              className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
              style={{
                background: "linear-gradient(to top, var(--background), transparent)",
              }}
            />
            <button
              type="button"
              onClick={() => setFolded(false)}
              className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 px-3 py-1 rounded-md border border-border/50 bg-background/80 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDownIcon className="size-3" />
              Show all {lines} lines
            </button>
          </>
        )}

        {/* Collapse button (when expanded) */}
        {shouldFold && !folded && (
          <button
            type="button"
            onClick={() => setFolded(true)}
            className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 px-3 py-1 rounded-md border border-border/50 bg-background/80 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronUpIcon className="size-3" />
            Collapse
          </button>
        )}
      </div>
    </div>
  );
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
```

- [ ] **Step 2: Type-check**

```bash
cd prism-next && npx tsc --noEmit
```

Expected: no errors for shiki-code-block. Fix any type issues.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/modules/chat/shiki-code-block.tsx
git commit -m "feat: add ShikiCodeBlock component with dual-theme highlighting

- Lazy singleton Shiki highlighter with common langs preloaded
- Dual light/dark theme (github-light / github-dark)
- Code folding >30 lines (React state, no MutationObserver)
- Copy button, language label header, inline code support

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Create block splitter hook

**Files:**
- Create: `src/renderer/components/modules/chat/use-block-splitter.ts`

**Interfaces:**
- Produces: `useBlockSplitter(content: string): { committed: string; pending: string }`

- [ ] **Step 1: Write the hook**

```typescript
// src/renderer/components/modules/chat/use-block-splitter.ts
import { useRef, useMemo } from "react";

/**
 * Block boundary detection state machine for streaming markdown.
 *
 * Splits accumulated text into:
 * - `committed`: stable blocks that won't change (before last safe boundary)
 * - `pending`: the last incomplete block (may still change with new deltas)
 *
 * Safe boundaries are points where subsequent text CANNOT alter the
 * meaning of preceding text:
 *   - `\n\n` (paragraph/heading/list/quote end) — when NOT inside a fence
 *   - Closing ``` (code block end)
 *   - Closing $$ (math block end)
 *
 * Only scans from the previous split point forward — incremental, not full re-scan.
 */
export function useBlockSplitter(content: string): {
  committed: string;
  pending: string;
} {
  const lastSplitIdxRef = useRef(0);

  return useMemo(() => {
    const scanFrom = lastSplitIdxRef.current;
    if (scanFrom >= content.length) {
      return { committed: content, pending: "" };
    }

    const tail = content.slice(scanFrom);
    let inFence = false;
    let fenceChar = "";
    let bestSplit = scanFrom;

    // Walk the new text character by character, tracking fence state.
    // This is O(new-text-length) — typically <100 chars per delta.
    for (let i = 0; i < tail.length; i++) {
      const ch = tail[i];
      const rest = tail.slice(i);

      if (!inFence) {
        // Check for fence open: ``` or $$ at start of line
        if ((rest.startsWith("```") && (i === 0 || tail[i - 1] === "\n"))) {
          inFence = true;
          fenceChar = "`";
          continue;
        }
        if (rest.startsWith("$$") && (i === 0 || tail[i - 1] === "\n"))) {
          inFence = true;
          fenceChar = "$";
          continue;
        }

        // \n\n outside fence = safe split point
        if (i >= 1 && ch === "\n" && tail[i - 1] === "\n") {
          bestSplit = scanFrom + i + 1; // include both newlines
        }
      } else {
        // Inside fence — look for matching close
        if (fenceChar === "`" && rest.startsWith("```") && (i === 0 || tail[i - 1] === "\n")) {
          // Make sure it's not the same opening fence. Check context:
          // A lone ``` on its own line that isn't the opening.
          const afterFence = tail.slice(i + 3);
          const isLineEnd = afterFence === "" || afterFence.startsWith("\n");
          if (isLineEnd && i > 0) {
            inFence = false;
            fenceChar = "";
            bestSplit = scanFrom + i + 3 + (afterFence.startsWith("\n") ? 1 : 0);
          }
        }
        if (fenceChar === "$" && rest.startsWith("$$") && (i === 0 || tail[i - 1] === "\n")) {
          const afterFence = tail.slice(i + 2);
          const isLineEnd = afterFence === "" || afterFence.startsWith("\n");
          if (isLineEnd && i > 0) {
            inFence = false;
            fenceChar = "";
            bestSplit = scanFrom + i + 2 + (afterFence.startsWith("\n") ? 1 : 0);
          }
        }
      }
    }

    lastSplitIdxRef.current = bestSplit;
    return {
      committed: content.slice(0, bestSplit),
      pending: content.slice(bestSplit),
    };
  }, [content]);
}
```

- [ ] **Step 2: Type-check**

```bash
cd prism-next && npx tsc --noEmit
```

Expected: no errors for use-block-splitter.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/modules/chat/use-block-splitter.ts
git commit -m "feat: add useBlockSplitter hook for streaming markdown block detection

State machine tracks fenced blocks (``` and $$) to find safe split
points. Only scans new text from the last split point forward.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Create StaticMarkdown component

**Files:**
- Create: `src/renderer/components/modules/chat/static-markdown.tsx`

**Interfaces:**
- Produces: `StaticMarkdown` — memoized react-markdown wrapper
- Props: `{ content: string }`

- [ ] **Step 1: Write the component**

```typescript
// src/renderer/components/modules/chat/static-markdown.tsx
import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import "katex/dist/katex.min.css";
import { REMARK_PLUGINS, REHYPE_PLUGINS, MARKDOWN_COMPONENTS } from "@/lib/markdown-config";
import { ShikiCodeBlock } from "./shiki-code-block";
import { cn } from "@/lib/utils";

const TYPOGRAPHY = cn(
  "[&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mt-6 [&_h1]:mb-2",
  "[&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-5 [&_h2]:mb-1",
  "[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1",
  "[&_h4]:text-sm [&_h4]:font-semibold [&_h4]:mt-3 [&_h4]:mb-1",
  "[&_p]:my-1 [&_p]:leading-normal",
  "[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-6",
  "[&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-6",
  "[&_li]:my-0.5 [&_li]:leading-normal",
  "[&_a]:text-primary [&_a]:underline",
  "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:my-2 [&_blockquote]:text-muted-foreground",
  "[&_hr]:my-4 [&_hr]:border-border",
  "[&_code:not(pre_code)]:rounded [&_code:not(pre_code)]:bg-muted [&_code:not(pre_code)]:px-1 [&_code:not(pre_code)]:py-0.5 [&_code:not(pre_code)]:font-mono [&_code:not(pre_code)]:text-[length:var(--font-code)]",
  "[&_.katex-display]:my-3",
  "[&_.katex]:text-[length:var(--font-chat-message)]",
);

const COMPONENTS: Components = {
  ...MARKDOWN_COMPONENTS,
  code: ShikiCodeBlock as any,
};

/**
 * Memoized react-markdown renderer for stable (committed) markdown blocks.
 * Renders ONCE and doesn't re-render on subsequent stream deltas.
 */
export const StaticMarkdown = memo(function StaticMarkdown({
  content,
}: {
  content: string;
}) {
  if (!content) return null;

  return (
    <div className={cn("text-sm text-foreground leading-normal", TYPOGRAPHY)}>
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={COMPONENTS}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
```

- [ ] **Step 2: Type-check**

```bash
cd prism-next && npx tsc --noEmit
```

Expected: no errors for static-markdown.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/modules/chat/static-markdown.tsx
git commit -m "feat: add StaticMarkdown — memoized react-markdown with Shiki

Uses shared markdown-config plugins and ShikiCodeBlock for syntax
highlighting. React.memo ensures zero re-renders during streaming.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Create PendingLine component

**Files:**
- Create: `src/renderer/components/modules/chat/pending-line.tsx`

**Interfaces:**
- Produces: `PendingLine` — lightweight plain text tail with caret
- Props: `{ content: string }`

- [ ] **Step 1: Write the component**

```typescript
// src/renderer/components/modules/chat/pending-line.tsx
import { memo } from "react";

/**
 * Renders the last incomplete block of streaming markdown as plain text.
 * Zero markdown parsing, zero syntax highlighting, zero math rendering.
 * This is the only part that re-renders on every stream delta.
 */
export const PendingLine = memo(function PendingLine({
  content,
}: {
  content: string;
}) {
  if (!content) {
    // Show only the caret when waiting for the first text
    return (
      <span className="inline-block">
        <span className="inline-block w-[0.6em] h-[1.1em] bg-primary align-text-bottom animate-pulse rounded-[1px]" />
      </span>
    );
  }

  return (
    <span className="whitespace-pre-wrap text-[length:var(--font-chat-message)]">
      {content}
      <span className="inline-block w-[0.6em] h-[1.1em] bg-primary align-text-bottom animate-pulse rounded-[1px] ml-[0.5px]" />
    </span>
  );
});
```

- [ ] **Step 2: Type-check**

```bash
cd prism-next && npx tsc --noEmit
```

Expected: no errors for pending-line.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/modules/chat/pending-line.tsx
git commit -m "feat: add PendingLine — plain text tail with blinking caret

Lightweight component for streaming markdown tail. Renders plain text
with preserve-whitespace and a blinking cursor. No markdown parsing.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Rewrite MarkdownRenderer

**Files:**
- Modify: `src/renderer/components/modules/chat/markdown-renderer.tsx`

**Interfaces:**
- Consumes: `StaticMarkdown` from Task 4, `PendingLine` from Task 5, `useBlockSplitter` from Task 3
- Produces: `MarkdownRenderer` (unchanged external interface: `{ content: string; isAnimating?: boolean }`)

- [ ] **Step 1: Replace the entire file**

```typescript
// src/renderer/components/modules/chat/markdown-renderer.tsx
import { useBlockSplitter } from "./use-block-splitter";
import { StaticMarkdown } from "./static-markdown";
import { PendingLine } from "./pending-line";

interface MarkdownRendererProps {
  content: string;
  isAnimating?: boolean;
}

/**
 * Renders markdown content with streaming support.
 *
 * - When `isAnimating` is false: renders the full content as static
 *   react-markdown with Shiki syntax highlighting and KaTeX math.
 * - When `isAnimating` is true: splits the content at safe block
 *   boundaries. Completed blocks render via memoized StaticMarkdown
 *   (zero re-renders). The trailing incomplete block renders as
 *   lightweight plain text with a blinking caret.
 */
export function MarkdownRenderer({
  content,
  isAnimating = false,
}: MarkdownRendererProps) {
  if (!content) return null;

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

- [ ] **Step 2: Type-check**

```bash
cd prism-next && npx tsc --noEmit
```

Expected: no errors. This is a clean replacement — the old file's imports are gone.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/modules/chat/markdown-renderer.tsx
git commit -m "refactor: rewrite MarkdownRenderer to use react-markdown + streaming

Replace streamdown with custom streaming engine:
- StaticMarkdown (memo) for committed blocks with Shiki + KaTeX
- PendingLine (plain text) for the streaming tail
- useBlockSplitter for safe block boundary detection
- External interface unchanged — chat-messages.tsx needs zero changes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Simplify useOpenCodeEvents — remove emitStreamDelta

**Files:**
- Modify: `src/renderer/hooks/use-opencode-events.ts`

- [ ] **Step 1: Remove the emitStreamDelta system (lines 30-58)**

Remove these three items from the file:
1. The `StreamDelta` type export (line 32)
2. The `emitStreamDelta` + `clearStreamDelta` functions + module-level variables (lines 33-48)
3. The `useStreamDelta` hook (lines 51-58)

Also remove the `useStreamDelta` import from `markdown-renderer.tsx` — already done in Task 6.

Also remove lines 310-317 (the `emitStreamDelta` call inside the `message.part.updated` handler):
```typescript
              // Emit delta for Streamdown incremental parse
              if (data.delta) {
                emitStreamDelta({
                  type: block.type as "text" | "thinking",
                  delta: data.delta,
                  full: block.type === "text" ? (block.text || "") : (block.thinking || ""),
                });
              }
```

- [ ] **Step 2: Type-check**

```bash
cd prism-next && npx tsc --noEmit
```

Expected: no errors. Ensure no remaining references to `emitStreamDelta`, `useStreamDelta`, `clearStreamDelta`.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/hooks/use-opencode-events.ts
git commit -m "refactor: remove emitStreamDelta — no longer needed

Streamdown incremental parse is replaced by useBlockSplitter which
operates on the full accumulated text. emitStreamState (for ChatMessages
re-render) remains unchanged.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Refactor markdown-preview.tsx to use shared config

**Files:**
- Modify: `src/renderer/components/modules/editor/markdown-preview.tsx`

**Interfaces:**
- Consumes: `REMARK_PLUGINS`, `REHYPE_PLUGINS`, `MARKDOWN_COMPONENTS` from `@/lib/markdown-config`

- [ ] **Step 1: Replace duplicated plugin/config code**

Replace lines 3-17 in markdown-preview.tsx:

Old:
```typescript
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import "@/styles/code-highlight.css";
import { useDocumentStore } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useTabContext } from "@/lib/tab-context";
import { remarkWikilinks } from "@/lib/remark-wikilinks";
import { cn } from "@/lib/utils";

const REMARK_PLUGINS = [remarkGfm, remarkMath, remarkWikilinks];
const REHYPE_PLUGINS = [rehypeKatex];
```

New:
```typescript
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import "katex/dist/katex.min.css";
import "@/styles/code-highlight.css";
import { useDocumentStore } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useTabContext } from "@/lib/tab-context";
import { cn } from "@/lib/utils";
import { REMARK_PLUGINS, REHYPE_PLUGINS, MARKDOWN_COMPONENTS } from "@/lib/markdown-config";
```

Also update the `COMPONENTS` constant (lines 61-88) to spread from shared config:

```typescript
const COMPONENTS: Components = {
  ...MARKDOWN_COMPONENTS,
  a: ({ href, children, ...props }: { href?: string; children?: React.ReactNode; [key: string]: unknown }) => {
    if (href?.startsWith("wikilink:")) {
      const target = href.slice("wikilink:".length).split("#")[0];
      return <Wikilink target={target}>{children}</Wikilink>;
    }
    return <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline" {...props}>{children}</a>;
  },
};
```

- [ ] **Step 2: Type-check**

```bash
cd prism-next && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/modules/editor/markdown-preview.tsx
git commit -m "refactor: use shared markdown-config in file preview

Replace duplicated remark/rehype plugin config and table components
with imports from the shared markdown-config module.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Clean up globals.css — remove streamdown CSS

**Files:**
- Modify: `src/renderer/styles/globals.css`

- [ ] **Step 1: Remove all streamdown-related CSS**

Remove lines 5-10 (the 5 `@source` directives):
```css
/* Streamdown — scan component sources so Tailwind doesn't purge their classes */
@source "../../../node_modules/streamdown/dist/*.js";
@source "../../../node_modules/@streamdown/code/dist/*.js";
@source "../../../node_modules/@streamdown/math/dist/*.js";
@source "../../../node_modules/@streamdown/mermaid/dist/*.js";
@source "../../../node_modules/@streamdown/cjk/dist/*.js";
```

The `[data-streamdown=*]` CSS selectors were inside `markdown-renderer.tsx` in the `cn(...)` className string — those are already removed by the file rewrite in Task 6. The globals.css file does NOT contain `data-streamdown` selectors (confirmed — those were inline in the TSX).

Actually, looking at the current markdown-renderer.tsx, the `data-streamdown` styles are inline in the JSX `className={cn(...)}` at lines 193-230. Those get removed as part of the rewrite. globals.css only has the `@source` directives.

- [ ] **Step 2: Verify no remaining streamdown references**

```bash
grep -r "streamdown" prism-next/src/ --include="*.ts" --include="*.tsx" --include="*.css" -l
```

Expected: no output (no files reference streamdown).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/styles/globals.css
git commit -m "cleanup: remove streamdown @source directives from globals.css

Streamdown has been replaced by react-markdown + custom streaming engine.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Update Vite config — add shiki to markdown-viewer chunk

**Files:**
- Modify: `electron.vite.config.ts`

- [ ] **Step 1: Add shiki to the markdown-viewer manual chunk**

Change the `manualChunks` function (lines 56-73) — add an `if` block for shiki:

```typescript
manualChunks(id) {
  if (id.includes("node_modules/@codemirror")) {
    return "codemirror";
  }
  if (id.includes("node_modules/pdfjs-dist")) {
    return "pdfjs";
  }
  if (id.includes("node_modules/shiki") || id.includes("node_modules/@shikijs")) {
    return "markdown-viewer";
  }
  if (
    id.includes("node_modules/react-markdown") ||
    id.includes("node_modules/remark-") ||
    id.includes("node_modules/rehype-") ||
    id.includes("node_modules/katex")
  ) {
    return "markdown-viewer";
  }
  if (id.includes("node_modules/@xterm")) {
    return "xterm";
  }
},
```

- [ ] **Step 2: Type-check**

```bash
cd prism-next && npx tsc --noEmit
```

Expected: electron-vite config is JS not TS; no type issues. Just verify the config parses correctly.

- [ ] **Step 3: Commit**

```bash
git add electron.vite.config.ts
git commit -m "chore: add shiki to markdown-viewer chunk in vite config

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: Update package.json — remove streamdown packages, add shiki

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Remove 5 streamdown dependencies, add shiki**

Remove from `dependencies`:
- `"@streamdown/cjk": "^1.0.3"`
- `"@streamdown/code": "^1.1.1"`
- `"@streamdown/math": "^1.0.2"`
- `"@streamdown/mermaid": "^1.0.2"`
- `"streamdown": "^2.5.0"`

Add to `dependencies`:
- `"shiki": "^4.2.0"`

- [ ] **Step 2: Run pnpm install**

```bash
cd prism-next && pnpm install
```

Expected: installs successfully, removes streamdown packages, adds shiki.

- [ ] **Step 3: Verify pnpm-lock.yaml updated**

```bash
grep -c "streamdown" pnpm/pnpm-lock.yaml 2>/dev/null || grep -c "streamdown" pnpm-lock.yaml
```

Expected: 0 (no remaining streamdown references in lockfile).

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: replace streamdown with shiki in dependencies

Remove 5 packages: streamdown, @streamdown/code, @streamdown/math,
@streamdown/mermaid, @streamdown/cjk.

Add: shiki@^4.2.0 (previously pulled transitively via @streamdown/code;
now a direct dependency for our custom ShikiCodeBlock component).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 12: Final verification — build and type-check

- [ ] **Step 1: TypeScript check**

```bash
cd prism-next && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 2: Production build**

```bash
cd prism-next && pnpm build
```

Expected: builds successfully with no errors.

- [ ] **Step 3: Verify no streamdown anywhere in the project**

```bash
grep -r "streamdown" prism-next/src/ prism-next/package.json prism-next/electron.vite.config.ts --include="*.ts" --include="*.tsx" --include="*.css" --include="*.json" -l
```

Expected: no output.

- [ ] **Step 4: Verify all new files are tracked**

```bash
git status --short
```

Expected: shows the new files as staged/untracked and modified files ready.

- [ ] **Step 5: Commit**

```bash
git commit -m "verify: build and type-check pass after streamdown removal

All streamdown references removed. react-markdown + Shiki + KaTeX
streaming engine fully integrated.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
