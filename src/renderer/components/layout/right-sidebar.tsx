import { useLayoutStore } from "@/stores/layout-store";
import { SidebarProvider, Sidebar } from "@/components/ui/sidebar";
import { modeRegistry } from "@/lib/workspace/mode-registry";

export { FilesSidebar } from "@/modes/files-mode/files-sidebar";
export { GitSidebar } from "@/modes/git-mode/git-sidebar";
export { BrowserSidebar } from "@/modes/browser-mode/browser-sidebar";

export function RightSidebar(_props: { fullMode?: boolean }) {
  const focusedMode = useLayoutStore((s) => s.focusedMode);

  const def = focusedMode !== "dashboard" ? modeRegistry.get(focusedMode) : undefined;
  if (!def?.Sidebar) return null;

  const Content = def.Sidebar;

  return (
    <SidebarProvider defaultOpen className="contents">
      <Sidebar
        collapsible="none"
        className="relative shrink-0 border-l-0 !w-full"
        side="right"
        data-surface="sidebar"
      >
        <Content />
      </Sidebar>
    </SidebarProvider>
  );
}
