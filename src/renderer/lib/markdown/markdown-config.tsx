// src/renderer/lib/markdown-config.ts
import type { Components } from "react-markdown";
import { AppBrowserLink } from "@/components/modules/shared/app-browser-link";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { remarkWikilinks } from "./remark-wikilinks";
import { remarkCitationRefs } from "./remark-citation-refs";
import { cn } from "@/lib/utils";

export const KATEX_RENDER_OPTIONS = {
  strict: "ignore" as const,
  throwOnError: false,
  trust: true,
  errorColor: "var(--foreground)",
};

/** @deprecated alias */
export const KATEX_DOCUMENT_OPTIONS = KATEX_RENDER_OPTIONS;

const CUSTOM_MARKDOWN_LINK_PROTOCOLS = ["citation", "wikilink"] as const;

const SCIENTIFIC_HTML_SCHEMA = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: [
      ...(defaultSchema.protocols?.href ?? []),
      ...CUSTOM_MARKDOWN_LINK_PROTOCOLS,
    ],
  },
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "table",
    "thead",
    "tbody",
    "tfoot",
    "tr",
    "th",
    "td",
    "caption",
    "colgroup",
    "col",
    "span",
    "div",
    "br",
    "sup",
    "sub",
    "img",
    "figure",
    "figcaption",
  ],
  attributes: {
    ...defaultSchema.attributes,
    "*": [
      ...((defaultSchema.attributes as Record<string, string[] | undefined>)["*"] ?? []),
      "className",
      "class",
      "style",
      "colspan",
      "rowspan",
      "align",
      "valign",
    ],
    td: ["colspan", "rowspan", "style", "align"],
    th: ["colspan", "rowspan", "style", "align"],
    img: ["src", "alt", "width", "height", "style"],
  },
};

function rehypeKatexWithOptions(): [typeof rehypeKatex, typeof KATEX_RENDER_OPTIONS] {
  return [rehypeKatex, KATEX_RENDER_OPTIONS];
}

/**
 * Shared rehype stack for every Markdown surface (Chat, file preview, settings, …):
 * sanitized raw HTML (embedded tables) + KaTeX with relaxed error handling.
 */
export const MARKDOWN_REHYPE_PLUGINS = [
  rehypeRaw,
  [rehypeSanitize, SCIENTIFIC_HTML_SCHEMA] as [typeof rehypeSanitize, typeof SCIENTIFIC_HTML_SCHEMA],
  rehypeKatexWithOptions(),
];

/** remark-math + GFM + wikilinks — base for all surfaces. */
export const MARKDOWN_REMARK_BASE = [remarkGfm, remarkMath, remarkWikilinks];

/** Chat only: turn staged `[n]` into citation links. */
export const MARKDOWN_REMARK_CHAT = [...MARKDOWN_REMARK_BASE, remarkCitationRefs];

/** @deprecated use MARKDOWN_REMARK_CHAT */
export const REMARK_PLUGINS = MARKDOWN_REMARK_CHAT;
/** @deprecated use MARKDOWN_REHYPE_PLUGINS */
export const REHYPE_PLUGINS = MARKDOWN_REHYPE_PLUGINS;

/** File / extract preview — no citation-ref hijacking of `[1]` in paper bodies. */
export const DOCUMENT_REMARK_PLUGINS = MARKDOWN_REMARK_BASE;
export const DOCUMENT_REHYPE_PLUGINS = MARKDOWN_REHYPE_PLUGINS;

/** @deprecated identical to document stack after unified rehype */
export const SCIENTIFIC_REMARK_PLUGINS = DOCUMENT_REMARK_PLUGINS;
export const SCIENTIFIC_REHYPE_PLUGINS = DOCUMENT_REHYPE_PLUGINS;

export type MarkdownPreviewProfile = "default" | "scientific";

export type MarkdownRenderSurface = "chat" | "document";

export function remarkPluginsForSurface(surface: MarkdownRenderSurface) {
  return surface === "chat" ? MARKDOWN_REMARK_CHAT : MARKDOWN_REMARK_BASE;
}

