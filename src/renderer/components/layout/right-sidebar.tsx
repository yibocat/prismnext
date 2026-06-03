import { useLayoutStore } from "@/stores/layout-store";
import { SidebarProvider, Sidebar } from "@/components/ui/sidebar";
import { FilesSidebar } from "./right-sidebar/files-sidebar";
import { GitSidebar } from "./right-sidebar/git-sidebar";
import { BrowserSidebar } from "./right-sidebar/browser-sidebar";
import { TerminalSidebar } from "./right-sidebar/terminal-sidebar";
import { TexworkspaceSidebar } from "@/components/modules/texworkspace-mode";
import { DashboardSidebar } from "./right-sidebar/dashboard-sidebar";

const SIDEBAR_BY_MODE: Record<string, React.ComponentType> = {
  dashboard: DashboardSidebar,
  files: FilesSidebar,
  git: GitSidebar,
  browser: BrowserSidebar,
  terminal: TerminalSidebar,
  texworkspace: TexworkspaceSidebar,
};

export { FilesSidebar } from "./right-sidebar/files-sidebar";
export { GitSidebar } from "./right-sidebar/git-sidebar";
export { BrowserSidebar } from "./right-sidebar/browser-sidebar";

export function RightSidebar() {
  const rightToolbarTab = useLayoutStore((s) => s.rightToolbarTab);
  const rightSidebarWidth = useLayoutStore((s) => s.rightSidebarWidth);

  const Content = SIDEBAR_BY_MODE[rightToolbarTab] ?? FilesSidebar;

  return (
    <SidebarProvider
      defaultOpen
      className="contents"
      style={{ "--sidebar-width": `${rightSidebarWidth}px` } as React.CSSProperties}
    >
      <Sidebar collapsible="none" className="relative shrink-0 bg-card" side="right">
        <Content />
      </Sidebar>
    </SidebarProvider>
  );
}
