import { useState, useCallback, useEffect, useRef, memo } from "react";
import { createHighlighter, type Highlighter } from "shiki";
import { CheckIcon, CopyIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { useSettingsStore } from "@/stores/settings-store";
import { Hint } from "@/components/ui/hint";
import { ChatArtifactFence } from "@/lib/markdown/chat-artifact-block";
import { ChatInteractionFence } from "@/lib/markdown/chat-interaction-block";

// ── Map app syntax themes to Shiki theme names ──
// Keys match EditorSyntaxThemeId from src/renderer/lib/editor-themes/types.ts
const THEME_TO_SHIKI: Record<string, { light: string; dark: string }> = {
  prism:           { light: "github-light",  dark: "github-dark" },
  github:          { light: "github-light",  dark: "github-dark" },
  nord:            { light: "github-light",  dark: "nord" },
  "one-dark":      { light: "github-light",  dark: "one-dark-pro" },
  monokai:         { light: "github-light",  dark: "monokai" },
  dracula:         { light: "github-light",  dark: "dracula" },
  "tokyo-night":   { light: "github-light",  dark: "tokyo-night" },
  "solarized-light": { light: "solarized-light", dark: "solarized-dark" },
};

// Every Shiki theme we ever need — preloaded once
const ALL_SHIKI_THEMES = [...new Set(
  Object.values(THEME_TO_SHIKI).flatMap((t) => [t.light, t.dark]),
)];

// ── Shared highlighter singleton ──
let _highlighterPromise: Promise<Highlighter> | null = null;
const COMMON_LANGS = ["python", "javascript", "typescript", "tsx", "jsx", "bash", "shell", "json", "yaml", "css", "html", "xml", "markdown", "sql", "tex", "latex", "rust", "go", "java", "c", "cpp"];

function getHighlighter(): Promise<Highlighter> {
  if (!_highlighterPromise) {
    _highlighterPromise = createHighlighter({
      themes: ALL_SHIKI_THEMES,
      langs: COMMON_LANGS,
    });
  }
  return _highlighterPromise;
}

// ── Code fold threshold ──
const MAX_LINES = 30;

// ── Copy button ──
const CopyButton = memo(({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);
  return (
    <Hint label="Copy">
      <button
        type="button"
        onClick={handleCopy}
        className="flex size-6 items-center justify-center rounded text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground transition-colors"
      >
        {copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
      </button>
    </Hint>
  );
});
CopyButton.displayName = "CopyButton";

// ── Entry: artifact fence vs Shiki highlight (hooks stay inside each branch) ──
export const ShikiCodeBlock = memo(function ShikiCodeBlock({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const lang = className?.replace("language-", "") || "";
  const code = String(children).replace(/\n$/, "");
  if (lang === "artifact") {
    return <ChatArtifactFence raw={code} />;
  }
  if (lang === "interaction") {
    return <ChatInteractionFence raw={code} />;
  }
  return <ShikiHighlightedCode className={className} code={code} lang={lang} />;
});

const ShikiHighlightedCode = memo(function ShikiHighlightedCode({
  className,
  code,
  lang,
}: {
  className?: string;
  code: string;
  lang: string;
}) {
  const [html, setHtml] = useState<string>("");
  const [lines, setLines] = useState(0);
  const [folded, setFolded] = useState(true);
  const mountedRef = useRef(true);

  // Subscribe to the user's editor syntax theme choice.
  // When this changes (via Settings → Appearance), the component re-renders
  // and Shiki regenerates the highlighted HTML with the new theme.
  const editorSyntaxTheme = useSettingsStore(
    (s) => s.settings?.editorSyntaxTheme || "prism",
  );
  const shikiThemes = THEME_TO_SHIKI[editorSyntaxTheme] || THEME_TO_SHIKI.prism;

  // Distinguish inline code from fenced code blocks without language.
  // Inline code is always single-line; fenced code blocks are multi-line.
  const isInline = !className && !code.includes("\n");

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Code block — async Shiki highlight.
  // Placed BEFORE the inline early-return to satisfy React hooks ordering rules.
  // Guarded internally: skips work for inline code renders.
  useEffect(() => {
    if (isInline) return;
    let cancelled = false;
    const run = async () => {
      try {
        const hl = await getHighlighter();
        if (cancelled || !mountedRef.current) return;
        const langForShiki = COMMON_LANGS.includes(lang) ? lang : "text";
        const result = hl.codeToHtml(code, {
          lang: langForShiki,
          themes: shikiThemes,
          defaultColor: "light",
        });
        if (!cancelled && mountedRef.current) {
          setHtml(result);
          setLines(code.split("\n").length);
        }
      } catch (err) {
        // Packaged builds used to fail here when CSP blocked Oniguruma WASM
        // (no 'wasm-unsafe-eval'). Fall back to plain text so chat still works.
        console.warn("[ShikiCodeBlock] highlight failed", err);
        if (!cancelled && mountedRef.current) {
          setLines(code.split("\n").length);
        }
      }
    };
    run();
    return () => { cancelled = true; };
  }, [isInline, code, lang, shikiThemes.light, shikiThemes.dark]);

  // ── Render ──

  if (isInline) {
    return (
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[length:var(--font-code)]">
        {code}
      </code>
    );
  }

  // Fenced code block
  const resolvedLang = lang || "text";

  const shouldFold = lines > MAX_LINES;
  const isFolded = shouldFold && folded;

  return (
    <div className="my-4 max-w-full overflow-hidden rounded-lg border border-border">
      {/* Header bar: language label + copy button */}
      <div className="flex items-center justify-between border-b border-border-subtle bg-muted/50 px-4 py-1.5">
        <span className="text-xs text-muted-foreground font-mono">{resolvedLang}</span>
        <CopyButton text={code} />
      </div>

      {/* Code area */}
      <div className="relative">
        <div
          className={isFolded ? "overflow-hidden" : "overflow-x-auto"}
          style={isFolded ? { maxHeight: "29.5rem" } : undefined}
        >
          <div
            className="shiki-wrapper [&_pre]:!bg-transparent [&_pre]:!p-4 [&_pre]:!m-0 [&_pre]:text-[length:var(--font-code)]"
            dangerouslySetInnerHTML={{ __html: html || `<pre><code>${escapeHtml(code)}</code></pre>` }}
          />
        </div>

        {/* Fold gradient + button */}
        {isFolded && (
          <>
            <div
              className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
              style={{
                background: "linear-gradient(to top, var(--background), transparent)",
              }}
            />
            <button
              type="button"
              onClick={() => setFolded(false)}
              className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-md border border-border-subtle bg-background/80 px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronDownIcon className="size-3" />
              Show all {lines} lines
            </button>
          </>
        )}

        {/* Collapse button (when expanded) */}
        {shouldFold && !folded && (
          <button
            type="button"
            onClick={() => setFolded(true)}
            className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-md border border-border-subtle bg-background/80 px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronUpIcon className="size-3" />
            Collapse
          </button>
        )}
      </div>
    </div>
  );
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
