// src/renderer/components/modules/chat/markdown-renderer.tsx
import { useBlockSplitter } from "./use-block-splitter";
import { StaticMarkdown } from "./static-markdown";
import { PendingLine } from "./pending-line";
import { StreamingCodeFrame } from "./streaming-code-frame";

interface MarkdownRendererProps {
  content: string;
  isAnimating?: boolean;
  sessionId?: string;
}

/**
 * Extract fence info from pending text.
 * When inside a code fence, pending starts with ``` at position 0.
 * Returns the language and the code content without the opening markers.
 */
function getFenceInfo(pending: string): {
  inFence: boolean;
  lang: string;
  code: string;
} {
  if (!pending.startsWith("```")) {
    return { inFence: false, lang: "", code: pending };
  }
  const newlineIdx = pending.indexOf("\n");
  const lang = newlineIdx > 0 ? pending.slice(3, newlineIdx).trim() : "";
  const code = newlineIdx >= 0 ? pending.slice(newlineIdx + 1) : "";
  return { inFence: true, lang, code };
}

/**
 * Renders markdown content with streaming support.
 *
 * - When `isAnimating` is false: renders the full content as static
 *   react-markdown with Shiki syntax highlighting and KaTeX math.
 * - When `isAnimating` is true: splits the content at safe block
 *   boundaries. Completed blocks render via memoized StaticMarkdown
 *   (zero re-renders). The trailing incomplete block renders as
 *   lightweight plain text with a blinking caret — or as a code
 *   frame with streaming text inside when inside a code fence.
 */
export function MarkdownRenderer({
  content,
  isAnimating = false,
  sessionId,
}: MarkdownRendererProps) {
  if (!content) return null;

  if (!isAnimating) {
    return <StaticMarkdown content={content} sessionId={sessionId} />;
  }

  const { committed, pending } = useBlockSplitter(content);
  const fence = getFenceInfo(pending);

  // Inside a code fence — show the frame with streaming code inside
  if (fence.inFence) {
    return (
      <>
        <StaticMarkdown content={committed} sessionId={sessionId} />
        <StreamingCodeFrame lang={fence.lang} code={fence.code} />
      </>
    );
  }

  // Normal text streaming
  return (
    <>
      <StaticMarkdown content={committed} sessionId={sessionId} />
      <PendingLine content={pending} />
    </>
  );
}
