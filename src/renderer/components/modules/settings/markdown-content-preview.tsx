import { memo } from "react";
import {
  MarkdownDocumentPreview,
  type MarkdownDocumentPreviewVariant,
} from "@/components/modules/shared/markdown-document-preview";

export const MarkdownContentPreview = memo(function MarkdownContentPreview({
  content,
  className,
  variant = "default",
}: {
  content: string;
  className?: string;
  variant?: MarkdownDocumentPreviewVariant;
}) {
  return (
    <MarkdownDocumentPreview content={content} className={className} variant={variant} />
  );
});
