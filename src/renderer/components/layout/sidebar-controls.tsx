import { useState, type RefObject } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { useTranslation } from "react-i18next";
import { useLayoutStore } from "@/stores/layout-store";
import { useChatStore } from "@/stores/chat-store";
import { SIDEBAR_LEFT_DEFAULT, SIDEBAR_LEFT_MAX, SIDEBAR_OVERLAY_THRESHOLD } from "@/styles/constants";
import { cn } from "@/lib/utils";
import { CommandPalette } from "@/components/modules/shared";
import { PanelLeft, SearchIcon, PlusIcon } from "lucide-react";

interface SidebarControlsProps {
  leftSidebarRef: RefObject<PanelImperativeHandle | null>;
  showMacSpacer?: boolean;
  showNewAgent?: boolean;
  className?: string;
}

export function SidebarControls({ leftSidebarRef, showMacSpacer, showNewAgent = true, className }: SidebarControlsProps) {
  const { t } = useTranslation();
  const sidebarExpanded = useLayoutStore((s) => s.sidebarExpanded);
  const [commandOpen, setCommandOpen] = useState(false);
  const newSession = useChatStore((s) => s.newSession);

  return (
    <>
      <div className={cn("flex items-center gap-1", className)}>
        {showMacSpacer && <div className="w-[68px]" />}

        <button
          type="button"
          className={cn(
            "flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
            sidebarExpanded && "bg-muted text-foreground",
          )}
          title={sidebarExpanded ? t("shell.collapseSidebar") : t("shell.expandSidebar")}
          onClick={() => {
            const st = useLayoutStore.getState();
            if (st.leftSidebarOverlay) {
              st.setLeftSidebarOverlay(false);
              return;
            }
            const p = leftSidebarRef.current;
            if (!p) return;
            if (p.isCollapsed()) {
              if (window.innerWidth < SIDEBAR_OVERLAY_THRESHOLD) {
                st.setLeftSidebarOverlay(true);
              } else {
                st.setLeftSidebarOverlay(false);
                st.setSidebarExpanded(true);
                st.setSidebarFullyCollapsed(false);
                p.expand();
                const width = Math.min(st.sidebarWidth || SIDEBAR_LEFT_DEFAULT, SIDEBAR_LEFT_MAX);
                p.resize(width);
              }
            } else {
              st.setSidebarExpanded(false);
              st.setSidebarFullyCollapsed(true);
              p.collapse();
            }
          }}
        >
          <PanelLeft className="size-3.5" />
        </button>

        <button
          type="button"
          className="flex items-center justify-center size-6 rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          title={t("shell.commandPalette")}
          onClick={() => setCommandOpen(true)}
        >
          <SearchIcon className="size-3.5" />
        </button>

        {showNewAgent && (
          <button
            type="button"
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            title={t("shell.newAgent")}
            onClick={() => newSession()}
          >
            <PlusIcon className="size-3.5" />
          </button>
        )}
      </div>
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </>
  );
}
