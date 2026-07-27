import { useMemo } from "react";
import type { InteractionSpec } from "../../../../shared/interaction-spec";
import { parseMathBindings } from "../../../../shared/interaction-math";
import { Slider } from "@/components/ui/slider";

/** Continuous-parameter sliders shared by math, scene.ir, and instrument panel chrome. */
export function BindingSliders({
  spec,
  values,
  onChange,
}: {
  spec: InteractionSpec;
  values: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
}) {
  const bindings = useMemo(() => parseMathBindings(spec.bindings), [spec.bindings]);
  const keys = Object.keys(bindings);
  if (keys.length === 0) return null;

  return (
    <section className="shrink-0 space-y-3 rounded-md border border-border bg-card px-4 py-3">
      {keys.map((key) => {
        const b = bindings[key]!;
        const value = values[key] ?? b.default;
        return (
          <div key={key} className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-[length:var(--font-size-11)]">
              <span className="text-muted-foreground">{b.label}</span>
              <span className="tabular-nums text-foreground">{value.toFixed(3)}</span>
            </div>
            <Slider
              min={b.min}
              max={b.max}
              step={b.step}
              value={[value]}
              onValueChange={(v) => {
                onChange({ ...values, [key]: v[0] ?? b.default });
              }}
              aria-label={b.label}
            />
          </div>
        );
      })}
    </section>
  );
}
