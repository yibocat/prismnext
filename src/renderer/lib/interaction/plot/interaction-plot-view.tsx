import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { InteractionSpec } from "../../../../shared/interaction/spec";
import { pickCsvResourcePath, type PlotDataResult } from "../../../../shared/interaction/plot";
import { buildPlotOptions } from "./build-plot-spec";
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
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

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
    const node = containerRef.current;
    if (!node) return;

    const measure = () => {
      const width = Math.floor(node.clientWidth);
      const height = Math.floor(node.clientHeight);
      if (width < 8 || height < 8) return;
      setSize((prev) =>
        prev && prev.width === width && prev.height === height
          ? prev
          : { width, height },
      );
    };

    measure();
    const ro = new ResizeObserver(() => {
      measure();
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [data?.ok, loading]);

  useEffect(() => {
    if (!data?.ok || !size || !containerRef.current) return;

    let plotEl: Element | undefined;
    let cancelled = false;
    const node = containerRef.current;
    const { width, height } = size;

    void (async () => {
      const Plot = await import("@observablehq/plot");
      if (cancelled || !node) return;

      const plot = Plot.plot(
        buildPlotOptions(Plot, data, { width, height }, { compact: false }),
      );

      plotEl = plot;
      node.replaceChildren(plot);
    })();

    return () => {
      cancelled = true;
      plotEl?.remove();
    };
  }, [data, size, spec.kind]);

  if (loading) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center text-[length:var(--font-size-12)] text-muted-foreground">
        {t("interaction.card.loading")}
      </div>
    );
  }

  if (!data?.ok) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center px-4">
        <PlotError message={data?.error ?? "unknown error"} />
      </div>
    );
  }

  const csvPath = pickCsvResourcePath(spec.resources) ?? "";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 p-4 @md:px-5 @md:py-4">
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-border bg-card p-3 @md:p-4">
          <div
            ref={containerRef}
            className="min-h-0 w-full flex-1"
            aria-label={spec.title}
          />
        </div>
      </div>
      {csvPath ? (
        <p className="shrink-0 border-t border-border px-4 py-2.5 font-mono text-[length:var(--font-size-10)] text-muted-foreground">
          {csvPath}
        </p>
      ) : null}
    </div>
  );
}
