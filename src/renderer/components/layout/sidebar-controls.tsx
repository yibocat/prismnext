import type { RefObject } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { useTranslation } from "react-i18next";
import { useLayoutStore } from "@/stores/layout-store";
import { useChatStore } from "@/stores/chat-store";
import { cn } from "@/lib/utils";
import { Hint } from "@/components/ui/hint";
import { PanelLeft, SearchIcon, PlusIcon } from "lucide-react";
import { toggleLeftSidebarPanel } from "@/lib/workspace/left-sidebar-panel";

interface SidebarControlsProps {
  leftSidebarRef: RefObject<PanelImperativeHandle | null>;
  showMacSpacer?: boolean;
  showNewAgent?: boolean;
  className?: string;
}

export function SidebarControls({ leftSidebarRef, showMacSpacer, showNewAgent = true, className }: SidebarControlsProps) {
  const { t } = useTranslation();
  const sidebarExpanded = useLayoutStore((s) => s.sidebarExpanded);
  const setCommandPaletteOpen = useLayoutStore((s) => s.setCommandPaletteOpen);
  const newSession = useChatStore((s) => s.newSession);

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {showMacSpacer && <div className="w-[68px]" />}

      <Hint shortcutId="shell.toggleLeftSidebar">
        <button
          type="button"
          className={cn(
            "flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
            sidebarExpanded && "bg-muted text-foreground",
          )}
          onClick={() => toggleLeftSidebarPanel(leftSidebarRef)}
        >
          <PanelLeft className="size-3.5" />
        </button>
      </Hint>

      <Hint shortcutId="shell.commandPalette">
        <button
          type="button"
          className="flex items-center justify-center size-6 rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          onClick={() => setCommandPaletteOpen(true)}
        >
          <SearchIcon className="size-3.5" />
        </button>
      </Hint>

      {showNewAgent && (
        <Hint label={t("shell.newAgent")} shortcutId="product.newChat">
          <button
            type="button"
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            onClick={() => newSession()}
          >
            <PlusIcon className="size-3.5" />
          </button>
        </Hint>
      )}
    </div>
  );
}
