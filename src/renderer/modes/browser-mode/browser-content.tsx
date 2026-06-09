import { useMemo, lazy } from "react";
import type { RightTab } from "@/lib/mode-registry";
import { TabContext, type TabContextValue } from "@/lib/tab-context";

const BrowserView = lazy(() => import("./browser-view").then((m) => ({ default: m.BrowserView })));

export function BrowserContent({ tab, isActive }: { tab: RightTab; isActive: boolean }) {
  const ctx: TabContextValue = useMemo(
    () => ({ tab, isActive }),
    [tab, isActive],
  );
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <TabContext.Provider value={ctx}>
        <BrowserView />
      </TabContext.Provider>
    </div>
  );
}
