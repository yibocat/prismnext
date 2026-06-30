import { memo, type ReactNode, useCallback } from "react";
import { useLayoutStore } from "@/stores/layout-store";
import { useDocumentStore } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { collapseBreadcrumbSegments } from "@/lib/files/breadcrumb-segments";
import { cn } from "@/lib/utils";
import { ListTreeIcon, FolderIcon } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

interface TabToolbarProps {
  children?: ReactNode;
  onToggleSidebar?: () => void;
  filePath?: string;
  projectName?: string;
  isExternal?: boolean;
  hideSpacer?: boolean;
  hideBreadcrumb?: boolean;
  hideSidebarToggle?: boolean;
}

/** Turn a path into breadcrumb segments */
function pathSegments(filePath: string, isExternal?: boolean): string[] {
  if (isExternal) {
    return filePath.split(/[/\\]/).filter(Boolean);
  }
  return filePath.split("/").filter(Boolean);
}

export const TabToolbar = memo(function TabToolbar({
  children,
  onToggleSidebar,
  filePath,
  projectName,
  isExternal,
  hideSpacer,
  hideBreadcrumb,
  hideSidebarToggle,
}: TabToolbarProps) {
  const rightSidebarOpen = useLayoutStore((s) => s.rightSidebarOpen);
  const toggleRightSidebar = useLayoutStore((s) => s.toggleRightSidebar);
  const setFileTreeNavigatePath = useLayoutStore((s) => s.setFileTreeNavigatePath);
  const toggle = onToggleSidebar ?? toggleRightSidebar;

  const segments = filePath ? pathSegments(filePath, isExternal) : [];
  const hasBreadcrumb = segments.length > 0;
  const collapsed = collapseBreadcrumbSegments(segments);

  const navigateToPath = useCallback(
    (cumPath: string) => {
      if (!isExternal) {
        useLayoutStore.getState().setFileTreeNavigatePath(cumPath);
      }
      const meta = useDocumentStore.getState().fileMetadata.get(cumPath);
      if (meta) {
        useRightPanelStore.getState().openFile(cumPath, cumPath, meta.name, { pin: true });
        useDocumentStore.getState().setActiveFile(cumPath);
      }
    },
    [isExternal],
  );

  return (
    <div className="flex h-[var(--height-right-area-subtoolbar)] shrink-0 items-center px-2 gap-0.5 border-t border-border select-none text-[length:var(--font-size-12)] text-muted-foreground">
      {/* ─── Breadcrumb ─── */}
      {!hideBreadcrumb && hasBreadcrumb && (
        <Breadcrumb className="shrink-0">
          <BreadcrumbList>
            {projectName && !isExternal && (
              <>
                <BreadcrumbItem>
                  <button
                    type="button"
                    className="inline-flex items-center hover:text-foreground transition-colors cursor-pointer"
                    onClick={() => setFileTreeNavigatePath("")}
                    title="Go to project root"
                  >
                    <FolderIcon className="size-3 shrink-0" />
                    <span className="ml-1">{projectName}</span>
                  </button>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
              </>
            )}
            {collapsed.map((item, i) => {
              const isLast = i === collapsed.length - 1;
              if (item.isEllipsis) {
                return (
                  <BreadcrumbItem key="ellipsis">
                    <span className="text-muted-foreground px-0.5">…</span>
                    <BreadcrumbSeparator />
                  </BreadcrumbItem>
                );
              }
              const seg = item.label;
              const segIndex = item.index;
              if (isLast) {
                return (
                  <BreadcrumbItem key={`${segIndex}-${seg}`}>
                    <BreadcrumbPage>{seg}</BreadcrumbPage>
                  </BreadcrumbItem>
                );
              }
              if (isExternal) {
                return (
                  <BreadcrumbItem key={`${segIndex}-${seg}`}>
                    <span className="text-muted-foreground">{seg}</span>
                    <BreadcrumbSeparator />
                  </BreadcrumbItem>
                );
              }
              const cumPath = segments.slice(0, segIndex + 1).join("/");
              return (
                <BreadcrumbItem key={`${segIndex}-${seg}`}>
                  <button
                    type="button"
                    className="hover:text-foreground transition-colors cursor-pointer"
                    onClick={() => navigateToPath(cumPath)}
                    title={`Go to ${cumPath}`}
                  >
                    {seg}
                  </button>
                  <BreadcrumbSeparator />
                </BreadcrumbItem>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      )}

      {!hideSpacer && !hideBreadcrumb && <div className="flex-1 min-w-0" />}

      {/* ─── File-type toolbar ─── */}
      {children}

      {children && <div className="mx-1 h-4 w-px bg-border shrink-0" />}

      {!hideSidebarToggle ? (
        <button
          type="button"
          className={cn(
            "flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0",
            rightSidebarOpen && "bg-muted text-foreground",
          )}
          title="Toggle Right Sidebar"
          onClick={() => toggle()}
        >
          <ListTreeIcon className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
});
