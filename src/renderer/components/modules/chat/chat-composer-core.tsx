import {
  ArrowUpIcon,
  SquareIcon,
  XIcon,
  PlusIcon,
  FileIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AppMenu,
  AppMenuContent,
  AppMenuItem,
  AppMenuTrigger,
} from "@/components/ui/app-menu";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import { ChatImagePreviewDialog } from "@/lib/markdown/chat-image-preview";
import { ComposerToolbar } from "./agent-settings/composer-toolbar";
import { ModelThoughtSelect } from "./agent-settings/model-thought-select";
import { PermissionGatePanel, usePermissionGateOpen } from "./permission-gate-panel";
import { InlineComposerEditor } from "./inline-composer";
import { PlanChrome } from "./plan-chrome";
import { PlanSuggestBar } from "./plan-suggest-bar";
import { PlanModeChip } from "./plan-mode-chip";
import { useChatComposer } from "@/hooks/use-chat-composer";
import { useChatStore } from "@/stores/chat-store";
import type { ComposerAttachment } from "@/lib/chat/composer-attach-file";
import { COMPOSER_TOOLBAR_ICON_BUTTON } from "./worktree-selector";

export type ChatComposerVariant = "panel" | "capsule-compact" | "capsule-expanded";

interface ChatComposerCoreProps {
  variant?: ChatComposerVariant;
  className?: string;
  capsulePlaceholder?: string;
  hideToolbar?: boolean;
  onLayoutExpand?: () => void;
}

function ComposerAttachmentStrip({
  attachments,
  onRemove,
}: {
  attachments: ComposerAttachment[];
  onRemove: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);

  if (attachments.length === 0) return null;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-0">
        {attachments.map((att) => (
          <span
            key={att.id}
            className="group relative inline-flex max-w-[10rem] items-center gap-1.5 rounded-md border border-border bg-muted/60 px-1.5 py-1"
          >
            {att.kind === "image" && att.previewUrl ? (
              <button
                type="button"
                aria-label={t("chat.composer.previewAttachment", { name: att.name })}
                onClick={() => setPreview({ url: att.previewUrl!, name: att.name })}
                className="shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <img
                  src={att.previewUrl}
                  alt={att.name}
                  className="size-8 rounded object-cover transition-opacity hover:opacity-90"
                />
              </button>
            ) : (
              <span className="flex size-8 shrink-0 items-center justify-center rounded bg-muted">
                <FileIcon className="size-3.5 text-muted-foreground" />
              </span>
            )}
            <span className="min-w-0 truncate font-mono text-[length:var(--font-chat-meta)] text-muted-foreground">
              {att.name}
            </span>
            <button
              type="button"
              aria-label={t("chat.composer.removeAttachment", { name: att.name })}
              onClick={() => onRemove(att.id)}
              className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground"
            >
              <XIcon className="size-3" />
            </button>
          </span>
        ))}
      </div>
      <ChatImagePreviewDialog
        open={preview != null}
        onOpenChange={(open) => !open && setPreview(null)}
        url={preview?.url ?? null}
        name={preview?.name ?? t("chat.composer.imagePreview")}
      />
    </>
  );
}

