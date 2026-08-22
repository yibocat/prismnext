import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { CheckIcon, ChevronRightIcon, FileTextIcon, XIcon } from "lucide-react";
import { useChatStore } from "@/stores/chat-store";
import { cn } from "@/lib/utils";
import { isResearchPlanDraftPath } from "../../../../shared/research/plan";
import {
  TOOL_INLINE_LABEL_CLASS,
  TOOL_INLINE_ROW_CLASS,
} from "./tools/shared";

type PlanArtifactCardProps = {
  /** Fallback path from the write/edit tool when store path is empty. */
  pathFallback?: string | null;
  className?: string;
};

/**
 * Created Plan — compact inline row (opens Plan tab). Discarded = muted one-liner.
 */
export function PlanArtifactCard({ pathFallback, className }: PlanArtifactCardProps) {
  const { t } = useTranslation();
  const openPlanFileInEditor = useChatStore((s) => s.openPlanFileInEditor);
  const refreshPlanDraftFromDisk = useChatStore((s) => s.refreshPlanDraftFromDisk);
  const artifact = useChatStore((s) => {
    const tab = s.tabs.find((x) => x.id === s.activeTabId);
    return tab?.planArtifactCard ?? null;
  });

  const discarded = !!artifact?.discarded;
  const title = artifact?.title?.trim() || null;
  const path = (!discarded && (artifact?.path?.trim() || pathFallback?.trim())) || "";
  const displayName = title || path.split("/").pop() || path;

  useEffect(() => {
    if (!path || discarded || !isResearchPlanDraftPath(path)) return;
    void refreshPlanDraftFromDisk();
  }, [path, discarded, refreshPlanDraftFromDisk]);

  if (discarded) {
    return (
      <div
        className={cn(
          TOOL_INLINE_ROW_CLASS,
          "py-1 text-[length:var(--font-chat-message)] cursor-default",
          className,
        )}
      >
        <XIcon className="size-3.5 shrink-0 text-muted-foreground/60" />
        <span className="shrink-0 text-muted-foreground/55">plan</span>
        <FileTextIcon className="size-3.5 shrink-0 opacity-60" />
        <span className={cn(TOOL_INLINE_LABEL_CLASS, "text-muted-foreground/70")}>
          {t("chat.planWorkflow.createdPlanDiscarded")}
          {title ? ` · ${title}` : ""}
        </span>
      </div>
    );
  }

  if (!path) return null;

  return (
    <button
      type="button"
      className={cn(
        TOOL_INLINE_ROW_CLASS,
        "w-full max-w-full py-1 text-left text-[length:var(--font-chat-message)] cursor-pointer",
        className,
      )}
      onClick={() => void openPlanFileInEditor(path)}
    >
      <CheckIcon className="size-3.5 shrink-0 text-success" />
      <span className="shrink-0 text-muted-foreground/55">plan</span>
      <FileTextIcon className="size-3.5 shrink-0 opacity-70" />
      <span className={cn(TOOL_INLINE_LABEL_CLASS)}>
        {t("chat.planWorkflow.createdPlanInline")}
        {displayName ? ` · ${displayName}` : ""}
      </span>
      <ChevronRightIcon className="ml-auto size-3.5 shrink-0 text-muted-foreground/60" />
    </button>
  );
}
