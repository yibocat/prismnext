import {
  ArrowUpIcon,
  SquareIcon,
  XIcon,
  PlusIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  AppMenu,
  AppMenuContent,
  AppMenuItem,
  AppMenuTrigger,
} from "@/components/ui/app-menu";
import { cn } from "@/lib/utils";
import { ComposerToolbar } from "./agent-settings/composer-toolbar";
import { ModelThoughtSelect } from "./agent-settings/model-thought-select";
import { PermissionAskPanel, usePermissionAskOpen } from "./permission-ask-panel";
import { InlineComposerEditor } from "./inline-composer";
import { useChatComposer } from "@/hooks/use-chat-composer";
import { useChatStore } from "@/stores/chat-store";

export type ChatComposerVariant = "panel" | "capsule-compact" | "capsule-expanded";

interface ChatComposerCoreProps {
  variant?: ChatComposerVariant;
  className?: string;
  capsulePlaceholder?: string;
  hideToolbar?: boolean;
  onLayoutExpand?: () => void;
}

export function ChatComposerCore({
  variant = "panel",
  className,
  capsulePlaceholder,
  hideToolbar = false,
  onLayoutExpand,
}: ChatComposerCoreProps) {
  const permissionAskOpen = usePermissionAskOpen();
  const composer = useChatComposer();
  const chatMode = useChatStore(
    (s) => s.tabs.find((t) => t.id === s.activeTabId)?.chatMode ?? "agent",
  );
  const isExpertTeam = chatMode === "expert-team";

  const isCapsule = variant === "capsule-compact" || variant === "capsule-expanded";
  const isCompact = variant === "capsule-compact";
  const placeholder = capsulePlaceholder ?? composer.placeholder;

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
      <AppMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground shrink-0",
            isCompact
              ? "size-7 rounded-full bg-muted-foreground/20 hover:bg-muted-foreground/30"
              : "size-7 rounded-md hover:bg-accent hover:text-accent-foreground",
          )}
          title="Add context"
        >
          <PlusIcon className="size-4" />
        </button>
      </AppMenuTrigger>
      <AppMenuContent align="start" className="min-w-[7.5rem]">
        <AppMenuItem
          onClick={() => {
            void composer.handleAddFile();
          }}
        >
          Add file
        </AppMenuItem>
        <AppMenuItem
          onClick={() => {
            void composer.handleAddImage();
          }}
        >
          Add image
        </AppMenuItem>
      </AppMenuContent>
    </AppMenu>
  );

  const sendControls = composer.isStreaming ? (
    <button
      type="button"
      onClick={composer.cancelExecution}
      className="flex size-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
    >
      <SquareIcon className="size-3 fill-current" />
    </button>
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
      profiles={composer.profiles}
      files={composer.mentionableFiles}
      searchCommands={composer.searchCommands}
      slashSkills={composer.slashSkills}
      slashMcps={composer.slashMcps}
      onEnter={composer.handleSend}
      placeholder={placeholder}
      density={isCompact ? "compact" : "default"}
      onLayoutExpand={onLayoutExpand}
    />
  );

  if (composer.isArchived) {
    return (
      <div className={cn("relative mx-auto w-full min-w-0 max-w-3xl", className)}>
        <div className="px-4 py-3 text-center text-[length:var(--font-chat-meta)] text-muted-foreground">
          This session is archived — read only. Restore it to continue the conversation.
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
        <PermissionAskPanel />

        <div
          className={cn(
            "flex w-full flex-col overflow-hidden border border-border bg-card",
            "shadow-[0_0_2px_rgba(0,0,0,0.03)] transition-colors focus-within:border-ring",
            permissionAskOpen && !isCompact && "rounded-b-lg rounded-t-none",
            isCompact
              ? "h-full flex-row items-center gap-1.5 border-0 bg-transparent shadow-none"
              : "rounded-2xl",
          )}
        >
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
                    aria-label="Remove context"
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
            <div className={cn(isCompact && "flex-1 min-w-0 overflow-hidden self-center")}>
              {editor}
            </div>
            {isCompact && (
              <>
                {!isExpertTeam && (
                  <ModelThoughtSelect presentation={useModelIcon ? "icon" : "capsule"} />
                )}
                {sendControls}
              </>
            )}
          </div>

          {!isCompact && !hideToolbar && (
            <ComposerToolbar addMenu={addMenu} sendControls={sendControls} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative mx-auto w-full min-w-0 max-w-3xl",
        variant === "panel" ? "px-3 pt-1 pb-1 overflow-hidden" : className,
      )}
    >
      <div className="flex w-full flex-col">
        <PermissionAskPanel />

        <div
          className={cn(
            "flex w-full flex-col overflow-hidden border border-border bg-card",
            "shadow-[0_0_2px_rgba(0,0,0,0.03)] transition-colors focus-within:border-ring",
            permissionAskOpen ? "rounded-b-lg rounded-t-none" : isCapsule ? "rounded-2xl" : "rounded-lg",
          )}
        >
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
                    aria-label="Remove context"
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
