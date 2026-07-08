import { memo } from "react";

/**
 * Renders a code block frame during streaming — the frame appears as soon
 * as the opening ``` is detected, and code text streams inside it.
 */
export const StreamingCodeFrame = memo(function StreamingCodeFrame({
  lang,
  code,
}: {
  lang: string;
  code: string;
}) {
  return (
    <div className="my-4 max-w-full overflow-hidden rounded-lg border border-border">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-muted/50 border-b border-border">
        <span className="text-xs text-muted-foreground font-mono">
          {lang || "text"}
        </span>
        <span className="text-[10px] text-muted-foreground/50 animate-pulse">
          streaming…
        </span>
      </div>

      {/* Code area — plain monospace, no syntax highlighting */}
      <div className="max-w-full overflow-x-auto bg-muted/20">
        <pre className="!bg-transparent !p-4 !m-0 font-mono text-[length:var(--font-code)] whitespace-pre-wrap break-words">
          <code>
            {code}
            <span className="inline-block w-[0.6em] h-[1.1em] bg-primary align-text-bottom animate-pulse rounded-[1px]" />
          </code>
        </pre>
      </div>
    </div>
  );
});
