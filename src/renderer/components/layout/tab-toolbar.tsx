import { memo, type ReactNode } from "react";
import { useLayoutStore } from "@/stores/layout-store";
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
  hideSpacer?: boolean;
  hideBreadcrumb?: boolean;
}

/** Turn "manuscript/chapter/intro.tex" into ["manuscript", "chapter", "intro.tex"] */
function pathSegments(filePath: string): string[] {
  return filePath.split("/").filter(Boolean);
}

export const TabToolbar = memo(function TabToolbar({ children, onToggleSidebar, filePath, projectName, hideSpacer, hideBreadcrumb }: TabToolbarProps) {
  const rightSidebarOpen = useLayoutStore((s) => s.rightSidebarOpen);
  const toggleRightSidebar = useLayoutStore((s) => s.toggleRightSidebar);
  const setFileTreeNavigatePath = useLayoutStore((s) => s.setFileTreeNavigatePath);
  const toggle = onToggleSidebar ?? toggleRightSidebar;

  const segments = filePath ? pathSegments(filePath) : [];
  const hasBreadcrumb = segments.length > 0;

  return (
    <div className="flex h-[var(--height-right-area-subtoolbar)] shrink-0 items-center px-2 gap-0.5 border-t border-border select-none text-[length:var(--font-size-12)] text-muted-foreground">
      {/* ─── Breadcrumb ─── */}
      {!hideBreadcrumb && hasBreadcrumb && (
        <Breadcrumb className="shrink-0">
          <BreadcrumbList>
            {projectName && (
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
            {segments.map((seg, i) => {
              const isLast = i === segments.length - 1;
              if (isLast) {
                return (
                  <BreadcrumbItem key={`${i}-${seg}`}>
                    <BreadcrumbPage>{seg}</BreadcrumbPage>
                  </BreadcrumbItem>
                );
              }
              const cumPath = segments.slice(0, i + 1).join("/");
              return (
                <BreadcrumbItem key={`${i}-${seg}`}>
                  <button
                    type="button"
                    className="hover:text-foreground transition-colors cursor-pointer"
                    onClick={() => setFileTreeNavigatePath(cumPath)}
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

      {/* ─── Sidebar toggle ─── */}
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
    </div>
  );
});
