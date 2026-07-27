import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "next-themes";
import type { InteractionSpec } from "../../../../shared/interaction-spec";
import {
  initialBindingValues,
  parseMathBindings,
} from "../../../../shared/interaction-math";
import {
  resolveSceneEntry,
  isBuiltinSceneEntry,
} from "../../../../shared/interaction-scene";
import { numericParamsAsBindings } from "../../../../shared/interaction-scene-contract";
import { createSceneHostController } from "./create-scene-host";
import { loadSceneModule } from "./load-scene-module";
import { loadSceneEntryForSpec } from "./resolve-scene-entry";
import type { InteractionSceneModule } from "./scene-ctx";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

function resolveIsDark(resolvedTheme: string | undefined): boolean {
  if (resolvedTheme === "dark") return true;
  if (resolvedTheme === "light") return false;
  return document.documentElement.classList.contains("dark");
}

function artifactDirAbs(projectRoot: string, id: string): string {
  const root = projectRoot.replace(/\/$/, "");
  return `${root}/.prismnext/artifacts/${id}`;
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

/**
 * RightPane keeps inactive tabs mounted for editor/PDF state.
 * Scene WebGL + RAF must NOT keep running off-screen — dispose when inactive.
 */
export function InteractionSceneView({
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

  const entryHint = resolveSceneEntry(spec);
  const legacyJsBlocked =
    spec.kind === "scene.program" &&
    entryHint != null &&
    !isBuiltinSceneEntry(entryHint);
  const bindingDefs = useMemo(
    () => parseMathBindings(spec.bindings),
    [spec.bindings],
  );

  const paramSeed = useMemo(() => numericParamsAsBindings(spec.params), [spec.params]);

  const [bindingValues, setBindingValues] = useState(() => ({
    ...paramSeed,
    ...initialBindingValues(bindingDefs),
  }));
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<ReturnType<typeof createSceneHostController> | null>(null);
  const moduleRef = useRef<InteractionSceneModule | null>(null);
  const mountGenRef = useRef(0);

  useEffect(() => {
    setBindingValues({
      ...paramSeed,
      ...initialBindingValues(bindingDefs),
    });
  }, [spec.id, spec.revision, entryHint, bindingDefs, paramSeed]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !isActive) return;
    host.setBindings(bindingValues);
    void moduleRef.current?.update?.(host.ctx);
  }, [bindingValues, isActive]);

  useEffect(() => {
    if (!isActive) return;
    hostRef.current?.setTheme(isDark);
  }, [isDark, isActive]);

  useEffect(() => {
    if (!isActive) {
      mountGenRef.current += 1;
      moduleRef.current?.dispose?.();
      moduleRef.current = null;
      hostRef.current?.dispose();
      hostRef.current = null;
      return;
    }

    const el = containerRef.current;
    if (!el || !entryHint) {
      setError(entryHint ? null : "invalid scene entry");
      return;
    }

    if (legacyJsBlocked) {
      setError(
        "Legacy scene.js is no longer executed. Use kind scene.ir with spec.model (declarative surface + metric layers). Only builtin:lorenz remains for scene.program.",
      );
      return;
    }

    let cancelled = false;
    const gen = ++mountGenRef.current;
    setError(null);
    setStatus(null);

    void (async () => {
      try {
        const loaded = await loadSceneEntryForSpec(spec, projectRoot);

        const mod = await loadSceneModule(loaded.entry, loaded.sourceText);
        if (cancelled || gen !== mountGenRef.current) {
          mod.dispose?.();
          return;
        }

        hostRef.current?.dispose();
        moduleRef.current?.dispose?.();

        const host = createSceneHostController({
          el,
          artifactDirAbs: artifactDirAbs(projectRoot, spec.id),
          initialBindings: bindingValues,
          isDark,
          onStatus: (message) => {
            if (!cancelled && gen === mountGenRef.current) setStatus(message);
          },
        });
        hostRef.current = host;
        moduleRef.current = mod;
        await mod.mount(host.ctx);
        if (cancelled || gen !== mountGenRef.current) {
          mod.dispose?.();
          host.dispose();
          return;
        }
        void window.electronAPI?.interactionReportSceneError?.({
          projectRoot,
          id: spec.id,
          error: null,
        });
      } catch (e) {
        if (!cancelled && gen === mountGenRef.current) {
          const message = e instanceof Error ? e.message : "scene failed to mount";
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
      moduleRef.current?.dispose?.();
      moduleRef.current = null;
      hostRef.current?.dispose();
      hostRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [projectRoot, spec, entryHint, isActive]);

  if (!entryHint) {
    return <SceneError message="invalid scene entry" />;
  }

  if (legacyJsBlocked) {
    return (
      <SceneError message="Legacy scene.js is no longer executed. Ask the Agent to rewrite as scene.ir (spec.model) — parametric surface + bindings + metric layers." />
    );
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
