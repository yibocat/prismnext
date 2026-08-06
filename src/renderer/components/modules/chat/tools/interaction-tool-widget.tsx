import { memo, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ContentBlock } from "@/stores/chat-store";
import { BoxesIcon, ExternalLinkIcon } from "lucide-react";
import { ToolCard, Field, TOOL_INLINE_LABEL_CLASS } from "./shared";
import { unwrapToolResultPayload } from "@/lib/chat/unwrap-tool-result";
import { openInteractionPanel } from "@/lib/interaction/open-interaction-panel";
import { kindDisplayLabel, type InteractionSpec } from "../../../../../shared/interaction-spec";
import { InteractionChatThumbnail } from "@/lib/interaction/interaction-chat-thumbnail";
import { useInteractionFenceClaim } from "@/lib/interaction/interaction-fence-dedupe";
import { useDocumentStore } from "@/stores/document-store";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";

const LABELS: Record<string, string> = {
  "interaction-list": "List interactions",
  "interaction-read": "Read interaction",
  "interaction-write": "Write interaction",
  "interaction-open": "Open interaction",
};

const PEEK_SHELL =
  "my-1 w-full max-w-full overflow-hidden rounded-lg border border-border/50 bg-muted/20 text-left";

function specFromPayload(data: Record<string, unknown>): {
  id: string;
  title?: string;
  kind?: string;
  revision?: number;
} | null {
  const spec = data.spec as Record<string, unknown> | undefined;
  const id =
    (typeof spec?.id === "string" && spec.id.trim()) ||
    (typeof data.id === "string" && data.id.trim()) ||
    "";
  if (!id) return null;
  return {
    id,
    title:
      typeof spec?.title === "string"
        ? spec.title.trim()
        : typeof data.title === "string"
          ? data.title.trim()
          : undefined,
    kind: typeof spec?.kind === "string" ? spec.kind.trim() : undefined,
    revision:
      typeof spec?.revision === "number" && Number.isFinite(spec.revision)
        ? spec.revision
        : undefined,
  };
}

function InteractionSummary({
  toolName,
  data,
}: {
  toolName: string;
  data: Record<string, unknown>;
}) {
  if (data.ok === false) {
    const err = typeof data.error === "string" ? data.error : "failed";
    return <Field label="Error" value={err} />;
  }

  if (toolName === "interaction-list") {
    const count = typeof data.count === "number" ? data.count : 0;
    const items = Array.isArray(data.items) ? data.items : [];
    return (
      <>
        <Field label="Count" value={String(count)} />
        {items.length > 0 ? (
          <ul className="mt-1 space-y-0.5 text-[length:var(--font-code)] text-muted-foreground">
            {items.slice(0, 8).map((item, i) => {
              if (!item || typeof item !== "object") return null;
              const row = item as Record<string, unknown>;
              const id = typeof row.id === "string" ? row.id : "?";
              const kind = typeof row.kind === "string" ? row.kind : "";
              return (
                <li key={`${id}-${i}`} className="truncate">
                  {id}
                  {kind ? ` · ${kind}` : ""}
                </li>
              );
            })}
          </ul>
        ) : null}
      </>
    );
  }

  const spec = specFromPayload(data);
  if (!spec) return null;

  return (
    <>
      <Field label="ID" value={spec.id} />
      {spec.title ? <Field label="Title" value={spec.title} /> : null}
      {spec.kind ? (
        <Field label="Kind" value={`${kindDisplayLabel(spec.kind)} (${spec.kind})`} />
      ) : null}
      {typeof spec.revision === "number" ? (
        <Field label="Revision" value={String(spec.revision)} />
      ) : null}
      {typeof data.relativePath === "string" ? (
        <Field label="Path" value={data.relativePath} />
      ) : null}
      {data.created === true ? <Field label="Status" value="Created" /> : null}
    </>
  );
}

function InteractionToolPeek({
  id,
  title,
}: {
  id: string;
  title: string;
}) {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const [spec, setSpec] = useState<InteractionSpec | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectRoot) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void window.electronAPI.interactionGet(projectRoot, id).then((res) => {
      if (cancelled) return;
      setSpec(res.spec ?? null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectRoot, id]);

  const open = useCallback(() => {
    openInteractionPanel(id, title);
  }, [id, title]);

  const claimed = useInteractionFenceClaim(id);
  if (!claimed) return null;

  return (
    <button
      type="button"
      onClick={open}
      aria-label={t("interaction.card.openPanel")}
      className={cn(PEEK_SHELL, "cursor-pointer transition-opacity hover:opacity-90")}
    >
      <div className="flex items-center gap-2 px-2 py-1.5 min-w-0">
        {spec ? (
          <span className="shrink-0 text-[length:var(--font-size-11)] font-medium text-muted-foreground">
            {kindDisplayLabel(spec.kind)}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[length:var(--font-size-12)] font-medium text-foreground">
            {title}
          </div>
          <div className="truncate font-mono text-[length:var(--font-size-11)] text-muted-foreground">
            {id}
          </div>
        </div>
      </div>
      {spec && projectRoot && !loading ? (
        <InteractionChatThumbnail spec={spec} projectRoot={projectRoot} />
      ) : loading ? (
        <div className="border-t border-border/40 px-2 py-3 text-[length:var(--font-size-11)] text-muted-foreground">
          {t("interaction.card.loading")}
        </div>
      ) : null}
    </button>
  );
}

export const InteractionToolWidget = memo(function InteractionToolWidget({
  toolUse,
  toolResult,
  toolName,
  nestedInActivity,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
  toolName: string;
  nestedInActivity?: boolean;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const isLoading = !toolResult;
  const isError = !!toolResult?.is_error;

  const data = unwrapToolResultPayload(toolResult?.content ?? toolUse.content);
  const spec = data && data.ok !== false ? specFromPayload(data) : null;

  const openPanel = useCallback(() => {
    if (!spec?.id) return;
    openInteractionPanel(spec.id, spec.title);
  }, [spec?.id, spec?.title]);

  const label = (() => {
    if (spec?.id) {
      return <span className={cn(TOOL_INLINE_LABEL_CLASS)}>{spec.id}</span>;
    }
    return LABELS[toolName] ?? toolName;
  })();

  const meta =
    toolName === "interaction-list" && data && typeof data.count === "number"
      ? (
        <span className="shrink-0 truncate text-[length:var(--font-chat-meta)] text-muted-foreground/70">
          {data.count} object(s)
        </span>
      )
      : undefined;

  const showPeek =
    !nestedInActivity
    && !isLoading
    && !isError
    && !!spec?.id
    && toolName !== "interaction-list";

  return (
    <>
      <ToolCard
        toolName={toolName}
        icon={<BoxesIcon className="size-3.5 shrink-0 opacity-70" />}
        label={label}
        meta={meta}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
        isLoading={isLoading}
        isError={isError}
        hasContent={!!data}
        headerEnd={
          spec?.id && !isLoading && !isError ? (
            <Hint label={t("interaction.card.openPanel")}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openPanel();
                }}
                className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/70 hover:bg-accent hover:text-foreground"
                aria-label={t("interaction.card.openPanel")}
              >
                <ExternalLinkIcon className="size-3" />
              </button>
            </Hint>
          ) : null
        }
      >
        {() => (data ? <InteractionSummary toolName={toolName} data={data} /> : null)}
      </ToolCard>
      {showPeek ? (
        <InteractionToolPeek id={spec!.id} title={spec!.title ?? spec!.id} />
      ) : null}
    </>
  );
});
