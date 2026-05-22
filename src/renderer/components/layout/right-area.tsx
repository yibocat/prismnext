import { useRef, useCallback, useEffect } from "react";
import { useLayoutStore, type RightToolbarTab } from "@/stores/layout-store";
import { useDocumentStore } from "@/stores/document-store";
import { useCompileStore } from "@/stores/compile-store";
import { useRightPanelStore, type RightTabKind } from "@/stores/right-panel-store";
import { resolveCompileTarget } from "@/lib/resolve-tex-root";
import { RightMainArea } from "@/components/layout/right-main-area";
import { RightSidebar } from "@/components/layout/right-sidebar";
import {
  FolderOpenIcon as FilesIcon,
  GitBranchIcon,
  GlobeIcon,
  ListTreeIcon,
  MaximizeIcon,
  MinimizeIcon,
  XIcon,
  PlayIcon,
  Loader2Icon,
} from "lucide-react";
import { RIGHT_AREA_MIN, RIGHT_AREA_MAX } from "@/styles/constants";
import { cn } from "@/lib/utils";

const TOOLBAR_TABS: { id: RightToolbarTab; label: string; icon: React.ReactNode }[] = [
  { id: "files", label: "Files", icon: <FilesIcon className="size-3.5" /> },
  { id: "git", label: "Git", icon: <GitBranchIcon className="size-3.5" /> },
  { id: "browser", label: "Browser", icon: <GlobeIcon className="size-3.5" /> },
];

// ─── Tab bar (inline in toolbar) ───

function TabBar() {
  const tabs = useRightPanelStore((s) => s.tabs);
  const activeTabId = useRightPanelStore((s) => s.activeTabId);
  const setActiveTab = useRightPanelStore((s) => s.setActiveTab);
  const closeTab = useRightPanelStore((s) => s.closeTab);

  if (tabs.length === 0) return null;

  return (
    <>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={cn(
            "group flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-[length:var(--font-toolbar-tab)] cursor-default transition-colors max-w-[140px]",
            tab.id === activeTabId
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
          onClick={() => setActiveTab(tab.id)}
        >
          <span className="truncate">{tab.title}</span>
          <button
            type="button"
            className="ml-0.5 flex size-3.5 items-center justify-center rounded-sm opacity-0 group-hover:opacity-100 hover:bg-muted-foreground/20 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.id);
            }}
          >
            <XIcon className="size-2.5" />
          </button>
        </div>
      ))}
    </>
  );
}

