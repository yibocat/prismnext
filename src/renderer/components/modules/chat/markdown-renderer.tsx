// src/renderer/components/modules/chat/markdown-renderer.tsx
import { useBlockSplitter } from "./use-block-splitter";
import { StaticMarkdown } from "./static-markdown";
import { PendingLine } from "./pending-line";
import { StreamingCodeFrame } from "./streaming-code-frame";
import { parsePendingCodeFence } from "@/lib/markdown/streaming-code-fence";

interface MarkdownRendererProps {
  content: string;
  isAnimating?: boolean;
  sessionId?: string;
  /** Slightly weaker body color (e.g. interim prose inside Worked for). */
  muted?: boolean;
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
  muted = false,
}: MarkdownRendererProps) {
  if (!content) return null;

  if (!isAnimating) {
    return <StaticMarkdown content={content} sessionId={sessionId} muted={muted} />;
  }

  const { committed, pending } = useBlockSplitter(content);
  const fence = parsePendingCodeFence(pending);

  // Inside a code fence — show the frame with streaming code inside
  if (fence.inFence) {
    return (
      <>
        <StaticMarkdown content={committed} sessionId={sessionId} muted={muted} />
        <StreamingCodeFrame lang={fence.lang} code={fence.code} />
      </>
    );
  }

  // Normal text streaming
  return (
    <>
      <StaticMarkdown content={committed} sessionId={sessionId} muted={muted} />
      <PendingLine content={pending} />
    </>
  );
}
