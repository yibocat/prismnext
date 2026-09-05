// src/renderer/components/modules/chat/markdown-renderer.tsx
import { memo } from "react";
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
  // Hooks must run unconditionally (Rules of Hooks): `isAnimating` flips while
  // streaming, so calling useBlockSplitter below an early return breaks the
  // hook order on the same fiber.
  const { committedBlocks, pending } = useBlockSplitter(content);

  if (!content) return null;

  if (!isAnimating) {
    return <StaticMarkdown content={content} sessionId={sessionId} muted={muted} />;
  }

  const fence = parsePendingCodeFence(pending);

  // Inside a code fence — show the frame with streaming code inside
  if (fence.inFence) {
    return (
      <>
        <CommittedMarkdownBlocks blocks={committedBlocks} sessionId={sessionId} muted={muted} />
        <StreamingCodeFrame lang={fence.lang} code={fence.code} />
      </>
    );
  }

  // Normal text streaming
  return (
    <>
      <CommittedMarkdownBlocks blocks={committedBlocks} sessionId={sessionId} muted={muted} />
      <PendingLine content={pending} />
    </>
  );
}

/**
 * Streaming committed prefix, rendered one StaticMarkdown per safe block.
 * Earlier blocks keep byte-identical content while the stream appends, so
 * React.memo hits and only the newest block re-parses — the whole-turn
 * O(n²) remark/rehypeRaw/rehypeKatex rescan is gone.
 *
 * Known edge (accepted): a raw HTML block whose open/close tags span a
 * `\n\n` boundary now renders per-fragment instead of as one HTML node.
 */
const CommittedMarkdownBlocks = memo(function CommittedMarkdownBlocks({
  blocks,
  sessionId,
  muted,
}: {
  blocks: string[];
  sessionId?: string;
  muted?: boolean;
}) {
  return (
    <>
      {blocks.map((block, i) => (
        <StaticMarkdown
          key={i}
          content={block}
          sessionId={sessionId}
          muted={muted}
        />
      ))}
    </>
  );
});
