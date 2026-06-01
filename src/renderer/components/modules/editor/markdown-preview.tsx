import { useMemo } from "react";
import { Streamdown } from "streamdown";
import type { Components } from "streamdown";
import { code } from "@streamdown/code";
import { createMathPlugin } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { cjk } from "@streamdown/cjk";
import "katex/dist/katex.min.css";
import "streamdown/styles.css";
import { useDocumentStore } from "@/stores/document-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useTabContext } from "@/lib/tab-context";

// ─── Math Plugin ───

const mathPlugin = createMathPlugin({
  singleDollarTextMath: true,
});

// ─── Custom Components ───

const components: Components = {
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
};

// ─── Math normalizer ───

function normalizeMathDelimiters(text: string): string {
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
  working = working.replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => `$$\n${m.trim()}\n$$`);
  working = working.replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => `$${m}$`);
  working = working.replace(/\x00B(\d+)\x00/g, (_, i) => blocks[parseInt(i)] || "");
  return working;
}

// ─── Markdown Preview ───

export function MarkdownPreview() {
  const { tab } = useTabContext();
  const fileId = tab.fileId;
  const content = useDocumentStore((s) => (fileId ? s.fileContents.get(fileId)?.content ?? "" : ""));

  const mdWidthLimited = useLayoutStore((s) => s.mdWidthLimited);
  const normalized = useMemo(() => normalizeMathDelimiters(content), [content]);

  return (
    <div className="h-full overflow-auto px-6 py-4">
      <div className={mdWidthLimited ? "max-w-prose mx-auto" : ""}>
        <div className="[&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mt-6 [&_h1]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-5 [&_h2]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1 [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:mt-3 [&_h4]:mb-1 [&_p]:my-1 [&_p]:leading-normal [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-0.5 [&_li]:leading-normal [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:my-2 [&_blockquote]:text-muted-foreground [&_hr]:my-4 [&_hr]:border-border [&_[data-streamdown=code-block]]:!bg-transparent [&_[data-streamdown=code-block-body]]:!border-0 [&_[data-streamdown=code-block-body]]:!text-[length:var(--font-code)] [&_[data-streamdown=code-block-header]]:!pl-4 [&_[data-streamdown=code-block-header]]:!pr-12 [&_[data-streamdown=code-block]>div:has([data-streamdown=code-block-actions])]:!absolute [&_[data-streamdown=code-block]>div:has([data-streamdown=code-block-actions])]:!top-0.5 [&_[data-streamdown=code-block]>div:has([data-streamdown=code-block-actions])]:!right-1.5 [&_[data-streamdown=code-block]>div:has([data-streamdown=code-block-actions])]:!m-0 [&_[data-streamdown=code-block]>div:has([data-streamdown=code-block-actions])]:!z-10 [&_[data-streamdown=code-block-copy-button]]:!p-0.5 [&_[data-streamdown=code-block-copy-button]_svg]:!size-3 [&_[data-streamdown=mermaid-block]]:!bg-transparent [&_[data-streamdown=mermaid-block]]:!p-0 [&_[data-streamdown=mermaid-block]]:!gap-0 [&_[data-streamdown=mermaid-block]]:!overflow-hidden [&_[data-streamdown=mermaid-block]]:relative [&_[data-streamdown=mermaid-block]>div:has([data-streamdown=mermaid-block-actions])]:!absolute [&_[data-streamdown=mermaid-block]>div:has([data-streamdown=mermaid-block-actions])]:!top-1.5 [&_[data-streamdown=mermaid-block]>div:has([data-streamdown=mermaid-block-actions])]:!right-1.5 [&_[data-streamdown=mermaid-block]>div:has([data-streamdown=mermaid-block-actions])]:!m-0 [&_[data-streamdown=mermaid-block]>div:has([data-streamdown=mermaid-block-actions])]:!z-10 [&_[data-streamdown=mermaid-block-actions]_button]:!p-0.5 [&_[data-streamdown=mermaid-block-actions]_svg]:!size-3 [&_[data-streamdown=mermaid-block]>div:has([data-streamdown=mermaid])]:!border-0 [&_[data-streamdown=mermaid-block]>div:has([data-streamdown=mermaid])]:!rounded-none [&_[data-streamdown=mermaid-block]>div:first-of-type]:!pl-4 [&_[data-streamdown=mermaid-block]>div:first-of-type]:!pr-12 [&_[data-streamdown=mermaid]>div]:!pointer-events-none [&_[data-streamdown=mermaid]_button]:!pointer-events-auto [&_code:not(pre_code)]:rounded [&_code:not(pre_code)]:bg-muted [&_code:not(pre_code)]:px-1 [&_code:not(pre_code)]:py-0.5 [&_code:not(pre_code)]:font-mono [&_code:not(pre_code)]:text-[length:var(--font-code)] [&_.katex-display]:my-3 [&_.katex]:text-[length:var(--font-chat-message)]">
      <Streamdown
        mode="static"
        animated={false}
        shikiTheme={["github-light", "github-dark"]}
        plugins={{ code, math: mathPlugin, mermaid, cjk }}
        controls={{ table: false, code: { copy: true, download: false } }}
        components={components}
      >
        {normalized}
      </Streamdown>
    </div>
    </div>
    </div>
  );
}
