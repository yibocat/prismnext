import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { RightTab } from "@/lib/workspace/mode-registry";
import { SETTINGS_ROW_DESC } from "@/components/modules/settings/settings-tokens";
import { useDocumentStore } from "@/stores/document-store";
import {
  kindDisplayLabel,
  type InteractionSpec,
} from "../../../shared/interaction-spec";
import { isInteractionPlotKind } from "../../../shared/interaction-plot";
import { isInteractionMathKind } from "../../../shared/interaction-math";
import { InteractionPlotView } from "@/lib/interaction/plot/interaction-plot-view";
import { InteractionMathView } from "@/lib/interaction/math/interaction-math-view";
import { cn } from "@/lib/utils";

function Badge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[length:var(--font-size-10)] font-medium",
        className,
      )}
    >
      {children}
    </span>
  );
}

function PanelBody({
  spec,
  projectRoot,
}: {
  spec: InteractionSpec;
  projectRoot: string;
}) {
  const { t } = useTranslation();
  const bindingKeys = Object.keys(spec.bindings ?? {});
  const resources = spec.resources ?? [];
  const showPlot = isInteractionPlotKind(spec.kind);
  const showMath = isInteractionMathKind(spec.kind);

  return (
    <div className="space-y-6 px-6 py-5 font-sans @md:px-8">
      <header className="space-y-2">
        <h2 className="text-[length:var(--font-size-15)] font-medium text-foreground">
          {spec.title}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-muted text-muted-foreground">
            {kindDisplayLabel(spec.kind)}
          </Badge>
          <Badge
            className={
              spec.compute === "bound"
                ? "bg-accent text-foreground"
                : "bg-muted text-muted-foreground"
            }
          >
            {spec.compute === "bound"
              ? t("interaction.badge.bound")
              : t("interaction.badge.local")}
          </Badge>
          <span className="text-[length:var(--font-size-11)] tabular-nums text-muted-foreground">
            r{spec.revision}
          </span>
        </div>
        <p className={SETTINGS_ROW_DESC}>
          {showPlot
            ? t("interaction.panel.introPlot")
            : showMath
              ? t("interaction.panel.introMath")
              : t("interaction.panel.intro")}
        </p>
      </header>

      {showPlot ? (
        <InteractionPlotView spec={spec} projectRoot={projectRoot} />
      ) : showMath ? (
        <InteractionMathView spec={spec} />
      ) : (
        <section className="rounded-md border border-border bg-muted px-4 py-6 text-center">
          <p className="text-[length:var(--font-size-13)] text-foreground">
            {t("interaction.panel.placeholderTitle")}
          </p>
          <p className="mt-1 text-[length:var(--font-size-12)] text-muted-foreground">
            {t("interaction.panel.placeholderBody", { kind: spec.kind })}
          </p>
        </section>
      )}

      {bindingKeys.length > 0 && !showMath ? (
        <section className="space-y-2">
          <h3 className="text-[length:var(--font-size-11)] font-medium text-muted-foreground">
            {t("interaction.panel.bindings")}
          </h3>
          <ul className="space-y-1 font-mono text-[length:var(--font-size-11)] text-muted-foreground">
            {bindingKeys.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {resources.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-[length:var(--font-size-11)] font-medium text-muted-foreground">
            {t("interaction.panel.resources")}
          </h3>
          <ul className="space-y-1 font-mono text-[length:var(--font-size-11)] text-muted-foreground">
            {resources.map((r, i) => (
              <li key={`${r.path ?? r.runId ?? i}`}>
                {r.path ?? r.artifactPath ?? "—"}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-1 border-t border-border pt-4">
        <p className="font-mono text-[length:var(--font-size-10)] text-muted-foreground">
          .prismnext/artifacts/{spec.id}/spec.json
        </p>
      </section>
    </div>
  );
}

export function InteractionContent({
  tab,
}: {
  tab: RightTab;
  isActive: boolean;
}) {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const interactionId = tab.interactionId;
  const [spec, setSpec] = useState<InteractionSpec | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSpec(null);
    setError(null);
    if (!projectRoot || !interactionId) return;
    let cancelled = false;
    void window.electronAPI.interactionGet(projectRoot, interactionId).then((res) => {
      if (cancelled) return;
      if (res.spec) setSpec(res.spec);
      else setError(res.error ?? "not found");
    });
    return () => {
      cancelled = true;
    };
  }, [projectRoot, interactionId]);

  if (!interactionId) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <p className={SETTINGS_ROW_DESC}>{t("interaction.panel.empty")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <p className={SETTINGS_ROW_DESC}>
          {t("interaction.panel.loadError", { id: interactionId, error })}
        </p>
      </div>
    );
  }

  if (!spec) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-[length:var(--font-size-12)] text-muted-foreground">
        {t("interaction.card.loading")}
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-auto">
      <PanelBody spec={spec} projectRoot={projectRoot!} />
    </div>
  );
}
