import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "next-themes";
import type { InteractionSpec } from "../../../../shared/interaction-spec";
import {
  buildMathScene,
  initialBindingValues,
  parseMathBindings,
} from "../../../../shared/interaction-math";
import {
  createThreeMathHost,
  type MathScenePayload,
  type ThreeMathHost,
} from "./math-three-host";
import { useThemeStore } from "@/stores/theme-store";
import { BindingSliders } from "../shared/binding-sliders";
import { cn } from "@/lib/utils";

function MathError({ message }: { message: string }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border border-border bg-muted px-4 py-5 text-center">
      <p className="text-[length:var(--font-size-13)] text-foreground">
        {t("interaction.panel.mathErrorTitle")}
      </p>
      <p className="mt-1 font-mono text-[length:var(--font-size-11)] text-muted-foreground">
        {message}
      </p>
    </div>
  );
}

function toScenePayload(
  scene: Extract<ReturnType<typeof buildMathScene>, { ok: true }>,
): MathScenePayload {
  if (scene.kind === "math.surface") {
    return { kind: "math.surface", mesh: scene.mesh };
  }
  return { kind: "math.field", arrows: scene.arrows };
}

/** Match Settings → Appearance theme mode (next-themes). */
function resolveIsDark(resolvedTheme: string | undefined): boolean {
  if (resolvedTheme === "dark") return true;
  if (resolvedTheme === "light") return false;
  return document.documentElement.classList.contains("dark");
}

export function InteractionMathView({
  spec,
  isActive = true,
}: {
  spec: InteractionSpec;
  isActive?: boolean;
}) {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const themeConfig = useThemeStore((s) => s.config);
  const isDark = resolveIsDark(resolvedTheme);
  const isDarkRef = useRef(isDark);
  isDarkRef.current = isDark;

  const containerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<ThreeMathHost | null>(null);
  const mountGenRef = useRef(0);
  const bindingDefs = useMemo(() => parseMathBindings(spec.bindings), [spec.bindings]);
  const [bindingValues, setBindingValues] = useState(() =>
    initialBindingValues(bindingDefs),
  );
  const [mountError, setMountError] = useState<string | null>(null);
  const [hostReady, setHostReady] = useState(0);

  useEffect(() => {
    setBindingValues(initialBindingValues(bindingDefs));
  }, [spec.id, spec.revision, bindingDefs]);

  const scene = useMemo(
    () => buildMathScene(spec, bindingValues),
    [spec, bindingValues],
  );

  const scenePayload = useMemo(
    () => (scene.ok ? toScenePayload(scene) : null),
    [scene],
  );
  const scenePayloadRef = useRef(scenePayload);
  scenePayloadRef.current = scenePayload;

  useEffect(() => {
    if (!isActive) {
      mountGenRef.current += 1;
      hostRef.current?.dispose();
      hostRef.current = null;
      setHostReady(0);
      return;
    }

    if (!scene.ok || !containerRef.current) return;

    const mountGen = ++mountGenRef.current;
    const node = containerRef.current;
    setMountError(null);
    setHostReady(0);
    hostRef.current = null;

    void (async () => {
      try {
        const host = await createThreeMathHost(node, isDarkRef.current);
        if (mountGen !== mountGenRef.current || !node.isConnected) {
          host.dispose();
          return;
        }
        hostRef.current = host;
        const payload = scenePayloadRef.current;
        if (payload) host.setScene(payload);
        host.syncTheme(isDarkRef.current);
        setHostReady((n) => n + 1);
      } catch (err) {
        if (mountGen !== mountGenRef.current) return;
        setMountError(err instanceof Error ? err.message : "Three.js failed to load");
      }
    })();

    return () => {
      mountGenRef.current += 1;
      hostRef.current?.dispose();
      hostRef.current = null;
    };
  }, [spec.id, spec.revision, scene.ok, isActive]);

  useEffect(() => {
    if (!isActive || !scenePayload || hostReady === 0 || !hostRef.current) return;
    hostRef.current.setScene(scenePayload);
  }, [scenePayload, hostReady, isActive]);

  useEffect(() => {
    if (!isActive || hostReady === 0 || !hostRef.current) return;
    hostRef.current.syncTheme(isDark);
  }, [isDark, hostReady, themeConfig, isActive]);

  if (!scene.ok) {
    return <MathError message={scene.error} />;
  }

  if (!isActive) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center rounded-md border border-border bg-muted text-[length:var(--font-size-11)] text-muted-foreground">
        {t("interaction.panel.scenePaused")}
      </div>
    );
  }

  if (mountError) {
    return <MathError message={mountError} />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <BindingSliders spec={spec} values={bindingValues} onChange={setBindingValues} />
      <div
        ref={containerRef}
        className={cn(
          "relative min-h-[240px] w-full flex-1 overflow-hidden rounded-md border border-border bg-card",
          "[&_canvas]:block [&_canvas]:h-full [&_canvas]:w-full",
        )}
        aria-label={spec.title}
        role="img"
      />
      <p className="shrink-0 text-[length:var(--font-size-11)] text-muted-foreground">
        {t("interaction.panel.mathHint")}
      </p>
    </div>
  );
}
