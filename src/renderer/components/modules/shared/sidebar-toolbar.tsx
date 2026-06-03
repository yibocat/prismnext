import { useState, type RefObject } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { useLayoutStore } from "@/stores/layout-store";
import { SIDEBAR_LEFT_DEFAULT, SIDEBAR_OVERLAY_THRESHOLD } from "@/styles/constants";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/kbd";
import { CommandPalette } from "@/components/modules/shared";
import { PanelLeft, SearchIcon } from "lucide-react";

interface SidebarToolbarProps {
  leftSidebarRef?: RefObject<PanelImperativeHandle | null>;
}

export function SidebarToolbar({ leftSidebarRef }: SidebarToolbarProps) {
  const sidebarExpanded = useLayoutStore((s) => s.sidebarExpanded);
  const [commandOpen, setCommandOpen] = useState(false);

  return (
    <>
      <div className="drag-region flex h-[var(--height-titlebar)] shrink-0 items-center gap-1 px-2">
        <button
          type="button"
          className={cn(
            "flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
            sidebarExpanded && "bg-muted text-foreground",
          )}
          title={sidebarExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
          onClick={() => {
            const st = useLayoutStore.getState();
            if (st.leftSidebarOverlay) {
              st.setLeftSidebarOverlay(false);
              return;
            }
            const p = leftSidebarRef?.current;
            if (!p) return;
            if (p.isCollapsed()) {
              if (window.innerWidth < SIDEBAR_OVERLAY_THRESHOLD) {
                st.setLeftSidebarOverlay(true);
              } else {
                p.resize(st.sidebarWidth || SIDEBAR_LEFT_DEFAULT);
                if (p.isCollapsed()) st.setLeftSidebarOverlay(true);
              }
            } else {
              p.collapse();
            }
          }}
        >
          <PanelLeft className="size-3.5" />
        </button>

        <button
          type="button"
          className="flex items-center gap-1.5 rounded px-1.5 py-1 text-[length:var(--font-toolbar-label)] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          title="Command palette"
          onClick={() => setCommandOpen(true)}
        >
          <SearchIcon className="size-3.5" />
          <Kbd className="text-[length:var(--font-kbd)] h-4 min-w-4 px-0.5 bg-transparent">⌘K</Kbd>
        </button>
      </div>
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </>
  );
}
