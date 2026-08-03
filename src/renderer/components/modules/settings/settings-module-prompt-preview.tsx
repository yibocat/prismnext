import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import {
  DOCUMENT_MARKDOWN_TYPOGRAPHY,
  MARKDOWN_COMPONENTS,
  prepareDocumentMarkdown,
} from "@/lib/markdown/markdown-config";

/** Same compact markdown shell as Built-in modules (`KnowledgeModulesPanel`). */
export const SETTINGS_MODULE_PREVIEW_TYPOGRAPHY = cn(
  DOCUMENT_MARKDOWN_TYPOGRAPHY,
  "text-[length:var(--font-size-12)]",
  "[&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:text-[1.05em]",
  "[&_h3]:mt-2.5 [&_h3]:mb-1",
  "[&_p]:my-1.5",
  "[&_ul]:my-1.5",
  "[&_pre]:border-0 [&_pre]:bg-transparent [&_pre]:p-0 [&_pre]:rounded-none",
  "[&_blockquote]:border-0 [&_blockquote]:pl-0",
);

const SETTINGS_MODULE_MARKDOWN_COMPONENTS: Components = {
  ...MARKDOWN_COMPONENTS,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="min-w-full border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead>{children}</thead>,
  th: ({ children }) => (
    <th className="py-1 pr-4 text-left font-medium text-muted-foreground">{children}</th>
  ),
  td: ({ children }) => <td className="py-1 pr-4 align-top">{children}</td>,
  tr: ({ children }) => <tr>{children}</tr>,
};

export function SettingsModulePromptPreview({
  content,
  className,
  shellClassName,
}: {
  content: string;
  className?: string;
  shellClassName?: string;
}) {
  const body = useMemo(() => prepareDocumentMarkdown(content, "default"), [content]);
  return (
    <div className={cn("rounded-md bg-muted/35 px-3 py-2.5", shellClassName)}>
      <div className={cn(SETTINGS_MODULE_PREVIEW_TYPOGRAPHY, className)}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={SETTINGS_MODULE_MARKDOWN_COMPONENTS}>
          {body}
        </ReactMarkdown>
      </div>
    </div>
  );
}
