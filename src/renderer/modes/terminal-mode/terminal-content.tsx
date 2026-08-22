import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { isJobMonitorTab, type RightTab } from "@/lib/workspace/mode-registry";
import { TabContext, type TabContextValue } from "@/lib/workspace/tab-context";
import { useExecutionStore } from "@/stores/execution-store";
import { TerminalView } from "./terminal-view";
import { JobMonitorView } from "./job-monitor-view";

function resolveMonitorExecutionId(tab: RightTab): string {
  if (tab.kind !== "terminal") return "";
  if (tab.linkedExecutionId) return tab.linkedExecutionId;
  if (tab.linkedToolCallId) {
    return useExecutionStore.getState().findByToolCallId(tab.linkedToolCallId) ?? "";
  }
  return "";
}

export function TerminalContent({ tab, isActive }: { tab: RightTab; isActive: boolean }) {
  const { t } = useTranslation();
  const ctx: TabContextValue = useMemo(
    () => ({ tab, isActive }),
    [tab, isActive],
  );
  const isMonitor = isJobMonitorTab(tab);
  const executionId = isMonitor ? resolveMonitorExecutionId(tab) : "";

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <TabContext.Provider value={ctx}>
        {isMonitor && executionId ? (
          <JobMonitorView tabId={tab.id} executionId={executionId} />
        ) : isMonitor ? (
          <div className="flex flex-1 items-center justify-center px-6 text-sm text-muted-foreground">
            {t("modes.terminal.noAttachedJob")}
          </div>
        ) : (
          <TerminalView tabId={tab.id} />
        )}
      </TabContext.Provider>
    </div>
  );
}
