import type { RefObject } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { useLayoutStore } from "@/stores/layout-store";
import { cn } from "@/lib/utils";
import { Hint } from "@/components/ui/hint";
import { Kbd } from "@/components/ui/kbd";
import { PanelLeft, SearchIcon } from "lucide-react";
import { toggleLeftSidebarPanel } from "@/lib/workspace/left-sidebar-panel";
import { shortcutChordLabel } from "@/lib/shortcuts";

interface SidebarToolbarProps {
  leftSidebarRef?: RefObject<PanelImperativeHandle | null>;
}

export function SidebarToolbar({ leftSidebarRef }: SidebarToolbarProps) {
  const sidebarExpanded = useLayoutStore((s) => s.sidebarExpanded);
  const setCommandPaletteOpen = useLayoutStore((s) => s.setCommandPaletteOpen);
  const commandChord = shortcutChordLabel("shell.commandPalette");

  return (
    <div className="drag-region flex h-[var(--height-titlebar)] shrink-0 items-center gap-1 px-2">
      <Hint shortcutId="shell.toggleLeftSidebar">
        <button
          type="button"
          className={cn(
            "flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
            sidebarExpanded && "bg-muted text-foreground",
          )}
          onClick={() => toggleLeftSidebarPanel(leftSidebarRef ?? { current: null })}
        >
          <PanelLeft className="size-3.5" />
        </button>
      </Hint>

      <Hint shortcutId="shell.commandPalette">
        <button
          type="button"
          className="flex items-center gap-1.5 rounded px-1.5 py-1 text-[length:var(--font-toolbar-label)] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          onClick={() => setCommandPaletteOpen(true)}
        >
          <SearchIcon className="size-3.5" />
          {commandChord ? (
            <Kbd className="text-[length:var(--font-kbd)] h-4 min-w-4 px-0.5 bg-transparent">{commandChord}</Kbd>
          ) : null}
        </button>
      </Hint>
    </div>
  );
}
