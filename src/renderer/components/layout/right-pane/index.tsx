import { useRightPanelStore } from "@/stores/right-panel-store";
import { PaneContent } from "./content";
import { LayersIcon } from "lucide-react";

export function RightPane() {
  const tabs = useRightPanelStore((s) => s.tabs);
  const activeTabId = useRightPanelStore((s) => s.activeTabId);
  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className="flex h-full flex-col min-w-0">
      {tabs.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <LayersIcon className="size-10 opacity-30" />
          <p className="text-[length:var(--font-placeholder)]">Open a file to get started</p>
        </div>
      ) : (
        <PaneContent activeTab={activeTab} />
      )}
    </div>
  );
}
