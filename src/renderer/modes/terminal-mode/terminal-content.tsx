import { useMemo } from "react";
import type { RightTab } from "@/lib/workspace/mode-registry";
import { TabContext, type TabContextValue } from "@/lib/workspace/tab-context";
import { TerminalView } from "./terminal-view";
import { AiTerminalView } from "./ai-terminal-view";

export function TerminalContent({ tab, isActive }: { tab: RightTab; isActive: boolean }) {
  const ctx: TabContextValue = useMemo(
    () => ({ tab, isActive }),
    [tab, isActive],
  );
  const isAi = tab.terminalSource === "ai";

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <TabContext.Provider value={ctx}>
        {isAi ? (
          <AiTerminalView tabId={tab.id} />
        ) : (
          <TerminalView tabId={tab.id} />
        )}
      </TabContext.Provider>
    </div>
  );
}
