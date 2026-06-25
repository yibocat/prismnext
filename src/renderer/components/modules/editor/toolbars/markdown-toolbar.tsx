import { useRightPanelStore } from "@/stores/right-panel-store";
import { useLayoutStore } from "@/stores/layout-store";
import { FileCode2Icon, EyeIcon, AlignCenterIcon, RefreshCwIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const MARKDOWN_TOOLBAR_BTN =
  "flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0";

/** Text actions in markdown subtoolbars — same 24px height as {@link MARKDOWN_TOOLBAR_BTN}. */
export const MARKDOWN_TOOLBAR_TEXT_BTN =
  "flex h-6 shrink-0 items-center rounded px-2 text-[length:var(--font-size-12)] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40";

export const MARKDOWN_TOOLBAR_PRIMARY_BTN =
  "flex h-6 shrink-0 items-center rounded px-2 text-[length:var(--font-size-12)] font-medium bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-40";

/** Matches {@link TabToolbar} chrome — used when markdown controls sit outside TabToolbar (e.g. settings). */
export const MARKDOWN_SUBTOOLBAR_CLASS =
  "flex h-[var(--height-right-area-subtoolbar)] shrink-0 items-center px-2 gap-0.5 border-b border-border select-none text-[length:var(--font-size-12)] text-muted-foreground";

export function MarkdownToolbarControls({
  viewMode,
  onViewModeChange,
  showViewToggle = true,
  onRefresh,
  refreshing = false,
}: {
  viewMode: "source" | "preview";
  onViewModeChange?: (mode: "source" | "preview") => void;
  showViewToggle?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const mdWidthLimited = useLayoutStore((s) => s.mdWidthLimited);
  const setMdWidthLimited = useLayoutStore((s) => s.setMdWidthLimited);
  const isPreview = viewMode === "preview";

  return (
    <>
      <button
        type="button"
        className={cn(MARKDOWN_TOOLBAR_BTN, mdWidthLimited && "text-foreground")}
        title={mdWidthLimited ? "Full width" : "Limit width"}
        onClick={() => setMdWidthLimited(!mdWidthLimited)}
      >
        <AlignCenterIcon className="size-3.5" />
      </button>
      {showViewToggle && onViewModeChange ? (
        <button
          type="button"
          className={MARKDOWN_TOOLBAR_BTN}
          title={isPreview ? "Source view" : "Rendered view"}
          onClick={() => onViewModeChange(isPreview ? "source" : "preview")}
        >
          {isPreview ? (
            <FileCode2Icon className="size-3.5" />
          ) : (
            <EyeIcon className="size-3.5" />
          )}
        </button>
      ) : null}
      {onRefresh ? (
        <button
          type="button"
          className={MARKDOWN_TOOLBAR_BTN}
          title="Refresh"
          disabled={refreshing}
          onClick={onRefresh}
        >
          <RefreshCwIcon className={cn("size-3.5", refreshing && "animate-spin")} />
        </button>
      ) : null}
    </>
  );
}

export function MarkdownToolbar() {
  const tabs = useRightPanelStore((s) => s.tabs);
  const activeTabId = useRightPanelStore((s) => s.activeTabId);
  const setTabViewMode = useRightPanelStore((s) => s.setTabViewMode);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const viewMode = (activeTab?.viewMode ?? "preview") as "source" | "preview";

  return (
    <MarkdownToolbarControls
      viewMode={viewMode}
      onViewModeChange={(mode) => {
        if (activeTabId) setTabViewMode(activeTabId, mode);
      }}
    />
  );
}
