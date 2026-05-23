// ─── RightSidebar ───
// Shell: container + resize handle. Delegates content to scenario components.

import { useLayoutStore } from "@/stores/layout-store";
import { SIDEBAR_RIGHT_MIN, SIDEBAR_RIGHT_MAX } from "@/styles/constants";
import { SidebarProvider, Sidebar } from "@/components/ui/sidebar";
import { FilesSidebar } from "./right-sidebar/files-sidebar";
import { GitSidebar } from "./right-sidebar/git-sidebar";
import { BrowserSidebar } from "./right-sidebar/browser-sidebar";

const SIDEBAR_BY_MODE: Record<string, React.ComponentType> = {
  files: FilesSidebar,
  git: GitSidebar,
  browser: BrowserSidebar,
};

export { FilesSidebar } from "./right-sidebar/files-sidebar";
export { GitSidebar } from "./right-sidebar/git-sidebar";
export { BrowserSidebar } from "./right-sidebar/browser-sidebar";

export function RightSidebar() {
  const rightToolbarTab = useLayoutStore((s) => s.rightToolbarTab);
  const rightSidebarWidth = useLayoutStore((s) => s.rightSidebarWidth);
  const setRightSidebarWidth = useLayoutStore((s) => s.setRightSidebarWidth);

  const Content = SIDEBAR_BY_MODE[rightToolbarTab] ?? FilesSidebar;

  return (
    <SidebarProvider defaultOpen className="contents">
      <Sidebar
        className="relative shrink-0 border-l border-border bg-card"
        style={{ width: rightSidebarWidth, "--sidebar-width": `${rightSidebarWidth}px` } as React.CSSProperties}
        side="right"
      >
        <div
          className="absolute left-0 top-0 h-full w-[var(--layout-resize-handle)] cursor-col-resize hover:bg-primary/30 z-10 transition-colors"
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = rightSidebarWidth;
            const onMove = (ev: MouseEvent) => {
              setRightSidebarWidth(
                Math.min(SIDEBAR_RIGHT_MAX, Math.max(SIDEBAR_RIGHT_MIN, startWidth + startX - ev.clientX)),
              );
            };
            const onUp = () => {
              document.removeEventListener("mousemove", onMove);
              document.removeEventListener("mouseup", onUp);
            };
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
          }}
        />
        <Content />
      </Sidebar>
    </SidebarProvider>
  );
}
