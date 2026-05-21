import { useLayoutStore } from "@/stores/layout-store";
import {
  XIcon,
  FileTextIcon,
  BookmarkIcon,
  MaximizeIcon,
  MinimizeIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function TabBar() {
  const editorTabs = useLayoutStore((s) => s.modeEditorTabs[s.activeMode]);
  const activeEditorTab = useLayoutStore((s) => s.modeActiveEditorTab[s.activeMode]);
  const setActiveEditorTab = useLayoutStore((s) => s.setActiveEditorTab);
  const closeEditorTab = useLayoutStore((s) => s.closeEditorTab);
  const editorMaximized = useLayoutStore((s) => s.editorMaximized);
  const toggleEditorMaximized = useLayoutStore((s) => s.toggleEditorMaximized);

  if (editorTabs.length === 0) return null;

  return (
    <div className="flex h-9 shrink-0 items-center border-b border-border bg-card select-none">
      {/* Tabs */}
      <div className="flex flex-1 items-center gap-0.5 px-1.5 min-w-0 overflow-hidden">
        {editorTabs.map((tab) => (
          <div
            key={tab.id}
            className={cn(
              "group flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] cursor-default transition-colors max-w-[180px]",
              tab.id === activeEditorTab
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            onClick={() => setActiveEditorTab(tab.id)}
          >
            {tab.name.endsWith(".bib") ? (
              <BookmarkIcon className="size-3 shrink-0 opacity-50" />
            ) : (
              <FileTextIcon className="size-3 shrink-0 opacity-50" />
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

      {/* Actions */}
      <div className="flex h-full shrink-0 items-center gap-0.5 border-l border-border bg-card px-1.5">
        <button
          type="button"
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title={editorMaximized ? "Restore" : "Expand editor"}
          onClick={toggleEditorMaximized}
        >
          {editorMaximized ? (
            <MinimizeIcon className="size-3.5" />
          ) : (
            <MaximizeIcon className="size-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
