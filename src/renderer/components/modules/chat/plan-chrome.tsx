import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckIcon, ListTodoIcon, XIcon } from "lucide-react";
import { useChatStore } from "@/stores/chat-store";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ComposerChromeCard } from "./composer-chrome-card";
import { CHAT_CHROME_BUTTON_TEXT } from "./worktree-selector";

const NARROW_PANEL_PX = 420;

/**
 * Plan confirm chrome above the composer — same visual language as PlanSuggestBar.
 */
export function PlanChrome({ className }: { className?: string }) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);

  const sessionAgent = useChatStore((s) => {
    const tab = s.tabs.find((x) => x.id === s.activeTabId);
    return tab?.sessionAgent ?? "build";
  });
  const planDraftFileReady = useChatStore((s) => {
    const tab = s.tabs.find((x) => x.id === s.activeTabId);
    return !!tab?.planDraftFileReady;
  });
  const planConfirmSuppressed = useChatStore((s) => {
    const tab = s.tabs.find((x) => x.id === s.activeTabId);
    return !!tab?.planConfirmSuppressed;
  });
  const planDraftSummary = useChatStore((s) => {
    const tab = s.tabs.find((x) => x.id === s.activeTabId);
    return tab?.planDraftSummary ?? null;
  });
  const planExitDialogOpen = useChatStore((s) => {
    const tab = s.tabs.find((x) => x.id === s.activeTabId);
    return !!tab?.planExitDialogOpen;
  });
  const approveAndExecutePlan = useChatStore((s) => s.approveAndExecutePlan);
  const exitPlanDiscardAndBuild = useChatStore((s) => s.exitPlanDiscardAndBuild);
  const closePlanExitDialog = useChatStore((s) => s.closePlanExitDialog);
  const refreshPlanDraftFromDisk = useChatStore((s) => s.refreshPlanDraftFromDisk);

  useEffect(() => {
    if (sessionAgent !== "plan") return;
    void refreshPlanDraftFromDisk();
    const id = window.setInterval(() => {
      void refreshPlanDraftFromDisk();
    }, 2500);
    return () => window.clearInterval(id);
  }, [sessionAgent, refreshPlanDraftFromDisk]);

  useEffect(() => {
    const el = panelRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? el.clientWidth;
      setNarrow(w < NARROW_PANEL_PX);
    });
    ro.observe(el);
    setNarrow(el.clientWidth < NARROW_PANEL_PX);
    return () => ro.disconnect();
  }, [planDraftFileReady, planConfirmSuppressed]);

  if (sessionAgent !== "plan") return null;

  // Soft-restored sessions keep Plan chip/permissions but skip composer confirm strip.
  const showPanel = planDraftFileReady && !planConfirmSuppressed;
  const description =
    planDraftSummary?.trim() || t("chat.planWorkflow.approveDrawerBody");

  return (
    <>
      {showPanel ? (
        <ComposerChromeCard
          ref={panelRef}
          className={cn(
            "flex items-start gap-2 px-3 py-2",
            className,
          )}
        >
          <ListTodoIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-[length:var(--font-chat-meta)] font-medium text-foreground">
              {t("chat.planWorkflow.approveDrawerTitle")}
            </p>
            <p className="mt-0.5 line-clamp-2 text-[length:var(--font-chat-meta)] text-muted-foreground">
              {description}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {narrow ? (
                <>
                  <Hint label={t("chat.planWorkflow.rejectPlan")}>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      className="text-muted-foreground"
                      aria-label={t("chat.planWorkflow.rejectPlan")}
                      onClick={() => void exitPlanDiscardAndBuild()}
                    >
                      <XIcon />
                    </Button>
                  </Hint>
                  <Hint label={t("chat.planWorkflow.approveExecute")}>
                    <Button
                      type="button"
                      size="icon-xs"
                      aria-label={t("chat.planWorkflow.approveExecute")}
                      onClick={() => void approveAndExecutePlan()}
                    >
                      <CheckIcon />
                    </Button>
                  </Hint>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    size="xs"
                    className={CHAT_CHROME_BUTTON_TEXT}
                    onClick={() => void approveAndExecutePlan()}
                  >
                    {t("chat.planWorkflow.approveExecute")}
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className={cn(CHAT_CHROME_BUTTON_TEXT, "text-muted-foreground")}
                    onClick={() => void exitPlanDiscardAndBuild()}
                  >
                    {t("chat.planWorkflow.rejectPlan")}
                  </Button>
                </>
              )}
            </div>
          </div>
        </ComposerChromeCard>
      ) : null}

      <Dialog
        open={planExitDialogOpen}
        onOpenChange={(open) => {
          if (!open) closePlanExitDialog();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("chat.planWorkflow.exitDialogTitle")}</DialogTitle>
            <DialogDescription>{t("chat.planWorkflow.exitDialogBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" size="xs" onClick={() => closePlanExitDialog()}>
              {t("chat.planWorkflow.cancel")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="xs"
              onClick={() => void exitPlanDiscardAndBuild()}
            >
              {t("chat.planWorkflow.rejectPlan")}
            </Button>
            <Button
              type="button"
              size="xs"
              disabled={!planDraftFileReady}
              onClick={() => void approveAndExecutePlan()}
            >
              {t("chat.planWorkflow.approveExecute")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
