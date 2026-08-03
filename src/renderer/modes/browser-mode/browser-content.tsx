import { useMemo, lazy } from "react";
import type { RightTab } from "@/lib/workspace/mode-registry";
import { TabContext, type TabContextValue } from "@/lib/workspace/tab-context";
import { useLayoutStore } from "@/stores/layout-store";
import { cn } from "@/lib/utils";

const BrowserView = lazy(() => import("./browser-view").then((m) => ({ default: m.BrowserView })));

export function BrowserContent({ tab, isActive }: { tab: RightTab; isActive: boolean }) {
  const editorMaximized = useLayoutStore((s) => s.editorMaximized);
  const ctx: TabContextValue = useMemo(
    () => ({ tab, isActive }),
    [tab, isActive],
  );
  return (
    <div
      className={cn(
        "flex flex-col flex-1 min-h-0",
        editorMaximized && "pb-[var(--aibar-reserve-h)]",
      )}
    >
      <TabContext.Provider value={ctx}>
        <BrowserView />
      </TabContext.Provider>
    </div>
  );
}
