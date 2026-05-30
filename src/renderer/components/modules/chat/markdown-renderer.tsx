import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import katex from "katex";
import "katex/dist/katex.min.css";
import { useState, useCallback, memo, useMemo } from "react";
import { CopyIcon, CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Code Block ───

const CodeBlock = memo(function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [code]);

  return (
    <div className="group relative my-3 overflow-hidden rounded-lg border border-border/50 bg-zinc-950">
      <div className="flex items-center justify-between border-b border-border/20 px-4 py-1.5">
        <span className="font-mono text-muted-foreground text-[length:var(--font-code)]">{language || "code"}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground text-[length:var(--font-code)] transition-colors hover:bg-muted hover:text-foreground"
        >
          {copied ? <CheckIcon className="size-3 text-green-500" /> : <CopyIcon className="size-3" />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="overflow-x-auto p-4">
        <code className="text-[length:var(--font-code)] text-zinc-200 leading-relaxed">{code}</code>
      </pre>
    </div>
  );
});

// ─── Math Pre-Renderer ───
// Render all math in the text to KaTeX HTML BEFORE passing to markdown.
// This decouples math rendering from markdown parsing entirely.

function renderMathToHtml(text: string): string {
  // Protect fenced code blocks and inline code so $ inside them is untouched.
  const protectedBlocks: string[] = [];
  let working = text;

  working = working.replace(/```[\s\S]*?```/g, (m) => {
    protectedBlocks.push(m);
    return `\x00BLOCK${protectedBlocks.length - 1}\x00`;
  });
  working = working.replace(/`[^`\n]+`/g, (m) => {
    protectedBlocks.push(m);
    return `\x00BLOCK${protectedBlocks.length - 1}\x00`;
  });

  // Render display math: $$...$$  and  \[...\]
  working = working.replace(/\$\$([\s\S]*?)\$\$/g, (_, math: string) => {
    try {
      return katex.renderToString(math.trim(), { displayMode: true, throwOnError: false, strict: "ignore" });
    } catch {
      return `<pre><code>${math}</code></pre>`;
    }
  });
  working = working.replace(/\\\[([\s\S]*?)\\\]/g, (_, math: string) => {
    try {
      return katex.renderToString(math.trim(), { displayMode: true, throwOnError: false, strict: "ignore" });
    } catch {
      return `<pre><code>${math}</code></pre>`;
    }
  });

  // Render inline math: $...$  and  \(...\)
  // Must run AFTER display math so $$ isn't partially matched.
  working = working.replace(/\$(.+?)\$/g, (match, math: string) => {
    // Skip false positives: $ alone, $ with leading/trailing space, $ containing $
    if (!math || /^\s|\s$/.test(math) || math.includes("$")) {
      return match; // keep as-is — probably not intentional math
    }
    try {
      return katex.renderToString(math, { displayMode: false, throwOnError: false, strict: "ignore" });
    } catch {
      return `<code>${math}</code>`;
    }
  });
  working = working.replace(/\\\((.+?)\\\)/g, (_, math: string) => {
    try {
      return katex.renderToString(math, { displayMode: false, throwOnError: false, strict: "ignore" });
    } catch {
      return `<code>${math}</code>`;
    }
  });

  // Restore protected blocks
  working = working.replace(/\x00BLOCK(\d+)\x00/g, (_, i: string) => protectedBlocks[parseInt(i)] || "");

  return working;
}

// ─── Markdown Renderer ───

export function MarkdownRenderer({ content }: { content: string }) {
  const htmlContent = useMemo(() => renderMathToHtml(content), [content]);

  return (
    <div
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none",
        "prose-headings:font-semibold prose-h1:text-lg prose-h2:text-base prose-h3:text-sm prose-h4:text-sm",
        "prose-p:leading-normal prose-li:leading-normal",
        "[&_.katex-display]:my-3 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden",
        "[&_.katex]:text-[length:var(--font-chat-message)]",
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          rehypeRaw,
          rehypeSanitize({
            // Allow style + aria-hidden on span/div — needed by KaTeX math rendering
            attributes: {
              span: ["style", "className", "ariaHidden", "aria-hidden"],
              div: ["style", "className", "ariaHidden", "aria-hidden"],
            },
          }) as any,
        ]}
        components={{
          pre({ children }) {
            return <>{children}</>;
          },
          code({ className, children, ...props }) {
            const codeStr = String(children).replace(/\n$/, "");
            const match = /language-(\w+)/.exec(className || "");
            if (match) {
              return <CodeBlock language={match[1]} code={codeStr} />;
            }
            if (codeStr.includes("\n")) {
              return <CodeBlock language="" code={codeStr} />;
            }
            return (
              <code
                className={cn("rounded bg-muted px-1 py-0.5 font-mono text-[length:var(--font-code)]", className)}
                {...props}
              >
                {children}
              </code>
            );
          },
        }}
      >
        {htmlContent}
      </ReactMarkdown>
    </div>
  );
}
