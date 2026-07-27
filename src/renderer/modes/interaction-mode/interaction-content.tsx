import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { RightTab } from "@/lib/workspace/mode-registry";
import { SETTINGS_ROW_DESC } from "@/components/modules/settings/settings-tokens";
import { useDocumentStore } from "@/stores/document-store";
import {
  kindDisplayLabel,
  type InteractionSpec,
} from "../../../shared/interaction-spec";
import { resolveInteractionRenderer } from "@/lib/interaction/renderer-registry";
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
  isActive,
}: {
  spec: InteractionSpec;
  projectRoot: string;
  isActive: boolean;
}) {
  const { t } = useTranslation();
  const bindingKeys = Object.keys(spec.bindings ?? {});
  const resources = spec.resources ?? [];
  const renderer = resolveInteractionRenderer(spec.kind);
  const fillViewport = renderer?.fillViewport ?? false;
  const hideMetaBindings = renderer?.hideBindings ?? false;
  const hideResources = renderer?.hideResources ?? false;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col font-sans",
        fillViewport ? "h-full" : "space-y-6",
      )}
    >
      <header className="shrink-0 space-y-2 px-6 pt-5 @md:px-8">
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
        {!fillViewport ? (
          <p className={SETTINGS_ROW_DESC}>{t("interaction.panel.intro")}</p>
        ) : null}
      </header>

      <div
        className={cn(
          "min-h-0 px-6 @md:px-8",
          fillViewport ? "flex flex-1 flex-col pb-3 pt-3" : "space-y-6 py-5",
        )}
      >
        {renderer ? (
          <div className="min-h-0 flex-1">
            <Suspense fallback={<div className="min-h-[280px]" />}>
              <renderer.Component spec={spec} projectRoot={projectRoot} isActive={isActive} />
            </Suspense>
          </div>
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

        {bindingKeys.length > 0 && !hideMetaBindings ? (
          <section className="shrink-0 space-y-2">
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

        {resources.length > 0 && !hideResources ? (
          <section className="shrink-0 space-y-2">
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
      </div>

      <section className="shrink-0 space-y-1 border-t border-border px-6 py-3 @md:px-8">
        <p className="font-mono text-[length:var(--font-size-10)] text-muted-foreground">
          .prismnext/artifacts/{spec.id}/spec.json
        </p>
      </section>
    </div>
  );
}

function normalizeRoot(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/$/, "");
}

export function InteractionContent({
  tab,
  isActive,
}: {
  tab: RightTab;
  isActive: boolean;
}) {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const interactionId = tab.interactionId;
  const [spec, setSpec] = useState<InteractionSpec | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

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
  }, [projectRoot, interactionId, reloadToken]);

  // Refetch when Agent rewrites this artifact (write used to leave open tabs stale).
  useEffect(() => {
    if (!projectRoot || !interactionId) return;
    const unsub = window.electronAPI.onInteractionChanged?.((data) => {
      if (normalizeRoot(data.projectRoot || "") !== normalizeRoot(projectRoot)) return;
      if (data.id !== interactionId) return;
      setReloadToken((n) => n + 1);
    });
    return () => {
      unsub?.();
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
    <div className="h-full min-h-0 overflow-hidden">
      <PanelBody spec={spec} projectRoot={projectRoot!} isActive={isActive} />
    </div>
  );
}
