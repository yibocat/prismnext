import { Streamdown } from "streamdown";
import type { Components } from "streamdown";
import { code } from "@streamdown/code";
import { createMathPlugin } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { cjk } from "@streamdown/cjk";
import "katex/dist/katex.min.css";
import "streamdown/styles.css";
import { cn } from "@/lib/utils";
import { useRef, useLayoutEffect, useMemo } from "react";

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
// @streamdown/math only supports $...$ and $$...$$. Convert \(...\) → $...$
// and \[...\] → $$...$$ so LaTeX-native delimiters also render.
// Must NOT touch content inside code blocks (``` or `).

function normalizeMathDelimiters(text: string): string {
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

  return working;
}

// ─── Markdown Renderer ───

interface MarkdownRendererProps {
  content: string;
  isAnimating?: boolean;
}

const MAX_LINES = 30;

export function MarkdownRenderer({ content, isAnimating = false }: MarkdownRendererProps) {
  const normalized = useMemo(() => normalizeMathDelimiters(content), [content]);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // CSS containment: isolate this message's heavy DOM (Streamdown + Shiki
  // creates thousands of nodes per code block) from the rest of the page.
  // During streaming we skip content-visibility to keep auto-scroll working;
  // for completed messages we use the full suite since their content is stable.
  const containStyle: React.CSSProperties = useMemo(() => ({
    contain: isAnimating ? "layout style" : "layout style paint",
    contentVisibility: isAnimating ? undefined : "auto",
    containIntrinsicSize: isAnimating ? undefined : "auto 600px",
  } as React.CSSProperties), [isAnimating]);

  // Inject fold into code blocks > MAX_LINES lines.
  // MutationObserver — fires when Streamdown adds code blocks to DOM,
  // including after Shiki async highlighting completes.
  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const applyFold = () => {
      const pres = wrapper.querySelectorAll(
        "[data-streamdown=code-block-body] pre",
      );
      pres.forEach((pre) => {
        if (pre.closest("[data-fold]")) return;

        const blocks = pre.querySelectorAll("span.block");
        const lines = blocks.length || (pre as HTMLElement).innerText.split("\n").filter(Boolean).length;
        if (lines <= MAX_LINES) return;

        const container = document.createElement("div");
        container.setAttribute("data-fold", "true");
        container.style.position = "relative";

        const foldInner = document.createElement("div");
        foldInner.style.maxHeight = "29.5rem";
        foldInner.style.overflow = "hidden";
        foldInner.style.position = "relative";

        const gradient = document.createElement("div");
        gradient.style.cssText =
          "position:absolute;bottom:0;left:0;right:0;height:4rem;background:linear-gradient(to top,var(--background),transparent);pointer-events:none";

        const btn = document.createElement("button");
        btn.style.cssText =
          "position:absolute;bottom:4px;left:50%;transform:translateX(-50%);font-size:12px;color:var(--muted-foreground);background:color-mix(in oklab,var(--background)80%,transparent);padding:4px 12px;border-radius:4px;border:1px solid color-mix(in oklab,var(--border)50%,transparent);cursor:pointer";
        btn.textContent = `Show all ${lines} lines`;

        const expand = () => {
          foldInner.style.maxHeight = "none";
          gradient.remove();
          btn.textContent = "Collapse";
          btn.onclick = collapse;
        };
        const collapse = () => {
          foldInner.style.maxHeight = "29.5rem";
          foldInner.appendChild(gradient);
          btn.textContent = `Show all ${lines} lines`;
          btn.onclick = expand;
        };
        btn.onclick = expand;

        pre.parentNode?.insertBefore(container, pre);
        foldInner.appendChild(pre);
        foldInner.appendChild(gradient);
        container.appendChild(foldInner);
        container.appendChild(btn);
      });
    };

    // Debounced scan — avoids thrashing during streaming (deltas every ~50ms)
    let timer: ReturnType<typeof setTimeout>;
    const scheduleScan = () => {
      clearTimeout(timer);
      timer = setTimeout(applyFold, 100);
    };

    applyFold();
    const t1 = setTimeout(applyFold, 300);
    const t2 = setTimeout(applyFold, 1000);
    const observer = new MutationObserver((mutations) => {
      // Only scan if mutations might affect code blocks
      const relevant = mutations.some((m) => {
        for (const node of m.addedNodes) {
          if (node instanceof HTMLElement) {
            if (node.matches?.("[data-streamdown=code-block-body], [data-streamdown=code-block-body] *, pre, span.block")) return true;
          }
        }
        return false;
      });
      if (relevant) scheduleScan();
    });
    observer.observe(wrapper, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      clearTimeout(timer);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <div
      ref={wrapperRef}
      style={containStyle}
      className={cn(
        "text-sm text-foreground leading-normal",
        "[&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mt-6 [&_h1]:mb-2",
        "[&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-5 [&_h2]:mb-1",
        "[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1",
        "[&_h4]:text-sm [&_h4]:font-semibold [&_h4]:mt-3 [&_h4]:mb-1",
        "[&_p]:my-1 [&_p]:leading-normal",
        "[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-6",
        "[&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-6",
        "[&_li]:my-0.5 [&_li]:leading-normal",
        "[&_a]:text-primary [&_a]:underline",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:my-2 [&_blockquote]:text-muted-foreground",
        "[&_hr]:my-4 [&_hr]:border-border",
        // Code block — minimal
        "[&_[data-streamdown=code-block]]:!bg-transparent [&_[data-streamdown=code-block]]:!p-0 [&_[data-streamdown=code-block]]:!gap-0 [&_[data-streamdown=code-block]]:relative",
        "[&_[data-streamdown=code-block-body]]:!border-0 [&_[data-streamdown=code-block-body]]:!text-[length:var(--font-code)]",
        // Header: language left, room for copy button right
        "[&_[data-streamdown=code-block-header]]:!pl-4 [&_[data-streamdown=code-block-header]]:!pr-12",
        // Pin copy button to top-right corner of code block
        "[&_[data-streamdown=code-block]>div:has([data-streamdown=code-block-actions])]:!absolute [&_[data-streamdown=code-block]>div:has([data-streamdown=code-block-actions])]:!top-0.5 [&_[data-streamdown=code-block]>div:has([data-streamdown=code-block-actions])]:!right-1.5 [&_[data-streamdown=code-block]>div:has([data-streamdown=code-block-actions])]:!m-0 [&_[data-streamdown=code-block]>div:has([data-streamdown=code-block-actions])]:!z-10",
        // Smaller copy button
        "[&_[data-streamdown=code-block-copy-button]]:!p-0.5 [&_[data-streamdown=code-block-copy-button]_svg]:!size-3",
        // Mermaid
        "[&_[data-streamdown=mermaid-block]]:!bg-transparent [&_[data-streamdown=mermaid-block]]:!p-0 [&_[data-streamdown=mermaid-block]]:!gap-0 [&_[data-streamdown=mermaid-block]]:!overflow-hidden [&_[data-streamdown=mermaid-block]]:relative",
        "[&_[data-streamdown=mermaid-block]>div:has([data-streamdown=mermaid-block-actions])]:!absolute [&_[data-streamdown=mermaid-block]>div:has([data-streamdown=mermaid-block-actions])]:!top-1.5 [&_[data-streamdown=mermaid-block]>div:has([data-streamdown=mermaid-block-actions])]:!right-1.5 [&_[data-streamdown=mermaid-block]>div:has([data-streamdown=mermaid-block-actions])]:!m-0 [&_[data-streamdown=mermaid-block]>div:has([data-streamdown=mermaid-block-actions])]:!z-10",
        "[&_[data-streamdown=mermaid-block-actions]_button]:!p-0.5 [&_[data-streamdown=mermaid-block-actions]_svg]:!size-3",
        "[&_[data-streamdown=mermaid-block]>div:has([data-streamdown=mermaid])]:!border-0 [&_[data-streamdown=mermaid-block]>div:has([data-streamdown=mermaid])]:!rounded-none",
        "[&_[data-streamdown=mermaid-block]>div:first-of-type]:!pl-4 [&_[data-streamdown=mermaid-block]>div:first-of-type]:!pr-12",
        // Lock mermaid — no scroll-zoom/pan; use fullscreen button to interact
        "[&_[data-streamdown=mermaid]>div]:!pointer-events-none",
        "[&_[data-streamdown=mermaid]_button]:!pointer-events-auto",
        // Inline code
        "[&_code:not(pre_code)]:rounded [&_code:not(pre_code)]:bg-muted [&_code:not(pre_code)]:px-1",
        "[&_code:not(pre_code)]:py-0.5 [&_code:not(pre_code)]:font-mono [&_code:not(pre_code)]:text-[length:var(--font-code)]",
        // KaTeX
        "[&_.katex-display]:my-3",
        "[&_.katex]:text-[length:var(--font-chat-message)]",
      )}
    >
      <Streamdown
        mode={isAnimating ? "streaming" : "static"}
        isAnimating={isAnimating}
        animated={false}
        caret="block"
        lineNumbers
        shikiTheme={["github-light", "github-dark"]}
        plugins={{ code, math: mathPlugin, mermaid, cjk }}
        controls={{ table: false, code: { copy: true, download: false } }}
        components={components}
      >
        {normalized}
      </Streamdown>
    </div>
  );
}
