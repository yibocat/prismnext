import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ListTodoIcon, XIcon } from "lucide-react";
import { useChatStore } from "@/stores/chat-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PLAN_SUGGEST_TIMEOUT_MS } from "../../../../shared/plan-suggest";

export function PlanSuggestBar({ className }: { className?: string }) {
  const { t } = useTranslation();
  const visible = useChatStore((s) => {
    const tab = s.tabs.find((x) => x.id === s.activeTabId);
    return !!tab?.planSuggestVisible && tab.sessionAgent === "build";
  });
  const suggestReason = useChatStore((s) => {
    const tab = s.tabs.find((x) => x.id === s.activeTabId);
    return tab?.planSuggestReason?.trim() || "";
  });
  const deadlineAt = useChatStore((s) => {
    const tab = s.tabs.find((x) => x.id === s.activeTabId);
    return tab?.planSuggestDeadlineAt ?? null;
  });
  const acceptPlanSuggest = useChatStore((s) => s.acceptPlanSuggest);
  const dismissPlanSuggest = useChatStore((s) => s.dismissPlanSuggest);
  const timeoutPlanSuggest = useChatStore((s) => s.timeoutPlanSuggest);

  const [remainingMs, setRemainingMs] = useState(PLAN_SUGGEST_TIMEOUT_MS);

  useEffect(() => {
    if (!visible || !deadlineAt) {
      setRemainingMs(PLAN_SUGGEST_TIMEOUT_MS);
      return;
    }
    const tick = () => {
      const left = Math.max(0, deadlineAt - Date.now());
      setRemainingMs(left);
      if (left <= 0) {
        timeoutPlanSuggest();
      }
    };
    tick();
    const id = window.setInterval(tick, 100);
    return () => clearInterval(id);
  }, [visible, deadlineAt, timeoutPlanSuggest]);

  if (!visible) return null;

  const progress = Math.min(1, Math.max(0, remainingMs / PLAN_SUGGEST_TIMEOUT_MS));
  const secondsLeft = Math.ceil(remainingMs / 1000);

  return (
    <div
      className={cn(
        "mb-2 overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
    >
      <div className="flex items-start gap-2 px-3 py-2">
        <ListTodoIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-[length:var(--font-chat-meta)] font-medium text-foreground">
            {t("chat.planWorkflow.suggestTitle")}
          </p>
          <p className="mt-0.5 text-[length:var(--font-chat-meta)] text-muted-foreground">
            {suggestReason || t("chat.planWorkflow.suggestBody")}
          </p>
          <p className="mt-0.5 text-[length:var(--font-size-11)] text-muted-foreground/80">
            {t("chat.planWorkflow.suggestCountdown", { seconds: secondsLeft })}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Button type="button" size="xs" onClick={() => acceptPlanSuggest()}>
              {t("chat.planWorkflow.enterPlan")}
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => dismissPlanSuggest()}
            >
              {t("chat.planWorkflow.dismiss")}
            </Button>
          </div>
        </div>
        <button
          type="button"
          aria-label={t("chat.planWorkflow.dismiss")}
          className="rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => dismissPlanSuggest()}
        >
          <XIcon className="size-3.5" />
        </button>
      </div>
      <div className="h-0.5 w-full bg-muted">
        <div
          className="h-full bg-primary/70 transition-[width] duration-100 ease-linear"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}
