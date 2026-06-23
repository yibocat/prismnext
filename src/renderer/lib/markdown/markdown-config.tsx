// src/renderer/lib/markdown-config.ts
import type { Components } from "react-markdown";
import { AppBrowserLink } from "@/components/modules/shared/app-browser-link";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { remarkWikilinks } from "./remark-wikilinks";
import { cn } from "@/lib/utils";

export const REMARK_PLUGINS = [remarkGfm, remarkMath, remarkWikilinks];
export const REHYPE_PLUGINS = [rehypeKatex];

/** Typography for file/document markdown preview — follows Appearance → Editor font. */
export const DOCUMENT_MARKDOWN_TYPOGRAPHY = cn(
  "font-[family-name:var(--font-editor)] text-[length:var(--font-editor-size)] leading-[var(--editor-line-height)] text-foreground",
  "[&_h1]:text-[1.25em] [&_h1]:font-semibold [&_h1]:mt-6 [&_h1]:mb-2",
  "[&_h2]:text-[1.125em] [&_h2]:font-semibold [&_h2]:mt-5 [&_h2]:mb-1",
  "[&_h3]:text-[1.05em] [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1",
  "[&_h4]:text-[1em] [&_h4]:font-semibold [&_h4]:mt-3 [&_h4]:mb-1",
  "[&_p]:my-1",
  "[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-6",
  "[&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-6",
  "[&_li]:my-0.5",
  "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:my-2 [&_blockquote]:text-muted-foreground",
  "[&_hr]:my-4 [&_hr]:border-border",
  "[&_th]:text-[0.85em] [&_th]:font-medium [&_th]:text-muted-foreground",
  "[&_td]:text-[0.92em]",
  "[&_code:not(pre_code)]:rounded [&_code:not(pre_code)]:bg-muted [&_code:not(pre_code)]:px-1 [&_code:not(pre_code)]:py-0.5 [&_code:not(pre_code)]:font-mono [&_code:not(pre_code)]:text-[0.92em]",
  "[&_.katex-display]:my-3 [&_.katex]:text-[1em]",
  "[&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_pre]:p-4 [&_pre]:overflow-x-auto [&_pre]:text-[0.92em] [&_pre]:font-mono",
);

/**
 * Wrap bare \begin{env}...\end{env} LaTeX environments with $$ markers
 * so remark-math treats them as display math. Handles nested environments
 * (e.g. \begin{equation}\begin{aligned}...\end{aligned}\end{equation}).
 */
function wrapBeginEndBlocks(text: string): string {
  const BEGIN_RE = /^\\begin\{(\w+\*?)\}/;
  const END_RE = /^\\end\{(\w+\*?)\}/;

  const lines = text.split("\n");
  const result: string[] = [];
  const envStack: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const beginMatch = line.match(BEGIN_RE);
    const endMatch = line.match(END_RE);

    if (envStack.length === 0 && beginMatch) {
      // Top-level \begin → insert $$ before
      result.push("$$");
      result.push(line);
      envStack.push(beginMatch[1]);
    } else if (envStack.length > 0) {
      if (beginMatch) {
        // Nested \begin
        envStack.push(beginMatch[1]);
      } else if (endMatch && endMatch[1] === envStack[envStack.length - 1]) {
        // Matching \end → pop
        envStack.pop();
        result.push(line);
        if (envStack.length === 0) {
          // Top-level closed → insert $$ after
          result.push("$$");
          continue;
        }
      } else if (endMatch) {
        // Mismatched \end — still close for safety (malformed LaTeX)
        result.push(line);
      } else {
        result.push(line);
      }
    } else {
      result.push(line);
    }
  }

  // Unclosed environment at EOF
  if (envStack.length > 0) {
    result.push("$$");
  }

  return result.join("\n");
}

/**
 * Convert LaTeX delimiters to dollar-sign format.
 * \(...\) → $...$ and \[...\] → $$...$$
 * Must NOT touch content inside code blocks (``` or `).
 */
export function normalizeMathDelimiters(text: string): string {
  // Protect code blocks
  const blocks: string[] = [];
  let working = text;
  working = working.replace(/```[\s\S]*?```/g, (m) => {
    blocks.push(m);
    return `\x00B${blocks.length - 1}\x00`;
  });
  working = working.replace(/`[^`\n]+`/g, (m) => {
    blocks.push(m);
    return `\x00B${blocks.length - 1}\x00`;
  });

  // Convert LaTeX delimiters to dollar-sign format
  working = working.replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => `$$\n${m.trim()}\n$$`);
  working = working.replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => `$${m}$`);

  // Restore code blocks
  working = working.replace(/\x00B(\d+)\x00/g, (_, i) => blocks[parseInt(i)] || "");

  // Wrap bare \begin{env}...\end{env} with $$ markers
  working = wrapBeginEndBlocks(working);

  return working;
}

// Shared custom components for react-markdown (tables, links).
// Code component is NOT here — chat uses ShikiCodeBlock, file preview
// overrides with its own simpler code rendering.
/** Typography for chat markdown — scales with Appearance → UI font via --font-chat-message. */
export const CHAT_MARKDOWN_TYPOGRAPHY = cn(
  "[&_h1]:text-[1.2em] [&_h1]:font-semibold [&_h1]:mt-6 [&_h1]:mb-2",
  "[&_h2]:text-[1.1em] [&_h2]:font-semibold [&_h2]:mt-5 [&_h2]:mb-1",
  "[&_h3]:text-[1.05em] [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1",
  "[&_h4]:text-[1em] [&_h4]:font-semibold [&_h4]:mt-3 [&_h4]:mb-1",
  "[&_p]:my-1 [&_p]:leading-normal",
  "[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-6",
  "[&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-6",
  "[&_li]:my-0.5 [&_li]:leading-normal",
  "[&_a:not([data-inline-token])]:text-primary [&_a:not([data-inline-token])]:underline",
  "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:my-2 [&_blockquote]:text-muted-foreground",
  "[&_hr]:my-4 [&_hr]:border-border",
  "[&_th]:text-[0.85em] [&_th]:font-medium [&_th]:text-muted-foreground",
  "[&_td]:text-[0.92em]",
  "[&_code:not(pre_code)]:rounded [&_code:not(pre_code)]:bg-muted [&_code:not(pre_code)]:px-1 [&_code:not(pre_code)]:py-0.5 [&_code:not(pre_code)]:font-mono [&_code:not(pre_code)]:text-[length:var(--font-code)]",
  "[&_.katex-display]:my-3 [&_.katex]:text-[1em]",
);

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
      <AppBrowserLink href={href}>
        {children}
      </AppBrowserLink>
    );
  },
};
