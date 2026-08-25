import { useTranslation } from "react-i18next";
import { CheckIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { useChatStore } from "@/stores/chat-store";
import {
  draftPlanPathBelongsToSession,
  isResearchPlanDraftPath,
} from "../../../../shared/research/plan";
import { CHAT_CHROME_BUTTON_TEXT } from "./worktree-selector";
import { cn } from "@/lib/utils";

/**
 * Dedicated research-plan mode toolbar — Approve & Build / Deny for a pending draft
 * (composer confirm strip may be suppressed after soft-restore).
 */
export function PlanDraftToolbar({ filePath }: { filePath?: string | null }) {
  const { t } = useTranslation();
  const ownerTabId = useChatStore((s) => {
    if (!filePath || !isResearchPlanDraftPath(filePath)) return null;
    const byPath = s.tabs.find(
      (tab) =>
        tab.sessionId
        && draftPlanPathBelongsToSession(filePath, tab.sessionId)
        && tab.planDraftFileReady,
    );
    if (byPath) return byPath.id;
    // Legacy current-draft.md — prefer active chat tab when it owns a ready draft.
    const active = s.tabs.find((tab) => tab.id === s.activeTabId);
    if (active?.planDraftFileReady && active.sessionAgent === "plan") {
      return active.id;
    }
    return (
      s.tabs.find((tab) => tab.planDraftFileReady && tab.sessionAgent === "plan")?.id
      ?? null
    );
  });
  const approveAndExecutePlan = useChatStore((s) => s.approveAndExecutePlan);
  const exitPlanDiscardAndBuild = useChatStore((s) => s.exitPlanDiscardAndBuild);

  if (!filePath || !isResearchPlanDraftPath(filePath) || !ownerTabId) return null;

  return (
    <div className="ml-0.5 flex shrink-0 items-center gap-1 border-l border-border pl-1.5">
      <Hint label={t("chat.planWorkflow.rejectPlan")}>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className={cn(CHAT_CHROME_BUTTON_TEXT, "h-6 gap-1 px-2 text-muted-foreground")}
          onClick={() => void exitPlanDiscardAndBuild(ownerTabId)}
        >
          <XIcon className="size-3" />
          <span>{t("chat.planWorkflow.rejectPlan")}</span>
        </Button>
      </Hint>
      <Hint label={t("chat.planWorkflow.approveExecute")}>
        <Button
          type="button"
          size="xs"
          className={cn(CHAT_CHROME_BUTTON_TEXT, "h-6 gap-1 px-2")}
          onClick={() => void approveAndExecutePlan(ownerTabId)}
        >
          <CheckIcon className="size-3" />
          <span>{t("chat.planWorkflow.approveExecute")}</span>
        </Button>
      </Hint>
    </div>
  );
}