export function rehypePluginsForSurface(_surface: MarkdownRenderSurface) {
  return MARKDOWN_REHYPE_PLUGINS;
}

export function isScientificExtractPath(filePath: string | undefined): boolean {
  if (!filePath) return false;
  const norm = filePath.replace(/\\/g, "/").toLowerCase();
  return norm.includes(".prismnext/library/extract/") && norm.endsWith(".md");
}

export function markdownPreviewProfileForPath(filePath: string | undefined): MarkdownPreviewProfile {
  return isScientificExtractPath(filePath) ? "scientific" : "default";
}

export function remarkPluginsForProfile(profile: MarkdownPreviewProfile) {
  return profile === "scientific" ? SCIENTIFIC_REMARK_PLUGINS : DOCUMENT_REMARK_PLUGINS;
}

export function rehypePluginsForProfile(_profile: MarkdownPreviewProfile) {
  return MARKDOWN_REHYPE_PLUGINS;
}

/**
 * App-wide Markdown math preprocessing — used by Chat, file preview, and tool output.
 * Normalizes delimiters (`\[...\]`, bare `\\begin...\\end`) then strips KaTeX-hostile macros.
 */
export function prepareMarkdownMath(text: string): string {
  return scrubLatexForKatex(normalizeMathDelimiters(text));
}

/** @deprecated use prepareMarkdownMath */
export const scrubScientificLatex = scrubLatexForKatex;

export function prepareDocumentMarkdown(body: string, _profile: MarkdownPreviewProfile): string {
  return prepareMarkdownMath(body);
}

/** KaTeX display/error styling — shared by chat + document typography. */
export const MARKDOWN_KATEX_TYPOGRAPHY = cn(
  "[&_.katex-display]:my-3 [&_.katex]:text-[1em]",
  "[&_.katex-error]:text-foreground [&_.katex-error]:bg-muted/60 [&_.katex-error]:rounded [&_.katex-error]:px-1 [&_.katex-error]:font-mono [&_.katex-error]:text-[0.88em]",
);

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
  MARKDOWN_KATEX_TYPOGRAPHY,
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

/** Strip LaTeX constructs KaTeX cannot render (publisher exports, paper quotes in Chat, …). */
export function scrubLatexForKatex(text: string): string {
  return text
    .replace(/\\label\{[^}]*\}/g, "")
    .replace(/\\tag\*?\{[^}]*\}/g, "")
    .replace(/\\tag\b/g, "")
    .replace(/\\(?:eqref|ref|pageref)\{[^}]*\}/g, "")
    .replace(/\\(?:cite|citep|citet|parencite|textcite)\{[^}]*\}/g, "")
    .replace(/\\begin\{\\(\w+\*?)\}/g, "\\begin{$1}");
}

function stashSegments(text: string, pattern: RegExp, stash: string[]): string {
  return text.replace(pattern, (match) => {
    stash.push(match);
    return `\x00S${stash.length - 1}\x00`;
  });
}

function restoreSegments(text: string, stash: string[]): string {
  return text.replace(/\x00S(\d+)\x00/g, (_, index) => stash[Number.parseInt(index, 10)] ?? "");
}

/**
 * Convert LaTeX delimiters to dollar-sign format.
 * \(...\) → $...$ and \[...\] → $$...$$
 * Protects code/math blocks before wrapping bare \\begin...\\end.
 */
export function normalizeMathDelimiters(text: string): string {
  const stash: string[] = [];
  let working = text;

  working = stashSegments(working, /```[\s\S]*?```/g, stash);
  working = stashSegments(working, /`[^`\n]+`/g, stash);
  // Display math already delimited — must not double-wrap with $$ inside.
  working = stashSegments(working, /\$\$[\s\S]*?\$\$/g, stash);

  working = working.replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => `$$\n${m.trim()}\n$$`);
  working = working.replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => `$${m}$`);

  working = wrapBeginEndBlocks(working);
  return restoreSegments(working, stash);
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
  MARKDOWN_KATEX_TYPOGRAPHY,
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