export function ChatComposerCore({
  variant = "panel",
  className,
  capsulePlaceholder,
  hideToolbar = false,
  onLayoutExpand,
}: ChatComposerCoreProps) {
  const { t } = useTranslation();
  const permissionGateOpen = usePermissionGateOpen();
  const composer = useChatComposer();
  const sessionAgent = useChatStore((s) => {
    const tab = s.tabs.find((x) => x.id === s.activeTabId);
    return tab?.sessionAgent ?? "build";
  });

  const isCapsule = variant === "capsule-compact" || variant === "capsule-expanded";
  const isCompact = variant === "capsule-compact";
  const placeholder =
    sessionAgent === "plan"
      ? t("chat.planWorkflow.placeholder")
      : (capsulePlaceholder ?? t("chat.composer.placeholder"));

  const compactRowRef = useRef<HTMLDivElement>(null);
  const [useModelIcon, setUseModelIcon] = useState(false);
  const useModelIconRef = useRef(useModelIcon);
  useModelIconRef.current = useModelIcon;

  useEffect(() => {
    if (!isCompact) {
      setUseModelIcon(false);
      return;
    }
    const el = compactRowRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (!useModelIconRef.current && w < 420) setUseModelIcon(true);
      else if (useModelIconRef.current && w > 480) setUseModelIcon(false);
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();
    return () => ro.disconnect();
  }, [isCompact]);

  const addMenu = (
    <AppMenu>
      <Hint label={t("chat.composer.addContext")}>
        <AppMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              COMPOSER_TOOLBAR_ICON_BUTTON,
              isCompact && "rounded-full bg-muted-foreground/20 hover:bg-muted-foreground/30 hover:text-foreground",
            )}
          >
            <PlusIcon className="size-3" />
          </button>
        </AppMenuTrigger>
      </Hint>
      <AppMenuContent align="start" className="min-w-[7.5rem]">
        <AppMenuItem
          onClick={() => {
            void composer.handleAddFile().then(() => onLayoutExpand?.());
          }}
        >
          {t("chat.composer.addFile")}
        </AppMenuItem>
        <AppMenuItem
          onClick={() => {
            void composer.handleAddImage().then(() => onLayoutExpand?.());
          }}
        >
          {t("chat.composer.addImage")}
        </AppMenuItem>
      </AppMenuContent>
    </AppMenu>
  );

  const sendControls = composer.isStreaming ? (
    <Hint label={t("chat.composer.stop")}>
      <button
        type="button"
        onClick={composer.cancelExecution}
        aria-label={t("chat.composer.stop")}
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
      >
        <SquareIcon className="size-3 fill-current" />
      </button>
    </Hint>
  ) : (
    <button
      type="button"
      onClick={composer.handleSend}
      disabled={!composer.canSend}
      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30"
    >
      <ArrowUpIcon className="size-3.5" />
    </button>
  );

  const editor = (
    <InlineComposerEditor
      ref={composer.editorRef}
      parts={composer.draftParts}
      onChange={composer.setDraftParts}
      experts={composer.experts}
      files={composer.mentionableFiles}
      searchCommands={composer.searchCommands}
      slashSkills={composer.slashSkills}
      slashMcps={composer.slashMcps}
      onEnter={composer.handleSend}
      placeholder={placeholder}
      density={isCompact ? "compact" : "default"}
      escapeBlurs={!isCapsule}
      onLayoutExpand={onLayoutExpand}
      onExternalFiles={(paths) => {
        void composer.addAttachmentsFromPaths(paths).then(() => onLayoutExpand?.());
      }}
    />
  );

  const attachmentStrip = (
    <ComposerAttachmentStrip
      attachments={composer.pendingAttachments}
      onRemove={composer.removeAttachment}
    />
  );

  if (composer.isArchived) {
    return (
      <div className={cn("relative mx-auto w-full min-w-0 max-w-3xl", className)}>
        <div className="px-4 py-3 text-center text-[length:var(--font-chat-meta)] text-muted-foreground">
          {t("chat.composer.archivedReadonly")}
        </div>
      </div>
    );
  }

  if (isCapsule) {
    return (
      <div
        className={cn(
          "relative mx-auto w-full min-w-0 max-w-3xl",
          isCompact ? "h-full" : className,
        )}
      >
        <PermissionGatePanel />
        {/* PlanChrome lives on AiBar outside the morph shell — compact h-12 would clip it. */}

        <div
          className={cn(
            "flex w-full flex-col overflow-hidden transition-colors",
            isCompact
              ? "h-full flex-row items-center gap-1.5 border-0 bg-transparent shadow-none"
              : "border-0 bg-transparent shadow-none rounded-none",
          )}
        >
          {!isCompact && attachmentStrip}
          {!isCompact && composer.pinnedContexts.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3 pb-0">
              {composer.pinnedContexts.map((ctx, i) => (
                <span
                  key={`${ctx.label}-${i}`}
                  className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-mono text-[length:var(--font-chat-meta)] text-muted-foreground"
                >
                  {ctx.label}
                  <button
                    type="button"
                    aria-label={t("chat.composer.removeContext")}
                    onClick={() =>
                      composer.setPinnedContexts((prev) => prev.filter((_, idx) => idx !== i))
                    }
                    className="ml-0.5 rounded-sm p-0.5 transition-colors hover:bg-muted-foreground/20"
                  >
                    <XIcon className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div
            ref={isCompact ? compactRowRef : undefined}
            className={cn(
              isCompact
                ? "flex w-full min-w-0 items-center gap-1.5 overflow-hidden"
                : "contents",
            )}
          >
            {isCompact && addMenu}
            {isCompact && <PlanModeChip />}
            <div className={cn(isCompact && "flex-1 min-w-0 overflow-hidden self-center")}>
              {editor}
            </div>
            {isCompact && (
              <>
                <ModelThoughtSelect presentation={useModelIcon ? "icon" : "capsule"} />
                {sendControls}
              </>
            )}
          </div>

          {!isCompact && !hideToolbar && (
            <ComposerToolbar
              addMenu={addMenu}
              sendControls={sendControls}
              modelBesideSend
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative mx-auto w-full min-w-0 max-w-3xl",
        variant === "panel" ? "px-3 py-1.5 overflow-hidden" : className,
      )}
    >
      <div className="flex w-full flex-col">
        <PermissionGatePanel />
        <PlanSuggestBar />
        <PlanChrome />

        <div
          className={cn(
            "flex w-full flex-col overflow-hidden border border-border bg-card",
            "shadow-[0_0_2px_rgba(0,0,0,0.03)] transition-colors focus-within:border-ring",
            permissionGateOpen ? "rounded-b-lg rounded-t-none" : isCapsule ? "rounded-2xl" : "rounded-lg",
          )}
        >
          {attachmentStrip}
          {composer.pinnedContexts.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3 pb-0">
              {composer.pinnedContexts.map((ctx, i) => (
                <span
                  key={`${ctx.label}-${i}`}
                  className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-mono text-[length:var(--font-chat-meta)] text-muted-foreground"
                >
                  {ctx.label}
                  <button
                    type="button"
                    aria-label={t("chat.composer.removeContext")}
                    onClick={() =>
                      composer.setPinnedContexts((prev) => prev.filter((_, idx) => idx !== i))
                    }
                    className="ml-0.5 rounded-sm p-0.5 transition-colors hover:bg-muted-foreground/20"
                  >
                    <XIcon className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {editor}

          {!hideToolbar && (
            <ComposerToolbar addMenu={addMenu} sendControls={sendControls} />
          )}
        </div>
      </div>
    </div>
  );
}
