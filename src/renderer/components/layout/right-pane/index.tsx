import type { RightTab } from "@/lib/workspace/mode-registry";
import { PaneContent } from "./content";

interface RightPaneProps {
  tabs: RightTab[];
  activeTabId: string | null;
}

/**
 * Only the active tab is mounted. Inactive tabs used to stay mounted with
 * `position:absolute` + `visibility:hidden` so editors kept scroll state, but
 * that left stale compositor layers visible through transparent regions
 * (e.g. LogViewer empty state). Remount on tab switch is acceptable here.
 */
export function RightPane({ tabs, activeTabId }: RightPaneProps) {
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  return (
    <div className="flex h-full flex-col min-w-0 bg-background">
      {activeTab ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
          <PaneContent activeTab={activeTab} isActive />
        </div>
      ) : tabs.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-[length:var(--font-placeholder)] text-muted-foreground">
            Open a file to get started
          </p>
        </div>
      ) : null}
    </div>
  );
}
