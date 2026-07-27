import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "next-themes";
import type { InteractionSpec } from "../../../../shared/interaction-spec";
import {
  initialBindingValues,
  parseMathBindings,
} from "../../../../shared/interaction-math";
import { numericParamsAsBindings } from "../../../../shared/interaction-scene-contract";
import {
  buildSceneIr,
  parseSceneIrModel,
  validateSceneIrSpec,
} from "../../../../shared/interaction-scene-ir";
import { createSceneIrHost, type SceneIrHost } from "./scene-ir-host";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

function resolveIsDark(resolvedTheme: string | undefined): boolean {
  if (resolvedTheme === "dark") return true;
  if (resolvedTheme === "light") return false;
  return document.documentElement.classList.contains("dark");
}

function SceneError({ message }: { message: string }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border border-border bg-muted px-4 py-5 text-center">
      <p className="text-[length:var(--font-size-13)] text-foreground">
        {t("interaction.panel.sceneErrorTitle")}
      </p>
      <p className="mt-1 font-mono text-[length:var(--font-size-11)] text-muted-foreground">
        {message}
      </p>
    </div>
  );
}

function BindingSliders({
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

export function InteractionIrView({
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

  const bindingDefs = useMemo(() => parseMathBindings(spec.bindings), [spec.bindings]);
  const paramSeed = useMemo(() => numericParamsAsBindings(spec.params), [spec.params]);
  const irModel = useMemo(() => parseSceneIrModel(spec.model), [spec.model]);
  const specValidation = useMemo(() => validateSceneIrSpec(spec), [spec]);

  const [bindingValues, setBindingValues] = useState(() => ({
    ...paramSeed,
    ...initialBindingValues(bindingDefs),
  }));
  const [error, setError] = useState<string | null>(() =>
    specValidation.ok ? null : specValidation.error,
  );
  const [status, setStatus] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<SceneIrHost | null>(null);
  const mountGenRef = useRef(0);

  useEffect(() => {
    setBindingValues({
      ...paramSeed,
      ...initialBindingValues(bindingDefs),
    });
    setError(specValidation.ok ? null : specValidation.error);
  }, [spec.id, spec.revision, bindingDefs, paramSeed, specValidation]);

  useEffect(() => {
    if (!isActive) return;
    hostRef.current?.syncTheme(isDark);
  }, [isDark, isActive]);

  useEffect(() => {
    if (!isActive) {
      mountGenRef.current += 1;
      hostRef.current?.dispose();
      hostRef.current = null;
      return;
    }

    const el = containerRef.current;
    if (!el || !irModel || !specValidation.ok) return;

    let cancelled = false;
    const gen = ++mountGenRef.current;

    void (async () => {
      try {
        const host = await createSceneIrHost(el, isDark);
        if (cancelled || gen !== mountGenRef.current) {
          host.dispose();
          return;
        }
        hostRef.current?.dispose();
        hostRef.current = host;

        const built = buildSceneIr(spec, bindingValues);
        if (!built.ok) {
          if (!cancelled && gen === mountGenRef.current) setError(built.error);
          return;
        }
        host.setPayload({
          mesh: built.mesh,
          model: irModel,
          tangent: built.tangent,
        });
        if (!cancelled && gen === mountGenRef.current) {
          setStatus(built.status);
          void window.electronAPI?.interactionReportSceneError?.({
            projectRoot,
            id: spec.id,
            error: null,
          });
        }
      } catch (e) {
        if (!cancelled && gen === mountGenRef.current) {
          const message = e instanceof Error ? e.message : "scene.ir failed to mount";
          setError(message);
          void window.electronAPI?.interactionReportSceneError?.({
            projectRoot,
            id: spec.id,
            error: message,
            phase: "mount",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      hostRef.current?.dispose();
      hostRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once per spec/active
  }, [projectRoot, spec, irModel, specValidation.ok, isActive]);

  useEffect(() => {
    if (!isActive || !hostRef.current || !irModel || !specValidation.ok) return;
    const built = buildSceneIr(spec, bindingValues);
    if (!built.ok) {
      setError(built.error);
      return;
    }
    setError(null);
    hostRef.current.setPayload({
      mesh: built.mesh,
      model: irModel,
      tangent: built.tangent,
    });
    setStatus(built.status);
  }, [bindingValues, spec, irModel, specValidation.ok, isActive]);

  if (!irModel || !specValidation.ok) {
    const validationError = specValidation.ok ? null : specValidation.error;
    return <SceneError message={error ?? validationError ?? "invalid scene.ir model"} />;
  }

  if (!isActive) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center rounded-md border border-border bg-muted text-[length:var(--font-size-11)] text-muted-foreground">
        {t("interaction.panel.scenePaused")}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <BindingSliders
        spec={{
          ...spec,
          bindings:
            Object.keys(bindingDefs).length > 0
              ? (bindingDefs as unknown as Record<string, Record<string, unknown>>)
              : spec.bindings,
        }}
        values={bindingValues}
        onChange={setBindingValues}
      />
      {error ? (
        <SceneError message={error} />
      ) : (
        <div
          ref={containerRef}
          className={cn(
            "min-h-0 flex-1 overflow-hidden rounded-md border border-border bg-card [&_canvas]:h-full [&_canvas]:w-full",
          )}
        />
      )}
      {status ? (
        <p className="shrink-0 whitespace-pre-wrap rounded-md border border-border bg-muted px-3 py-2 font-mono text-[length:var(--font-size-11)] text-foreground">
          {status}
        </p>
      ) : null}
      <p className="shrink-0 text-[length:var(--font-size-10)] text-muted-foreground">
        {t("interaction.panel.sceneHint")}
      </p>
    </div>
  );
}
