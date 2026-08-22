import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { RightTab } from "@/lib/workspace/mode-registry";
import { SETTINGS_ROW_DESC } from "@/components/modules/settings/settings-tokens";
import { useDocumentStore } from "@/stores/document-store";
import { resolveInteractionRenderer } from "@/lib/interaction/renderer-registry";
import {
  kindDisplayLabel,
  type InteractionSpec,
} from "../../../shared/interaction/spec";
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

function SpecChrome({
  spec,
  children,
  fillViewport,
}: {
  spec: InteractionSpec;
  children: ReactNode;
  fillViewport: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 space-y-1 border-b border-border px-4 py-3 @md:px-6">
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
        <h2 className="text-[length:var(--font-size-14)] font-medium text-foreground">
          {spec.title}
        </h2>
      </header>
      <div
        className={cn(
          "min-h-0 flex-1",
          fillViewport ? "flex flex-col [&>*]:min-h-0 [&>*]:flex-1" : "overflow-auto",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function UnsupportedPanel({ spec }: { spec: InteractionSpec }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 px-6 py-5 font-sans @md:px-8">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-muted text-muted-foreground">
            {kindDisplayLabel(spec.kind)}
          </Badge>
          <span className="text-[length:var(--font-size-11)] tabular-nums text-muted-foreground">
            r{spec.revision}
          </span>
        </div>
        <h2 className="text-[length:var(--font-size-14)] font-medium text-foreground">
          {spec.title}
        </h2>
        <p className={SETTINGS_ROW_DESC}>{t("interaction.panel.intro")}</p>
      </header>
      <section className="rounded-md border border-border bg-muted px-4 py-6 text-center">
        <p className="text-[length:var(--font-size-13)] text-foreground">
          {t("interaction.panel.unsupportedTitle")}
        </p>
        <p className="mt-1 text-[length:var(--font-size-12)] text-muted-foreground">
          {t("interaction.panel.unsupportedBody", { kind: spec.kind })}
        </p>
      </section>
    </div>
  );
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

  const renderer = resolveInteractionRenderer(spec.kind);
  if (!renderer || !projectRoot) {
    return (
      <div className="h-full min-h-0 overflow-auto">
        <UnsupportedPanel spec={spec} />
      </div>
    );
  }

  const Body = renderer.Component;
  return (
    <SpecChrome spec={spec} fillViewport={renderer.fillViewport}>
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center text-[length:var(--font-size-12)] text-muted-foreground">
            {t("interaction.card.loading")}
          </div>
        }
      >
        <Body spec={spec} projectRoot={projectRoot} isActive={isActive} />
      </Suspense>
    </SpecChrome>
  );
}
