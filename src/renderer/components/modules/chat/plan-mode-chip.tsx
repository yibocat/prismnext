import { useTranslation } from "react-i18next";
import { ListTodoIcon } from "lucide-react";
import { useChatStore } from "@/stores/chat-store";
import { ComposerStatusChip } from "./composer-status-chip";

/** Plan session badge next to composer + — uses shared ComposerStatusChip. */
export function PlanModeChip({ className }: { className?: string }) {
  const { t } = useTranslation();
  const sessionAgent = useChatStore((s) => {
    const tab = s.tabs.find((x) => x.id === s.activeTabId);
    return tab?.sessionAgent ?? "build";
  });
  const requestSetSessionAgent = useChatStore((s) => s.requestSetSessionAgent);

  if (sessionAgent !== "plan") return null;

  return (
    <ComposerStatusChip
      className={className}
      label={t("chat.planWorkflow.chipLabel")}
      hint={t("chat.planWorkflow.chipHint")}
      icon={<ListTodoIcon className="size-3 shrink-0 opacity-80" />}
      dismissAriaLabel={t("chat.planWorkflow.exitPlan")}
      onDismiss={() => requestSetSessionAgent("build")}
    />
  );
}
