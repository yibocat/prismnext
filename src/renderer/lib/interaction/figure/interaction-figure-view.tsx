import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { InteractionSpec } from "../../../../shared/interaction-spec";
import {
  FIGURE_MAX_BYTES,
  injectFigureHtmlCsp,
  resolveFigureDisplay,
} from "../../../../shared/interaction-figure";
import { cn } from "@/lib/utils";

const FIGURE_HTML_LOAD_TIMEOUT_MS = 10_000;

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${bytes}B`;
}

function resolveProjectAbsPath(projectRoot: string, relPath: string): string {
  const p = relPath.replace(/\\/g, "/").replace(/^\.\//, "");
  if (p.startsWith("/") || /^[A-Za-z]:[/\\]/.test(p)) return p;
  const root = projectRoot.replace(/\/$/, "");
  return `${root}/${p}`;
}

function FigureError({ message }: { message: string }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border border-border bg-muted px-4 py-5 text-center">
      <p className="text-[length:var(--font-size-13)] text-foreground">
        {t("interaction.panel.figureErrorTitle")}
      </p>
      <p className="mt-1 font-mono text-[length:var(--font-size-11)] text-muted-foreground">
        {message}
      </p>
    </div>
  );
}

export function InteractionFigureView({
  spec,
  projectRoot,
}: {
  spec: InteractionSpec;
  projectRoot: string;
}) {
  const { t } = useTranslation();
  const resolved = resolveFigureDisplay(spec);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [htmlSrc, setHtmlSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const htmlLoadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const displayKey = `${spec.revision}:${resolved.ok ? `${resolved.mode}:${resolved.path}` : resolved.error}`;

  useEffect(() => {
    setDataUrl(null);
    setHtmlSrc(null);
    setError(null);
    const next = resolveFigureDisplay(spec);
    if (!next.ok) {
      setError(next.error);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    const abs = resolveProjectAbsPath(projectRoot, next.path);

    void (async () => {
      try {
        const stat = await window.electronAPI.fsStat(abs).catch(() => null);
        if (stat?.isFile && stat.size > FIGURE_MAX_BYTES) {
          if (!cancelled) {
            setError(
              `figure resource too large (${formatBytes(stat.size)} > ${formatBytes(FIGURE_MAX_BYTES)} limit): ${next.path}`,
            );
          }
          return;
        }

        if (next.mode === "image") {
          const res = await window.electronAPI.fsReadImage(abs);
          if (cancelled) return;
          if (!res.dataUrl) {
            setError(`could not read figure "${next.path}"`);
            return;
          }
          setDataUrl(res.dataUrl);
          return;
        }

        const res = await window.electronAPI.fsRead(abs);
        if (cancelled) return;
        const html = typeof res.content === "string" ? res.content : "";
        if (!html.trim()) {
          setError(`empty html "${next.path}"`);
          return;
        }
        // Deny outbound network access from agent-generated HTML — sandbox
        // alone blocks DOM/cookie access but not fetch()/XHR from the frame.
        const safeHtml = injectFigureHtmlCsp(html);
        objectUrl = URL.createObjectURL(new Blob([safeHtml], { type: "text/html" }));
        setHtmlSrc(objectUrl);
      } catch {
        if (!cancelled) setError(`could not read "${next.path}"`);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [projectRoot, spec, displayKey]);

  useEffect(() => {
    if (htmlLoadTimeoutRef.current) {
      clearTimeout(htmlLoadTimeoutRef.current);
      htmlLoadTimeoutRef.current = null;
    }
    if (!htmlSrc) return;
    htmlLoadTimeoutRef.current = setTimeout(() => {
      setError(`figure preview timed out loading (>${FIGURE_HTML_LOAD_TIMEOUT_MS / 1000}s)`);
    }, FIGURE_HTML_LOAD_TIMEOUT_MS);
    return () => {
      if (htmlLoadTimeoutRef.current) {
        clearTimeout(htmlLoadTimeoutRef.current);
        htmlLoadTimeoutRef.current = null;
      }
    };
  }, [htmlSrc]);

  function handleHtmlLoad() {
    if (htmlLoadTimeoutRef.current) {
      clearTimeout(htmlLoadTimeoutRef.current);
      htmlLoadTimeoutRef.current = null;
    }
  }

  if (!resolved.ok || error) {
    return <FigureError message={error ?? (resolved.ok ? "unknown" : resolved.error)} />;
  }

  if (resolved.mode === "image") {
    if (!dataUrl) {
      return (
        <div className="flex h-full items-center justify-center text-[length:var(--font-size-12)] text-muted-foreground">
          {t("interaction.card.loading")}
        </div>
      );
    }
    return (
      <div className="flex h-full min-h-0 flex-col gap-2">
        <div
          className={cn(
            "flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-md border border-border bg-card p-3",
          )}
        >
          <img
            src={dataUrl}
            alt={spec.title}
            className="max-h-full max-w-full object-contain"
          />
        </div>
        <p className="shrink-0 font-mono text-[length:var(--font-size-10)] text-muted-foreground">
          {resolved.path}
        </p>
      </div>
    );
  }

  if (!htmlSrc) {
    return (
      <div className="flex h-full items-center justify-center text-[length:var(--font-size-12)] text-muted-foreground">
        {t("interaction.card.loading")}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <iframe
        title={spec.title}
        src={htmlSrc}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        loading="lazy"
        onLoad={handleHtmlLoad}
        className="min-h-0 flex-1 w-full rounded-md border border-border bg-card"
      />
      <p className="shrink-0 font-mono text-[length:var(--font-size-10)] text-muted-foreground">
        {resolved.path}
      </p>
    </div>
  );
}
