/**
 * ChatInteractionBlock — thumbnail card for ```interaction fences.
 * Opens the Interaction panel in RightArea (P0 shell).
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SparklesIcon } from "lucide-react";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import { useDocumentStore } from "@/stores/document-store";
import {
  kindDisplayLabel,
  type InteractionSpec,
} from "../../../shared/interaction-spec";
import { isInteractionPlotlyKind } from "../../../shared/interaction-plotly";
import { isInteractionInstrumentKind } from "../../../shared/interaction-instrument";
import { interactionThumbnailRelPath } from "../../../shared/interaction-artifacts-path";
import { openInteractionPanel } from "@/lib/interaction/open-interaction-panel";
import { parseInteractionFenceContent } from "./chat-interaction";

function normalizeRoot(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/$/, "");
}

function resolveProjectAbsPath(projectRoot: string, relPath: string): string {
  const root = normalizeRoot(projectRoot);
  return `${root}/${relPath}`;
}

function ComputeBadge({ compute }: { compute: InteractionSpec["compute"] }) {
  const { t } = useTranslation();
  const label =
    compute === "bound"
      ? t("interaction.badge.bound")
      : t("interaction.badge.local");
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[length:var(--font-size-10)] font-medium",
        compute === "bound"
          ? "bg-accent text-foreground"
          : "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

export function ChatInteractionBlock({
  id,
  titleOverride,
}: {
  id: string;
  titleOverride?: string;
}) {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const [spec, setSpec] = useState<InteractionSpec | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [thumbnailDataUrl, setThumbnailDataUrl] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setSpec(null);
    if (!projectRoot) {
      setLoading(false);
      setError("no project");
      return;
    }
    let cancelled = false;
    void window.electronAPI.interactionGet(projectRoot, id).then((res) => {
      if (cancelled) return;
      if (res.spec) {
        setSpec(res.spec);
        setError(null);
      } else {
        setSpec(null);
        setError(res.error ?? "not found");
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectRoot, id]);

  const title = titleOverride?.trim() || spec?.title || id;
  const kind = spec?.kind ?? "…";
  const compute = spec?.compute ?? "local";
  const hasThumbnail =
    !!spec && (isInteractionPlotlyKind(spec.kind) || isInteractionInstrumentKind(spec.kind));

  // Soft enhancement: the host renders a thumbnail in the background after a
  // successful figure.plotly/instrument write (V4-B). No error state on miss —
  // the Sparkles icon fallback stays until the capture lands.
  useEffect(() => {
    if (!projectRoot || !hasThumbnail) {
      setThumbnailDataUrl(null);
      return;
    }
    let cancelled = false;
    const fetchThumbnail = () => {
      const abs = resolveProjectAbsPath(projectRoot, interactionThumbnailRelPath(id));
      void window.electronAPI.fsReadImage(abs).then((res) => {
        if (cancelled) return;
        setThumbnailDataUrl(res.dataUrl ?? null);
      });
    };
    fetchThumbnail();
    const unsub = window.electronAPI.onInteractionChanged?.((data) => {
      if (normalizeRoot(data.projectRoot || "") !== normalizeRoot(projectRoot)) return;
      if (data.id !== id) return;
      fetchThumbnail();
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [projectRoot, id, hasThumbnail]);

  const open = useCallback(() => {
    openInteractionPanel(id, title);
  }, [id, title]);

  if (loading) {
    return (
      <div className="my-2 flex h-14 w-full max-w-full items-center gap-2 rounded-lg border border-border bg-muted px-3 text-[length:var(--font-size-11)] text-muted-foreground">
        {t("interaction.card.loading")}
      </div>
    );
  }

  if (error || !spec) {
    return (
      <div className="my-2 rounded-lg border border-border bg-muted px-3 py-2 text-[length:var(--font-size-12)] text-muted-foreground">
        {t("interaction.card.unavailable", { id })}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      className="my-2 flex w-full max-w-full items-stretch gap-2 rounded-lg border border-border bg-muted p-2 text-left transition-colors hover:bg-accent"
    >
      <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-background text-primary">
        {thumbnailDataUrl ? (
          <img
            src={thumbnailDataUrl}
            alt={title}
            className="size-9 shrink-0 rounded-md object-cover"
          />
        ) : (
          <SparklesIcon className="size-4" aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <div className="truncate text-[length:var(--font-chat-message)] font-medium text-foreground">
          {title}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="rounded bg-background px-1.5 py-0.5 text-[length:var(--font-size-10)] font-medium text-muted-foreground">
            {kindDisplayLabel(kind)}
          </span>
          <ComputeBadge compute={compute} />
          <span className="font-mono text-[length:var(--font-size-10)] text-muted-foreground">
            {id}
          </span>
        </div>
      </div>
      <Hint label={t("interaction.card.openPanel")}>
        <span className="self-center pr-1 text-[length:var(--font-size-11)] text-muted-foreground">
          {t("interaction.card.open")}
        </span>
      </Hint>
    </button>
  );
}

export function ChatInteractionFence({ raw }: { raw: string }) {
  const { t } = useTranslation();
  const parsed = parseInteractionFenceContent(raw);
  if (!parsed) {
    return (
      <span className="my-2 block text-[length:var(--font-size-12)] text-muted-foreground">
        {t("interaction.card.invalidFence")}
      </span>
    );
  }
  return <ChatInteractionBlock id={parsed.id} titleOverride={parsed.title} />;
}
