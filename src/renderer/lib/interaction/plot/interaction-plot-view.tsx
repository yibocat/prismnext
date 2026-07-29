import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { InteractionSpec } from "../../../../shared/interaction-spec";
import type { PlotDataResult } from "../../../../shared/interaction-plot";
import { loadInteractionPlotData } from "./load-interaction-plot-data";
import { SETTINGS_ROW_DESC } from "@/components/modules/settings/settings-tokens";
import { cn } from "@/lib/utils";

function PlotError({ message }: { message: string }) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-muted px-4 py-5 text-center",
        SETTINGS_ROW_DESC,
      )}
    >
      <p className="text-[length:var(--font-size-13)] text-foreground">
        {t("interaction.panel.plotErrorTitle")}
      </p>
      <p className="mt-1 font-mono text-[length:var(--font-size-11)] text-muted-foreground">
        {message}
      </p>
    </div>
  );
}

export function InteractionPlotView({
  spec,
  projectRoot,
}: {
  spec: InteractionSpec;
  projectRoot: string;
}) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<PlotDataResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    void loadInteractionPlotData(spec, projectRoot).then((res) => {
      if (cancelled) return;
      setData(res);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [spec, projectRoot]);

  useEffect(() => {
    if (!data?.ok || !containerRef.current) return;

    let plotEl: Element | undefined;
    let cancelled = false;
    const node = containerRef.current;

    void (async () => {
      const Plot = await import("@observablehq/plot");
      if (cancelled || !node) return;

      const width = Math.max(320, node.clientWidth || 640);
      const height = Math.max(
        280,
        node.clientHeight || Math.min(420, Math.round(width * 0.52)),
      );
      const isScatter = spec.kind === "plot.scatter";

      const mark = isScatter
        ? Plot.dot(data.points, { x: "x", y: "y", fill: "series", r: 2.5, fillOpacity: 0.75 })
        : Plot.line(data.points, { x: "x", y: "y", stroke: "series", strokeWidth: 2 });

      const plot = Plot.plot({
        width,
        height,
        marginLeft: 52,
        marginBottom: 40,
        marginTop: 12,
        marginRight: 20,
        x: { label: data.xLabel ?? "x", grid: true },
        y: { label: data.yLabel ?? "y", grid: true },
        color: { legend: true },
        marks: [mark],
        style: {
          background: "transparent",
          color: "var(--foreground)",
          fontFamily: "var(--font-sans)",
          fontSize: "11px",
        },
      });

      plotEl = plot;
      node.replaceChildren(plot);
    })();

    return () => {
      cancelled = true;
      plotEl?.remove();
    };
  }, [data, spec.kind]);

  if (loading) {
    return (
      <div className="flex min-h-[280px] items-center justify-center text-[length:var(--font-size-12)] text-muted-foreground">
        {t("interaction.card.loading")}
      </div>
    );
  }

  if (!data?.ok) {
    return <PlotError message={data?.error ?? "unknown error"} />;
  }

  return (
    <div
      ref={containerRef}
      className="h-full min-h-[280px] w-full overflow-x-auto rounded-md border border-border bg-card px-2 py-3"
      aria-label={spec.title}
    />
  );
}
