import { useMemo, lazy } from "react";
import type { RightTab } from "@/lib/workspace/mode-registry";
import { TabContext, type TabContextValue } from "@/lib/workspace/tab-context";

const BrowserView = lazy(() => import("./browser-view").then((m) => ({ default: m.BrowserView })));

export function BrowserContent({ tab, isActive }: { tab: RightTab; isActive: boolean }) {
  const ctx: TabContextValue = useMemo(
    () => ({ tab, isActive }),
    [tab, isActive],
  );
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-background">
      <TabContext.Provider value={ctx}>
        <BrowserView />
      </TabContext.Provider>
    </div>
  );
}
