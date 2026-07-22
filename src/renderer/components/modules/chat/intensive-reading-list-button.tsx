import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { BookOpenIcon, XIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { appPopoverListClass } from "@/components/ui/app-popover";
import { useChatStore } from "@/stores/chat-store";
import { useLiteratureStore } from "@/stores/literature-store";
import { formatPaperMentionLabel } from "../../../../shared/bibkey-utils";
import {
  CAPSULE_TOOLBAR_PILL,
  CHAT_PANEL_TOOLBAR_BUTTON,
} from "./worktree-selector";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";

/**
 * Intensive reading list — shown only when the active tab has papers in
 * intensive reading mode (via @ paper menu). Hidden when the list is empty.
 */
export function IntensiveReadingListButton({
  compact = false,
  variant = "panel",
}: {
  compact?: boolean;
  /** `capsule` = AiBar slot pill; `panel` = chat composer toolbar. */
  variant?: "panel" | "capsule";
}) {
  const { t } = useTranslation();
  const activeTabId = useChatStore((s) => s.activeTabId);
  const intensivePaperIds = useChatStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab?.intensivePaperIds ?? [];
  });
  const removeIntensivePaper = useChatStore((s) => s.removeIntensivePaper);
  const papers = useLiteratureStore((s) => s.papers);

  const items = useMemo(() => {
    return intensivePaperIds
      .map((id) => papers.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p));
  }, [intensivePaperIds, papers]);

  const count = items.length;
  if (count === 0) return null;

  const isCapsule = variant === "capsule";
  const triggerClass = cn(
    isCapsule
      ? cn(
          CAPSULE_TOOLBAR_PILL,
          "bg-card text-emerald-700 dark:text-emerald-400 border-emerald-500/35",
          "hover:bg-accent hover:text-emerald-800 dark:hover:text-emerald-300",
        )
      : cn(
          CHAT_PANEL_TOOLBAR_BUTTON,
          compact && "px-1.5",
          "text-emerald-700 dark:text-emerald-400 hover:bg-accent hover:text-emerald-800 dark:hover:text-emerald-300",
        ),
  );

  return (
    <Popover>
      <Hint label={t("chat.intensive.list")}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t("chat.intensive.listWithCount", { count })}
            className={triggerClass}
          >
            <BookOpenIcon className={cn("shrink-0", isCapsule ? "size-3.5" : "size-3")} />
            <span className="max-w-[5rem] truncate hidden @md:inline">
              {count === 1 ? t("chat.intensive.short") : t("chat.intensive.count", { count })}
            </span>
            <span className="tabular-nums @md:hidden">{count}</span>
          </button>
        </PopoverTrigger>
      </Hint>
      <PopoverContent
        align="start"
        sideOffset={6}
        collisionPadding={12}
        className={cn(appPopoverListClass, "w-72 max-h-80 overflow-y-auto")}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="px-2 py-1.5 text-[length:var(--font-chat-meta)] uppercase tracking-wide text-muted-foreground">
          {t("chat.intensive.heading", { count })}
        </div>
        {items.map((paper) => (
          <div
            key={paper.id}
            className="group flex items-center gap-1.5 px-2 py-1.5 hover:bg-muted/60"
          >
            <BookOpenIcon className="size-3 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-[length:var(--font-chat-meta)] font-medium">
                {formatPaperMentionLabel(paper.bibkey)}
              </div>
              <div className="truncate text-[length:var(--font-chat-meta)] text-muted-foreground">
                {paper.title}
              </div>
            </div>
            <Hint label={t("chat.intensive.removeTitle")}>
              <button
                type="button"
                aria-label={t("chat.intensive.remove")}
                className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-60 hover:bg-muted hover:text-foreground hover:opacity-100"
                onClick={() => removeIntensivePaper(activeTabId, paper.id)}
              >
                <XIcon className="size-3" />
              </button>
            </Hint>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** Whether the active tab has any intensive-reading papers (for conditional slots). */
export function useIntensiveReadingCount(): number {
  return useChatStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab?.intensivePaperIds.length ?? 0;
  });
}
