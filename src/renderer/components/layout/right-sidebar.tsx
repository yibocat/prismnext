import { useLayoutStore } from "@/stores/layout-store";
import { SidebarProvider, Sidebar } from "@/components/ui/sidebar";
import { DashboardSidebar } from "./right-sidebar/dashboard-sidebar";
import { modeRegistry } from "@/lib/mode-registry";

export { FilesSidebar } from "@/modes/files-mode/files-sidebar";
export { GitSidebar } from "@/modes/git-mode/git-sidebar";
export { BrowserSidebar } from "@/modes/browser-mode/browser-sidebar";

export function RightSidebar({ fullMode }: { fullMode?: boolean }) {
  const focusedMode = useLayoutStore((s) => s.focusedMode);
  const rightSidebarWidth = useLayoutStore((s) => s.rightSidebarWidth);

  const def = focusedMode !== "dashboard" ? modeRegistry.get(focusedMode) : undefined;
  const Content = def?.Sidebar ?? DashboardSidebar;

  return (
    <SidebarProvider
      defaultOpen
      className="contents"
      style={{ "--sidebar-width": fullMode ? "100%" : `${rightSidebarWidth}px` } as React.CSSProperties}
    >
      <Sidebar collapsible="none" className="relative shrink-0" side="right">
        <Content />
      </Sidebar>
    </SidebarProvider>
  );
}
