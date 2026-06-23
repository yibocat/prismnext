import { useRightPanelStore } from "@/stores/right-panel-store";
import { useLayoutStore } from "@/stores/layout-store";
import { FileCode2Icon, EyeIcon, AlignCenterIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function MarkdownToolbar() {
  const tabs = useRightPanelStore((s) => s.tabs);
  const activeTabId = useRightPanelStore((s) => s.activeTabId);
  const setTabViewMode = useRightPanelStore((s) => s.setTabViewMode);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const viewMode = activeTab?.viewMode ?? "preview";

  const mdWidthLimited = useLayoutStore((s) => s.mdWidthLimited);
  const setMdWidthLimited = useLayoutStore((s) => s.setMdWidthLimited);

  const isPreview = viewMode === "preview";

  return (
    <>
      <button
        type="button"
        className={cn(
          "flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0",
          mdWidthLimited && "text-foreground",
        )}
        title={mdWidthLimited ? "Full width" : "Limit width"}
        onClick={() => setMdWidthLimited(!mdWidthLimited)}
      >
        <AlignCenterIcon className="size-3.5" />
      </button>
      <button
        type="button"
        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
        title={isPreview ? "Source view" : "Rendered view"}
        onClick={() => {
          if (activeTabId) setTabViewMode(activeTabId, isPreview ? "source" : "preview");
        }}
      >
        {isPreview ? (
          <FileCode2Icon className="size-3.5" />
        ) : (
          <EyeIcon className="size-3.5" />
        )}
      </button>
    </>
  );
}
