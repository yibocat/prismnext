import type { ReactNode } from "react";
import { useLayoutStore } from "@/stores/layout-store";
import { cn } from "@/lib/utils";
import { ListTreeIcon } from "lucide-react";

interface TabToolbarProps {
  children?: ReactNode;
}

export function TabToolbar({ children }: TabToolbarProps) {
  const rightSidebarOpen = useLayoutStore((s) => s.rightSidebarOpen);
  const toggleRightSidebar = useLayoutStore((s) => s.toggleRightSidebar);

  return (
    <div className="flex h-8 shrink-0 items-center px-2 gap-0.5 border-y border-border select-none">
      {children}
      <div className="flex-1 min-w-0" />
      {children && <div className="mx-1 h-4 w-px bg-border/60 shrink-0" />}
      <button
        type="button"
        className={cn(
          "flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0",
          rightSidebarOpen && "bg-muted text-foreground",
        )}
        title="Toggle Right Sidebar"
        onClick={() => toggleRightSidebar()}
      >
        <ListTreeIcon className="size-3.5" />
      </button>
    </div>
  );
}
