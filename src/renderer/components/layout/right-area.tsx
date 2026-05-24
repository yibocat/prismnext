import { useEffect, useRef, type RefObject } from "react";
import { Group, Panel, Separator, usePanelRef, type PanelImperativeHandle } from "react-resizable-panels";
import { useIsMobile } from "@/hooks/use-mobile";
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
import { SIDEBAR_RIGHT_MIN, SIDEBAR_RIGHT_DEFAULT, RIGHT_AREA_DEFAULT } from "@/styles/constants";
import { cn } from "@/lib/utils";

const TOOLBAR_TABS: { id: RightToolbarTab; label: string; icon: React.ReactNode }[] = [
  { id: "files", label: "Files", icon: <FilesIcon className="size-3.5" /> },
  { id: "git", label: "Git", icon: <GitBranchIcon className="size-3.5" /> },
  { id: "browser", label: "Browser", icon: <GlobeIcon className="size-3.5" /> },
];

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
            "group flex w-[120px] shrink-0 items-center rounded px-1.5 py-1 text-[length:var(--font-toolbar-tab)] cursor-default transition-colors",
            tab.id === activeTabId
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
          onClick={() => setActiveTab(tab.id)}
        >
          <span className="truncate">{tab.title}</span>
          <button
            type="button"
            className="ml-auto flex size-3.5 shrink-0 items-center justify-center rounded-sm opacity-0 group-hover:opacity-100 hover:bg-muted-foreground/20 transition-opacity"
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

interface RightAreaProps {
  centerRef: RefObject<PanelImperativeHandle | null>;
  rightAreaRef: RefObject<PanelImperativeHandle | null>;
}

export function RightArea({ centerRef, rightAreaRef }: RightAreaProps) {
  const isMobile = useIsMobile();
  const rightToolbarTab = useLayoutStore((s) => s.rightToolbarTab);
  const setRightToolbarTab = useLayoutStore((s) => s.setRightToolbarTab);
  const rightSidebarOpen = useLayoutStore((s) => s.rightSidebarOpen);
  const toggleRightSidebar = useLayoutStore((s) => s.toggleRightSidebar);
  const editorMaximized = useLayoutStore((s) => s.editorMaximized);
  const setRightSidebarWidth = useLayoutStore((s) => s.setRightSidebarWidth);
  const prevRightWidth = useRef(RIGHT_AREA_DEFAULT);
  const ensureTab = useRightPanelStore((s) => s.ensureTab);
  const activeTabId = useRightPanelStore((s) => s.activeTabId);
  const tabs = useRightPanelStore((s) => s.tabs);
  const activeTab = tabs.find((t) => t.id === activeTabId);

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

  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const files = useDocumentStore((s) => s.files);
  const getContent = useDocumentStore((s) => s.getContent);
  const isCompiling = useCompileStore((s) => s.isCompiling);
  const compile = useCompileStore((s) => s.compile);

  const showSidebar = rightToolbarTab !== "browser" && rightSidebarOpen;
  const rightSidebarRef = usePanelRef();

  useEffect(() => {
    const panel = rightSidebarRef.current;
    if (!panel) return;
    if (showSidebar) {
      if (panel.isCollapsed()) panel.expand();
    } else {
      if (!panel.isCollapsed()) panel.collapse();
    }
  }, [showSidebar]);

  const compileFile = activeTab?.kind === "file" ? activeTab.fileId : null;
  const isTexFile = compileFile?.endsWith(".tex");

  const handleCompile = async () => {
    if (!projectRoot || !compileFile) return;
    const resolved = resolveCompileTarget(compileFile, files, getContent);
    if (resolved) {
      await compile(projectRoot, resolved.targetPath);
    }
  };

  const handleOpenProjectFolder = () => {
    if (projectRoot) {
      window.electronAPI.fsScan(projectRoot);
    }
  };

  return (
    <div className="flex h-full flex-col min-w-0 bg-background">
      {/* ── Toolbar ── */}
      <div className="flex h-[var(--height-right-area-toolbar)] shrink-0 items-center border-b border-border px-2 gap-0.5">
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

        <div className="mx-1 h-4 w-px bg-border/60" />
        <div className="flex flex-1 items-center gap-0.5 min-w-0 overflow-hidden">
          <TabBar />
        </div>

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

        <div className="mx-1 h-4 w-px bg-border/60" />

        <button
          type="button"
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
          title={editorMaximized ? "Restore" : "Maximize editor"}
          onClick={() => {
            const c = centerRef.current;
            const r = rightAreaRef.current;
            if (!c || !r) return;
            if (c.isCollapsed()) {
              if (isMobile) {
                r.collapse();
                c.resize(9999);
              } else {
                c.expand();
                r.resize(prevRightWidth.current);
              }
            } else {
              prevRightWidth.current = r.getSize().inPixels;
              c.collapse();
              r.resize(9999);
            }
          }}
        >
          {editorMaximized ? <MinimizeIcon className="size-3.5" /> : <MaximizeIcon className="size-3.5" />}
        </button>
      </div>

      {/* ── Main Content ── */}
      <Group id="right-inner" orientation="horizontal" className="flex-1 min-h-0" resizeTargetMinimumSize={{ fine: 5, coarse: 5 }}>
        <Panel id="right-main" minSize={150}>
          <RightMainArea />
        </Panel>
        <Separator id="handle-right-sidebar" className="w-px bg-border hover:bg-primary/40 transition-colors outline-none" />
        <Panel
          id="right-sidebar-inner"
          panelRef={rightSidebarRef}
          collapsible
          collapsedSize={0}
          minSize={SIDEBAR_RIGHT_MIN}
          maxSize="30%"
          defaultSize={SIDEBAR_RIGHT_DEFAULT}
          groupResizeBehavior="preserve-pixel-size"
          onResize={(s) => {
            setRightSidebarWidth(s.inPixels);
            const st = useLayoutStore.getState();
            if (s.inPixels === 0 && st.rightSidebarOpen) st.setRightSidebarOpen(false);
            if (s.inPixels > 0 && !st.rightSidebarOpen) st.setRightSidebarOpen(true);
          }}
        >
          <RightSidebar />
        </Panel>
      </Group>
    </div>
  );
}
