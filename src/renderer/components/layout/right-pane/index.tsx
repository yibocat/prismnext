import { useRightPanelStore } from "@/stores/right-panel-store";
import { PaneContent } from "./content";
import { LayersIcon } from "lucide-react";

/**
 * CSS style applied to inactive tab panels so they stay mounted (preserving all
 * internal viewer state — scroll, page number, cursor, undo history, etc.) but
 * are invisible and non-interactive.
 *
 * Using `position: absolute` + `visibility: hidden` (rather than `display: none`)
 * ensures ResizeObserver and virtualized scrollers (CodeMirror, Lector) always
 * measure real dimensions, so they recover instantly when the tab becomes active.
 */
const INACTIVE_TAB_STYLE: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  visibility: "hidden",
  pointerEvents: "none",
};

export function RightPane() {
  const tabs = useRightPanelStore((s) => s.tabs);
  const activeTabId = useRightPanelStore((s) => s.activeTabId);

  return (
    <div className="flex h-full flex-col min-w-0 relative">
      {tabs.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <LayersIcon className="size-10 opacity-30" />
          <p className="text-[length:var(--font-placeholder)]">Open a file to get started</p>
        </div>
      ) : (
        tabs.map((tab) => (
          <div
            key={tab.id}
            className="flex flex-col flex-1 min-h-0"
            style={tab.id === activeTabId ? undefined : INACTIVE_TAB_STYLE}
          >
            <PaneContent activeTab={tab} isActive={tab.id === activeTabId} />
          </div>
        ))
      )}
    </div>
  );
}
