import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "next-themes";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import type { InteractionSpec } from "../../../../shared/interaction-spec";
import {
  initialBindingValues,
  parseMathBindings,
} from "../../../../shared/interaction-math";
import {
  parseInstrumentModel,
  resolveInstrumentFigure,
  type InstrumentModel,
} from "../../../../shared/interaction-instrument";
import { loadPlotly } from "../plotly/load-plotly";
import { resolveIsDark, themedLayout } from "../plotly/interaction-plotly-view";
import { BindingSliders } from "../shared/binding-sliders";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function InstrumentError({ message }: { message: string }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border border-border bg-muted px-4 py-5 text-center">
      <p className="text-[length:var(--font-size-13)] text-foreground">
        {t("interaction.panel.instrumentErrorTitle")}
      </p>
      <p className="mt-1 font-mono text-[length:var(--font-size-11)] text-muted-foreground">
        {message}
      </p>
    </div>
  );
}

function StepControls({
  step,
  max,
  playing,
  onChange,
  onTogglePlay,
}: {
  step: number;
  max: number;
  playing: boolean;
  onChange: (next: number) => void;
  onTogglePlay: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="flex shrink-0 items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={t("interaction.panel.stepReset")}
        onClick={() => onChange(0)}
        disabled={step === 0 && !playing}
      >
        <RotateCcw />
      </Button>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={t("interaction.panel.stepPrev")}
        onClick={() => onChange(Math.max(0, step - 1))}
        disabled={step === 0}
      >
        <ChevronLeft />
      </Button>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={playing ? t("interaction.panel.stepPause") : t("interaction.panel.stepPlay")}
        onClick={onTogglePlay}
        disabled={max === 0}
      >
        {playing ? <Pause /> : <Play />}
      </Button>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={t("interaction.panel.stepNext")}
        onClick={() => onChange(Math.min(max, step + 1))}
        disabled={step >= max}
      >
        <ChevronRight />
      </Button>
      <span className="ml-1 shrink-0 font-mono text-[length:var(--font-size-11)] tabular-nums text-muted-foreground">
        {step} / {max}
      </span>
    </section>
  );
}

export function InteractionInstrumentView({
  spec,
  isActive = true,
}: {
  spec: InteractionSpec;
  isActive?: boolean;
}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolveIsDark(resolvedTheme);

  const nodeRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [mountError, setMountError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  const model: InstrumentModel | null = useMemo(
    () => parseInstrumentModel(spec.model),
    [spec.model],
  );

  const bindingDefs = useMemo(() => parseMathBindings(spec.bindings), [spec.bindings]);
  const [bindingValues, setBindingValues] = useState(() => initialBindingValues(bindingDefs));
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    setBindingValues(initialBindingValues(bindingDefs));
    setCurrentStep(0);
    setPlaying(false);
  }, [spec.id, spec.revision, bindingDefs]);

  const stepMax = model?.step?.max ?? 0;

  // Play: auto-advance until max, then stop.
  useEffect(() => {
    if (!playing || !isActive) return;
    if (currentStep >= stepMax) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setCurrentStep((s) => Math.min(stepMax, s + 1)), 350);
    return () => clearTimeout(timer);
  }, [playing, isActive, currentStep, stepMax]);

  const figureResult = useMemo(() => {
    if (!model) return null;
    return resolveInstrumentFigure(model, bindingValues, currentStep);
  }, [model, bindingValues, currentStep]);

  useEffect(() => {
    setParseError(model ? null : "invalid instrument model");
  }, [model]);

  // Mount once per spec identity / active toggle.
  useEffect(() => {
    if (!isActive) {
      mountedRef.current = false;
      return;
    }
    const node = nodeRef.current;
    if (!node || !figureResult?.ok) return;
    let cancelled = false;
    let ro: ResizeObserver | null = null;

    void (async () => {
      try {
        const Plotly = await loadPlotly();
        if (cancelled) return;
        await Plotly.newPlot(
          node,
          figureResult.figure.data as unknown as Parameters<typeof Plotly.newPlot>[1],
          themedLayout(figureResult.figure.layout, isDark) as Parameters<typeof Plotly.newPlot>[2],
          { responsive: true, displaylogo: false },
        );
        if (cancelled) return;
        mountedRef.current = true;
        ro = new ResizeObserver(() => {
          void Plotly.Plots.resize(node);
        });
        ro.observe(node);
        setMountError(null);
      } catch (e) {
        if (cancelled) return;
        setMountError(e instanceof Error ? e.message : "plotly mount failed");
      }
    })();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      ro?.disconnect();
      void loadPlotly().then((Plotly) => Plotly.purge(node));
    };
    // Only remount on identity/active changes — figure data updates go through
    // Plotly.react below so slider/step changes never flash a fresh canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.id, spec.revision, isActive, isDark]);

  // Live recompute: Plotly.react (not newPlot) — the whole point of instrument.
  useEffect(() => {
    if (!isActive || !mountedRef.current || !figureResult?.ok) return;
    const node = nodeRef.current;
    if (!node) return;
    void (async () => {
      const Plotly = await loadPlotly();
      await Plotly.react(
        node,
        figureResult.figure.data as unknown as Parameters<typeof Plotly.react>[1],
        themedLayout(figureResult.figure.layout, isDark) as Parameters<typeof Plotly.react>[2],
      );
    })();
  }, [figureResult, isDark, isActive]);

  if (parseError) return <InstrumentError message={parseError} />;
  if (figureResult && !figureResult.ok) return <InstrumentError message={figureResult.error} />;
  if (mountError) return <InstrumentError message={mountError} />;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <BindingSliders spec={spec} values={bindingValues} onChange={setBindingValues} />
      {model?.step ? (
        <StepControls
          step={currentStep}
          max={stepMax}
          playing={playing}
          onChange={(next) => {
            setPlaying(false);
            setCurrentStep(next);
          }}
          onTogglePlay={() => setPlaying((p) => !p)}
        />
      ) : null}
      <div
        ref={nodeRef}
        aria-label={spec.title}
        className={cn(
          "relative min-h-[240px] w-full flex-1 overflow-hidden rounded-md border border-border bg-card",
        )}
      />
    </div>
  );
}
