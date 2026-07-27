import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "next-themes";
import type { InteractionSpec } from "../../../../shared/interaction-spec";
import {
  PLOTLY_MAX_JSON_BYTES,
  resolvePlotlyFigureSource,
  validatePlotlyFigure,
  type PlotlyFigure,
} from "../../../../shared/interaction-plotly";
import { loadPlotly } from "./load-plotly";

function resolveIsDark(resolvedTheme: string | undefined): boolean {
  if (resolvedTheme === "dark") return true;
  if (resolvedTheme === "light") return false;
  return document.documentElement.classList.contains("dark");
}

function resolveProjectAbsPath(projectRoot: string, relPath: string): string {
  const p = relPath.replace(/\\/g, "/").replace(/^\.\//, "");
  if (p.startsWith("/") || /^[A-Za-z]:[/\\]/.test(p)) return p;
  return `${projectRoot.replace(/\/$/, "")}/${p}`;
}

function themedLayout(
  base: Record<string, unknown> | undefined,
  isDark: boolean,
): Record<string, unknown> {
  const font = (base?.font as Record<string, unknown> | undefined) ?? {};
  return {
    ...(base ?? {}),
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { color: isDark ? "#e5e5e7" : "#1c1c1e", ...font },
    margin: (base?.margin as Record<string, unknown>) ?? { l: 48, r: 16, t: 32, b: 40 },
  };
}

function PlotlyError({ message }: { message: string }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border border-border bg-muted px-4 py-5 text-center">
      <p className="text-[length:var(--font-size-13)] text-foreground">
        {t("interaction.panel.plotlyErrorTitle")}
      </p>
      <p className="mt-1 font-mono text-[length:var(--font-size-11)] text-muted-foreground">
        {message}
      </p>
    </div>
  );
}

export function InteractionPlotlyView({
  spec,
  projectRoot,
  isActive = true,
}: {
  spec: InteractionSpec;
  projectRoot: string;
  isActive?: boolean;
}) {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const isDark = resolveIsDark(resolvedTheme);
  const nodeRef = useRef<HTMLDivElement>(null);
  const [figure, setFigure] = useState<PlotlyFigure | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load figure (inline or from disk)
  useEffect(() => {
    let cancelled = false;
    setFigure(null);
    setError(null);

    const src = resolvePlotlyFigureSource(spec);
    if (!src.ok) {
      setError(src.error);
      return;
    }
    if (src.mode === "inline") {
      setFigure(src.figure);
      return;
    }

    void (async () => {
      const abs = resolveProjectAbsPath(projectRoot, src.path);
      try {
        const res = await window.electronAPI.fsRead(abs);
        if (cancelled) return;
        const text = typeof res.content === "string" ? res.content : "";
        if (!text.trim()) {
          setError(`could not read "${src.path}"`);
          return;
        }
        if (text.length > PLOTLY_MAX_JSON_BYTES) {
          setError(`figure json too large (> ${PLOTLY_MAX_JSON_BYTES} bytes): ${src.path}`);
          return;
        }
        const validated = validatePlotlyFigure(JSON.parse(text));
        if (!validated.ok) {
          setError(`${src.path}: ${validated.error}`);
          return;
        }
        setFigure(validated.figure);
      } catch {
        if (!cancelled) setError(`could not read "${src.path}"`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [spec, projectRoot]);

  // Render + self-check
  useEffect(() => {
    if (!isActive || !figure) return;
    const node = nodeRef.current;
    if (!node) return;

    let cancelled = false;
    let ro: ResizeObserver | null = null;

    void (async () => {
      try {
        const Plotly = await loadPlotly();
        if (cancelled) return;
        await Plotly.newPlot(
          node,
          figure.data as unknown as Parameters<typeof Plotly.newPlot>[1],
          themedLayout(figure.layout, isDark) as Parameters<typeof Plotly.newPlot>[2],
          { responsive: true, displaylogo: false, ...(figure.config ?? {}) },
        );
        if (cancelled) return;
        // Frames power step-through demos (slider/Play) — added explicitly so
        // sliders/updatemenus already in layout stay wired to them.
        if (figure.frames?.length) {
          await Plotly.addFrames(
            node,
            figure.frames as unknown as Parameters<typeof Plotly.addFrames>[1],
          );
        }
        if (cancelled) return;
        ro = new ResizeObserver(() => {
          void Plotly.Plots.resize(node);
        });
        ro.observe(node);
        void window.electronAPI?.interactionReportSceneError?.({
          projectRoot,
          id: spec.id,
          error: null,
        });
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : "plotly render failed";
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
      ro?.disconnect();
      void loadPlotly().then((Plotly) => Plotly.purge(node));
    };
  }, [figure, isDark, isActive, projectRoot, spec.id]);

  if (error) return <PlotlyError message={error} />;

  if (!figure) {
    return (
      <div className="flex h-full items-center justify-center text-[length:var(--font-size-12)] text-muted-foreground">
        {t("interaction.card.loading")}
      </div>
    );
  }

  return (
    <div
      ref={nodeRef}
      aria-label={spec.title}
      className="h-full min-h-[280px] w-full rounded-md border border-border bg-card"
    />
  );
}
