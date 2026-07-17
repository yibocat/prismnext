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
import { Hint } from "@/components/ui/hint";

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
    <div className="flex h-[var(--height-right-area-subtoolbar)] min-w-0 shrink-0 items-center gap-0.5 overflow-hidden border-t border-border px-2 select-none text-[length:var(--font-size-12)] text-muted-foreground">
      {/* Breadcrumb can shrink/truncate; do not wrap mode toolbars (they rely on flex-1). */}
      {!hideBreadcrumb && hasBreadcrumb && (
        <Breadcrumb className="min-w-0 shrink overflow-hidden">
          <BreadcrumbList className="min-w-0 flex-nowrap overflow-hidden">
            {projectName && !isExternal && (
              <>
                <BreadcrumbItem className="min-w-0 shrink">
                  <Hint label="Go to project root">
                    <button
                      type="button"
                      className="inline-flex min-w-0 max-w-[7rem] items-center hover:text-foreground transition-colors cursor-pointer"
                      onClick={() => setFileTreeNavigatePath("")}
                    >
                      <FolderIcon className="size-3 shrink-0" />
                      <span className="ml-1 truncate">{projectName}</span>
                    </button>
                  </Hint>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="shrink-0" />
              </>
            )}
            {collapsed.map((item, i) => {
              const isLast = i === collapsed.length - 1;
              if (item.isEllipsis) {
                return (
                  <BreadcrumbItem key="ellipsis" className="shrink-0">
                    <span className="px-0.5 text-muted-foreground">…</span>
                    <BreadcrumbSeparator />
                  </BreadcrumbItem>
                );
              }
              const seg = item.label;
              const segIndex = item.index;
              if (isLast) {
                return (
                  <BreadcrumbItem key={`${segIndex}-${seg}`} className="min-w-0 shrink">
                    <BreadcrumbPage className="block truncate" title={seg}>
                      {seg}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                );
              }
              if (isExternal) {
                return (
                  <BreadcrumbItem key={`${segIndex}-${seg}`} className="min-w-0 shrink">
                    <span className="block max-w-[6rem] truncate text-muted-foreground" title={seg}>
                      {seg}
                    </span>
                    <BreadcrumbSeparator className="shrink-0" />
                  </BreadcrumbItem>
                );
              }
              const cumPath = segments.slice(0, segIndex + 1).join("/");
              return (
                <BreadcrumbItem key={`${segIndex}-${seg}`} className="min-w-0 shrink">
                  <Hint label={`Go to ${cumPath}`}>
                    <button
                      type="button"
                      className="block max-w-[6rem] truncate hover:text-foreground transition-colors cursor-pointer"
                      title={seg}
                      onClick={() => navigateToPath(cumPath)}
                    >
                      {seg}
                    </button>
                  </Hint>
                  <BreadcrumbSeparator className="shrink-0" />
                </BreadcrumbItem>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      )}

      {!hideSpacer && !hideBreadcrumb && <div className="min-w-0 flex-1" />}

      {/* Mode toolbars must be direct flex children so their flex-1 spacers work. */}
      {children}

      {children && <div className="mx-1 h-4 w-px shrink-0 bg-border" />}

      {!hideSidebarToggle ? (
        <Hint label={rightSidebarOpen ? "Hide mode sidebar" : "Show mode sidebar"}>
          <button
            type="button"
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
              rightSidebarOpen && "bg-muted text-foreground",
            )}
            onClick={() => toggle()}
          >
            <ListTreeIcon className="size-3.5" />
          </button>
        </Hint>
      ) : null}
    </div>
  );
});
