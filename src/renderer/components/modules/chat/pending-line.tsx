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
