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
import { openInteractionPanel } from "@/lib/interaction/open-interaction-panel";
import { parseInteractionFenceContent } from "./chat-interaction";

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
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-background text-primary">
        <SparklesIcon className="size-4" aria-hidden />
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
