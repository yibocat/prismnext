import { memo } from "react";
import { InlineRichText } from "./inline-tokens";

/**
 * Streaming markdown tail — plain text with auto-detected URL link chips + caret.
 */
export const PendingLine = memo(function PendingLine({
  content,
}: {
  content: string;
}) {
  return (
    <InlineRichText
      text={content}
      className="whitespace-pre-wrap text-[length:var(--font-chat-message)]"
      showCaret
    />
  );
});
