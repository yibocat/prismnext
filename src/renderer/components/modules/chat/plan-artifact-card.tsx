import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRightIcon, FileTextIcon } from "lucide-react";
import { useChatStore } from "@/stores/chat-store";
import { cn } from "@/lib/utils";
import { isResearchPlanDraftPath } from "../../../../shared/research-plan";

type PlanArtifactCardProps = {
  /** Fallback path from the write/edit tool when store path is empty. */
  pathFallback?: string | null;
  className?: string;
};

/**
 * Created Plan card — click opens the plan in RightArea (Plan tab).
 * Discarded (Deny) is non-interactive and has no chevron.
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

  // Agent may invent a drafts/* filename — claim/migrate so Approve chrome appears.
  useEffect(() => {
    if (!path || discarded || !isResearchPlanDraftPath(path)) return;
    void refreshPlanDraftFromDisk();
  }, [path, discarded, refreshPlanDraftFromDisk]);

  if (discarded) {
    return (
      <div className={cn("my-1.5", className)}>
        <div className="flex w-full items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
          <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-[length:var(--font-chat-meta)] text-muted-foreground">
              {t("chat.planWorkflow.createdPlanDiscarded")}
            </p>
            {title ? (
              <p className="truncate text-[length:var(--font-chat-meta)] font-medium text-muted-foreground">
                {title}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (!path) return null;

  return (
    <div className={cn("my-1.5", className)}>
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-left",
          "transition-colors hover:bg-muted/50",
        )}
        onClick={() => void openPlanFileInEditor(path)}
      >
        <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-[length:var(--font-chat-meta)] text-muted-foreground">
            {t("chat.planWorkflow.createdPlan")}
          </p>
          <p className="truncate text-[length:var(--font-chat-meta)] font-medium text-foreground">
            {title || path.split("/").pop() || path}
          </p>
        </div>
        <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
      </button>
    </div>
  );
}