export function RightArea({ maximized }: { maximized?: boolean }) {
  const rightAreaWidth = useLayoutStore((s) => s.rightAreaWidth);
  const setRightAreaWidth = useLayoutStore((s) => s.setRightAreaWidth);
  const rightToolbarTab = useLayoutStore((s) => s.rightToolbarTab);
  const setRightToolbarTab = useLayoutStore((s) => s.setRightToolbarTab);
  const rightSidebarOpen = useLayoutStore((s) => s.rightSidebarOpen);
  const toggleRightSidebar = useLayoutStore((s) => s.toggleRightSidebar);
  const editorMaximized = useLayoutStore((s) => s.editorMaximized);
  const ensureTab = useRightPanelStore((s) => s.ensureTab);
  const openFile = useRightPanelStore((s) => s.openFile);
  const activeTabId = useRightPanelStore((s) => s.activeTabId);
  const tabs = useRightPanelStore((s) => s.tabs);
  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Sync toolbar mode when active tab changes
  useEffect(() => {
    if (!activeTab) return;
    switch (activeTab.kind) {
      case "file":
        setRightToolbarTab("files");
        break;
      case "git-overview":
      case "git-diff":
        setRightToolbarTab("git");
        break;
      case "browser":
        setRightToolbarTab("browser");
        break;
    }
  }, [activeTab?.kind]);
  const toggleEditorMaximized = useLayoutStore((s) => s.toggleEditorMaximized);
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const activeFileId = useDocumentStore((s) => s.activeFileId);
  const files = useDocumentStore((s) => s.files);
  const getContent = useDocumentStore((s) => s.getContent);
  const isCompiling = useCompileStore((s) => s.isCompiling);
  const compile = useCompileStore((s) => s.compile);

  const showSidebar = rightToolbarTab !== "browser" && rightSidebarOpen;

  const isTexFile = activeFileId?.endsWith(".tex");

  const handleCompile = useCallback(async () => {
    if (!projectRoot || !activeFileId) return;
    const resolved = resolveCompileTarget(activeFileId, files, getContent);
    if (resolved) {
      await compile(projectRoot, resolved.targetPath);
    }
  }, [projectRoot, activeFileId, files, compile, getContent]);

  const widthRef = useRef(rightAreaWidth);
  widthRef.current = rightAreaWidth;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = widthRef.current;
      const onMove = (ev: MouseEvent) => {
        const nextWidth = startWidth + startX - ev.clientX;
        setRightAreaWidth(Math.min(RIGHT_AREA_MAX, Math.max(RIGHT_AREA_MIN, nextWidth)));
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [setRightAreaWidth],
  );

  const handleOpenProjectFolder = () => {
    if (projectRoot) {
      window.electronAPI.fsScan(projectRoot);
    }
  };

  return (
    <div
      className="flex min-w-0"
      style={maximized ? { flex: 1 } : { width: rightAreaWidth }}
    >
      {!maximized && (
        <div
          className="shrink-0 w-[var(--layout-resize-handle)] cursor-col-resize hover:bg-primary/30 transition-colors"
          onMouseDown={handleMouseDown}
        />
      )}

      <div className="flex flex-1 flex-col min-w-0 border-l border-border bg-background">
        {/* ── Toolbar ── */}
        <div className="flex h-[var(--height-right-area-toolbar)] shrink-0 items-center border-b border-border px-2 gap-0.5">
          {/* Left: icon-only toolbar tabs */}
          {TOOLBAR_TABS.map((tab) =>
            tab.id === "files" ? (
              <div key={tab.id} className="flex items-center">
                <button
                  type="button"
                  className={cn(
                    "flex size-6 items-center justify-center rounded transition-colors",
                    rightToolbarTab === "files"
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  title={`${tab.label} — open project folder`}
                  onClick={() => {
                    setRightToolbarTab("files");
                    ensureTab("file");
                    handleOpenProjectFolder();
                  }}
                >
                  {tab.icon}
                </button>
              </div>
            ) : (
              <button
                key={tab.id}
                type="button"
                className={cn(
                  "flex size-6 items-center justify-center rounded transition-colors",
                  rightToolbarTab === tab.id
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                title={tab.label}
                onClick={() => {
                  setRightToolbarTab(tab.id);
                  const kind: RightTabKind = tab.id === "git" ? "git-overview" : "browser";
                  ensureTab(kind);
                }}
              >
                {tab.icon}
              </button>
            ),
          )}

          {/* Separator + file tabs */}
          <div className="mx-1 h-4 w-px bg-border/60" />
          <div className="flex flex-1 items-center gap-0.5 min-w-0 overflow-hidden">
            <TabBar />
          </div>

          {/* Variable: compile (if tex) + sidebar toggle (if Files/Git) */}
          {isTexFile && (
            <button
              type="button"
              className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
              title="Compile"
              onClick={handleCompile}
              disabled={isCompiling}
            >
              {isCompiling ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <PlayIcon className="size-3.5" />
              )}
            </button>
          )}

          {rightToolbarTab !== "browser" && (
            <button
              type="button"
              className={cn(
                "flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0",
                rightSidebarOpen && "bg-muted text-foreground",
              )}
              title="Toggle file list"
              onClick={toggleRightSidebar}
            >
              <ListTreeIcon className="size-3.5" />
            </button>
          )}

          {/* Separator: variable | fixed */}
          <div className="mx-1 h-4 w-px bg-border/60" />

          {/* Fixed: + new tab + maximize */}
          <button
            type="button"
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
            title={editorMaximized ? "Restore" : "Maximize editor"}
            onClick={toggleEditorMaximized}
          >
            {editorMaximized ? <MinimizeIcon className="size-3.5" /> : <MaximizeIcon className="size-3.5" />}
          </button>
        </div>

        {/* ── Main Content ── */}
        <div className="flex flex-1 min-h-0">
          <RightMainArea />
          {showSidebar && <RightSidebar />}
        </div>

      </div>
    </div>
  );
}
