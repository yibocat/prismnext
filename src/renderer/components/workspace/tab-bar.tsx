import { useLayoutStore } from "@/stores/layout-store";
import { XIcon, FileTextIcon, BookmarkIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function TabBar() {
  const editorTabs = useLayoutStore((s) => s.editorTabs);
  const activeEditorTab = useLayoutStore((s) => s.activeEditorTab);
  const setActiveEditorTab = useLayoutStore((s) => s.setActiveEditorTab);
  const closeEditorTab = useLayoutStore((s) => s.closeEditorTab);

  if (editorTabs.length === 0) return null;

  return (
    <div className="flex h-8 shrink-0 items-center border-b border-border bg-card px-1 select-none">
      {editorTabs.map((tab) => (
        <div
          key={tab.id}
          className={cn(
            "group flex h-full items-center gap-1.5 border-r border-border px-3 text-[12px] cursor-default transition-colors",
            tab.id === activeEditorTab
              ? "bg-background text-foreground"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
          )}
          onClick={() => setActiveEditorTab(tab.id)}
        >
          {tab.name.endsWith(".bib") ? (
            <BookmarkIcon className="size-3.5 shrink-0 opacity-60" />
          ) : (
            <FileTextIcon className="size-3.5 shrink-0 opacity-60" />
          )}
          <span className="max-w-[140px] truncate">{tab.name}</span>
          <button
            type="button"
            className="ml-0.5 flex size-4 items-center justify-center rounded-sm opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              closeEditorTab(tab.id);
            }}
          >
            <XIcon className="size-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
