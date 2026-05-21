import { useCallback } from "react";
import { useLayoutStore } from "@/stores/layout-store";
import { useDocumentStore } from "@/stores/document-store";
import { useCompileStore } from "@/stores/compile-store";
import { resolveCompileTarget } from "@/lib/resolve-tex-root";
import {
  XIcon,
  FileTextIcon,
  BookmarkIcon,
  FileIcon,
  MaximizeIcon,
  MinimizeIcon,
  PlayIcon,
  Loader2Icon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function TabBar() {
  const activeMode = useLayoutStore((s) => s.activeMode);
  const editorTabs = useLayoutStore((s) => s.modeEditorTabs[activeMode]);
  const activeEditorTab = useLayoutStore((s) => s.modeActiveEditorTab[activeMode]);
  const setActiveEditorTab = useLayoutStore((s) => s.setActiveEditorTab);
  const closeEditorTab = useLayoutStore((s) => s.closeEditorTab);
  const editorMaximized = useLayoutStore((s) => s.editorMaximized);
  const toggleEditorMaximized = useLayoutStore((s) => s.toggleEditorMaximized);

  const activeTab = editorTabs.find((t) => t.id === activeEditorTab);
  const isTexFile = activeTab?.type === "file" && activeTab.name.endsWith(".tex");

  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const activeFileId = useDocumentStore((s) => s.activeFileId);
  const files = useDocumentStore((s) => s.files);
  const getContent = useDocumentStore((s) => s.getContent);
  const isCompiling = useCompileStore((s) => s.isCompiling);
  const compile = useCompileStore((s) => s.compile);

  const handleCompile = useCallback(async () => {
    if (!projectRoot || !activeFileId) return;
    const resolved = resolveCompileTarget(activeFileId, files, getContent);
    if (resolved) {
      await compile(projectRoot, resolved.targetPath);
    }
  }, [projectRoot, activeFileId, files, compile, getContent]);

  if (editorTabs.length === 0) return null;

  return (
    <div className="flex h-9 shrink-0 items-center border-b border-border bg-card select-none">
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
            {tab.type === "pdf" ? (
              <FileIcon className="size-3 shrink-0 opacity-50" />
            ) : tab.name.endsWith(".bib") ? (
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

      <div className="flex h-full shrink-0 items-center gap-0.5 border-l border-border bg-card px-1.5">
        {isTexFile && (
          <button
            type="button"
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            onClick={handleCompile}
            disabled={isCompiling}
          >
            {isCompiling ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <PlayIcon className="size-3.5" />
            )}
            Compile
          </button>
        )}
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
