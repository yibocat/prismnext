import { useMemo } from "react";
import type { ComposerPart } from "@/lib/chat/composer-parts";
import { hasLinkParts, mergeAdjacentText, parseTextWithLinks } from "@/lib/chat/composer-parts";
import { InlineTokenParts } from "./inline-token-parts";

interface InlineRichTextProps {
  /** Structured tokens (composer / persisted inlineParts) */
  parts?: ComposerPart[];
  /** Plain text — URLs auto-detected as link chips when no structured parts */
  text?: string;
  className?: string;
  /** Append streaming caret */
  showCaret?: boolean;
}

/**
 * Unified rich inline body: @ / link tokens + plain text.
 * Used in user bubbles, AI streaming tail, and anywhere we need URL chips without full markdown.
 */
export function InlineRichText({ parts, text = "", className, showCaret }: InlineRichTextProps) {
  const resolvedParts = useMemo(() => {
    if (parts?.length) return parts;
    if (!text) return [];
    const parsed = parseTextWithLinks(text);
    return hasLinkParts(parsed) ? mergeAdjacentText(parsed) : [];
  }, [parts, text]);

  const body = resolvedParts.length > 0 ? <InlineTokenParts parts={resolvedParts} /> : text;

  return (
    <span className={className}>
      {body}
      {showCaret && (
        <span className="inline-block w-[0.6em] h-[1.1em] bg-primary align-text-bottom animate-pulse rounded-[1px] ml-[0.5px]" />
      )}
    </span>
  );
}
