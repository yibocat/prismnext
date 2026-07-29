import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { InteractionSpec } from "../../../../shared/interaction-spec";
import { normalizeFigureResourceProjectPath } from "../../../../shared/interaction-figure";
import {
  DIAGRAM_MAX_FILE_BYTES,
  resolveDiagramSource,
  type DiagramEngine,
} from "../../../../shared/interaction-diagram";
import { openUrlInBrowser } from "../../browser-link/open-in-browser";
import { loadMermaid } from "./load-mermaid";
import { loadGraphviz } from "./load-graphviz";
import { sanitizeDiagramSvg } from "./sanitize-svg";

/** Same 8s convention as figure.script's sandbox mount self-check. */
const DIAGRAM_RENDER_TIMEOUT_MS = 8_000;

function resolveProjectAbsPath(projectRoot: string, relPath: string): string {
  const p = relPath.replace(/\\/g, "/").replace(/^\.\//, "");
  if (p.startsWith("/") || /^[A-Za-z]:[/\\]/.test(p)) return p;
  return `${projectRoot.replace(/\/$/, "")}/${p}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

async function renderDiagram(engine: DiagramEngine, source: string): Promise<string> {
  if (engine === "dot") {
    const graphviz = await loadGraphviz();
    return sanitizeDiagramSvg(graphviz.dot(source));
  }
  const mermaid = await loadMermaid();
  const id = `diagram-${Math.random().toString(36).slice(2)}`;
  const { svg } = await mermaid.render(id, source);
  return svg;
}

function DiagramError({ message }: { message: string }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border border-border bg-muted px-4 py-5 text-center">
      <p className="text-[length:var(--font-size-13)] text-foreground">
        {t("interaction.panel.diagramErrorTitle")}
      </p>
      <p className="mt-1 font-mono text-[length:var(--font-size-11)] text-muted-foreground">
        {message}
      </p>
    </div>
  );
}

export function InteractionDiagramView({
  spec,
  projectRoot,
}: {
  spec: InteractionSpec;
  projectRoot: string;
}) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  // Resolve source text (inline, or read the declared file resource).
  const [resolved, setResolved] = useState<{ engine: DiagramEngine; source: string } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    setResolved(null);
    setError(null);

    const src = resolveDiagramSource(spec);
    if (!src.ok) {
      setError(src.error);
      return;
    }

    if (src.mode === "inline") {
      setResolved({ engine: src.engine, source: src.source });
      return;
    }

    void (async () => {
      const abs = resolveProjectAbsPath(
        projectRoot,
        normalizeFigureResourceProjectPath(spec, src.path),
      );
      try {
        const stat = await window.electronAPI.fsStat(abs).catch(() => null);
        if (stat?.isFile && stat.size > DIAGRAM_MAX_FILE_BYTES) {
          throw new Error(
            `diagram source too large (${stat.size} > ${DIAGRAM_MAX_FILE_BYTES} bytes limit): ${src.path}`,
          );
        }
        const res = await window.electronAPI.fsRead(abs);
        if (cancelled) return;
        const text = typeof res.content === "string" ? res.content : "";
        if (!text.trim()) {
          setError(`could not read "${src.path}"`);
          return;
        }
        setResolved({ engine: src.engine, source: text });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : `could not read "${src.path}"`);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [spec, projectRoot]);

  // Render + self-check.
  useEffect(() => {
    if (!resolved) return;
    const node = containerRef.current;
    if (!node) return;

    let cancelled = false;

    void (async () => {
      try {
        const svg = await withTimeout(
          renderDiagram(resolved.engine, resolved.source),
          DIAGRAM_RENDER_TIMEOUT_MS,
          `diagram render timed out (>${DIAGRAM_RENDER_TIMEOUT_MS / 1000}s)`,
        );
        if (cancelled) return;
        node.innerHTML = svg;
        setError(null);
        void window.electronAPI?.interactionReportSceneError?.({
          projectRoot,
          id: spec.id,
          error: null,
        });
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : "diagram render failed";
        setError(message);
        void window.electronAPI?.interactionReportSceneError?.({
          projectRoot,
          id: spec.id,
          error: message,
          phase: "mount",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resolved, projectRoot, spec.id]);

  // Route <a> clicks inside the rendered SVG to the in-app browser instead
  // of letting them navigate the renderer window (D37).
  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const anchor = (e.target as HTMLElement).closest("a");
    if (!anchor) return;
    e.preventDefault();
    const href = anchor.getAttribute("href") ?? anchor.getAttribute("xlink:href");
    if (href && /^https?:\/\//i.test(href)) {
      openUrlInBrowser(href);
    }
  }

  if (error) return <DiagramError message={error} />;

  if (!resolved) {
    return (
      <div className="flex h-full items-center justify-center text-[length:var(--font-size-12)] text-muted-foreground">
        {t("interaction.card.loading")}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      aria-label={spec.title}
      className="h-full min-h-[280px] w-full overflow-auto rounded-md border border-border bg-card p-2 [&_svg]:h-auto [&_svg]:max-w-full"
    />
  );
}
