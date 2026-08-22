/**
 * ChatInteractionBlock — panel entry with inline peek for ```interaction fences.
 * Typography matches chat-artifact-pdf peek header (11/12, not chat-message ladder).
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useDocumentStore } from "@/stores/document-store";
import { kindDisplayLabel } from "../../../shared/interaction/spec";
import type { InteractionSpec } from "../../../shared/interaction/spec";
import { InteractionChatThumbnail } from "@/lib/interaction/interaction-chat-thumbnail";
import { openInteractionPanel } from "@/lib/interaction/open-interaction-panel";
import { parseInteractionFenceContent } from "./chat-interaction";
import { useInteractionFenceClaim } from "@/lib/interaction/interaction-fence-dedupe";
import {
  CHAT_ARTIFACT_THUMB_SHELL_CLASS,
} from "@/lib/markdown/chat-artifact";

const PEEK_CARD_SHELL = cn(CHAT_ARTIFACT_THUMB_SHELL_CLASS, "text-left");

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

  const open = useCallback(() => {
    openInteractionPanel(id, title);
  }, [id, title]);

  if (loading) {
    return (
      <div
        className={cn(
          PEEK_CARD_SHELL,
          "px-2 py-1.5 text-[length:var(--font-size-11)] text-muted-foreground",
        )}
      >
        {t("interaction.card.loading")}
      </div>
    );
  }

  if (error || !spec || !projectRoot) {
    return (
      <div
        className={cn(
          PEEK_CARD_SHELL,
          "px-2 py-1.5 text-[length:var(--font-size-11)] text-muted-foreground",
        )}
      >
        {t("interaction.card.unavailable", { id })}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      aria-label={t("interaction.card.openPanel")}
      className={cn(PEEK_CARD_SHELL, "cursor-pointer transition-opacity hover:opacity-90")}
    >
      <div className="flex items-center gap-2 px-2 py-1.5">
        <span className="shrink-0 text-[length:var(--font-size-11)] font-medium text-muted-foreground">
          {kindDisplayLabel(spec.kind)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[length:var(--font-size-12)] font-medium text-foreground">
            {title}
          </div>
          <div className="truncate font-mono text-[length:var(--font-size-11)] text-muted-foreground">
            {spec.id}
          </div>
        </div>
      </div>
      <InteractionChatThumbnail spec={spec} projectRoot={projectRoot} />
    </button>
  );
}

export function ChatInteractionFence({ raw }: { raw: string }) {
  const { t } = useTranslation();
  const parsed = parseInteractionFenceContent(raw);
  const claimed = useInteractionFenceClaim(parsed?.id ?? "");
  if (!parsed) {
    return (
      <span className="my-2 block text-[length:var(--font-size-12)] text-muted-foreground">
        {t("interaction.card.invalidFence")}
      </span>
    );
  }
  if (!claimed) {
    return null;
  }
  return <ChatInteractionBlock id={parsed.id} titleOverride={parsed.title} />;
}
