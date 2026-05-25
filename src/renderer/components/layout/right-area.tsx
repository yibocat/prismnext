import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { Group, Panel, Separator, usePanelRef, type PanelImperativeHandle } from "react-resizable-panels";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLayoutStore, type RightToolbarTab } from "@/stores/layout-store";
import { useDocumentStore } from "@/stores/document-store";
import { useCompileStore } from "@/stores/compile-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { resolveCompileTarget } from "@/lib/resolve-tex-root";
import { RightMainArea } from "@/components/layout/right-main-area";
import { RightSidebar } from "@/components/layout/right-sidebar";
import { TabBar } from "@/components/layout/tab-bar";
import {
  FolderOpenIcon as FilesIcon,
  GitBranchIcon,
  GlobeIcon,
  ListTreeIcon,
  MaximizeIcon,
  MinimizeIcon,
  PlayIcon,
  Loader2Icon,
  Columns2Icon,
} from "lucide-react";
import { SIDEBAR_RIGHT_MIN, RIGHT_AREA_DEFAULT } from "@/styles/constants";
import { cn } from "@/lib/utils";
import { PreviewToolbar } from "@/components/modules/preview-mode";

const TOOLBAR_TABS: { id: RightToolbarTab; label: string; icon: React.ReactNode }[] = [
  { id: "files", label: "Files", icon: <FilesIcon className="size-3.5" /> },
  { id: "git", label: "Git", icon: <GitBranchIcon className="size-3.5" /> },
  { id: "browser", label: "Browser", icon: <GlobeIcon className="size-3.5" /> },
  { id: "preview", label: "Preview", icon: <Columns2Icon className="size-3.5" /> },
];

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

  const tabs = useRightPanelStore((s) => s.tabs);
  const activeTabId = useRightPanelStore((s) => s.activeTabId);
  const ensureTab = useRightPanelStore((s) => s.ensureTab);
  const activeTab = tabs.find((t) => t.id === activeTabId);

  useEffect(() => {
    if (!activeTab) return;
    switch (activeTab.kind) {
      case "file": setRightToolbarTab("files"); break;
      case "git-overview": case "git-diff": setRightToolbarTab("git"); break;
      case "browser": setRightToolbarTab("browser"); break;
      case "preview": setRightToolbarTab("preview"); break;
    }
  }, [activeTab?.kind]);

  // Auto-open right sidebar when Preview tab is opened
  const prevActiveTabKind = useRef(activeTab?.kind);
  useEffect(() => {
    if (activeTab?.kind === "preview" && prevActiveTabKind.current !== "preview") {
      if (!rightSidebarOpen) toggleRightSidebar();
    }
    prevActiveTabKind.current = activeTab?.kind;
  }, [activeTab?.kind]);

  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const files = useDocumentStore((s) => s.files);
  const getContent = useDocumentStore((s) => s.getContent);
  const isCompiling = useCompileStore((s) => s.isCompiling);
  const compile = useCompileStore((s) => s.compile);

  const showSidebar = rightToolbarTab !== "browser" && rightSidebarOpen;
  const rightSidebarRef = usePanelRef();

  useLayoutEffect(() => { rightSidebarRef.current?.collapse(); }, []);

  useEffect(() => {
    const panel = rightSidebarRef.current;
    if (!panel) return;
    if (showSidebar) { if (panel.isCollapsed()) panel.expand(); }
    else { if (!panel.isCollapsed()) panel.collapse(); }
  }, [showSidebar]);

  const compileFile = activeTab?.kind === "file" || activeTab?.kind === "preview" ? activeTab.fileId : null;
  const isTexFile = compileFile?.endsWith(".tex");

  const handleCompile = async () => {
    if (!projectRoot || !compileFile) return;
    const resolved = resolveCompileTarget(compileFile, files, getContent);
    if (resolved) await compile(projectRoot, resolved.targetPath);
  };

  return (
    <div className="flex h-full flex-col min-w-0 bg-background">
      {/* Toolbar */}
      <div className="flex h-[var(--height-right-area-toolbar)] shrink-0 items-center border-b border-border px-2 gap-0.5 overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-0.5 shrink-0">
        {TOOLBAR_TABS.map((tab) =>
          tab.id === "files" ? (
            <div key={tab.id} className="flex items-center">
              <button
                type="button"
                className={cn(
                  "flex size-6 items-center justify-center rounded transition-colors",
                  rightToolbarTab === "files" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                title={`${tab.label} — open project folder`}
                onClick={() => {
                  setRightToolbarTab("files");
                  ensureTab("file");
                  if (projectRoot) window.electronAPI.fsScan(projectRoot);
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
                rightToolbarTab === tab.id ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              title={tab.label}
              onClick={() => {
                setRightToolbarTab(tab.id);
                if (tab.id === "git") ensureTab("git-overview");
                else if (tab.id === "browser") ensureTab("browser");
                else if (tab.id === "preview") ensureTab("preview");
              }}
            >
              {tab.icon}
            </button>
          ),
        )}
        </div>

        <div className="mx-1 h-4 w-px bg-border/60 shrink-0" />
        <div className="flex-1 min-w-0">
          <TabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onSelect={(id) => useRightPanelStore.getState().setActiveTab(id)}
            onClose={(id) => useRightPanelStore.getState().closeTab(id)}
            onReorder={(from, to) => useRightPanelStore.getState().moveTab(from, to)}
          />
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
        {activeTab?.kind === "preview" ? (
          <PreviewToolbar compileFile={compileFile} />
        ) : (
          isTexFile && (
            <button type="button" className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" title="Compile" onClick={handleCompile} disabled={isCompiling}>
              {isCompiling ? <Loader2Icon className="size-3.5 animate-spin" /> : <PlayIcon className="size-3.5" />}
            </button>
          )
        )}

        {rightToolbarTab !== "browser" && (
          <button type="button" className={cn("flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors", rightSidebarOpen && "bg-muted text-foreground")} title="Toggle file list" onClick={toggleRightSidebar}>
            <ListTreeIcon className="size-3.5" />
          </button>
        )}
        </div>

        <div className="mx-1 h-4 w-px bg-border/60 shrink-0" />

        <button
          type="button"
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
          title={editorMaximized ? "Restore" : "Maximize editor"}
          onClick={() => {
            const c = centerRef.current;
            const r = rightAreaRef.current;
            if (!c || !r) return;
            if (c.isCollapsed()) {
              if (isMobile) { r.collapse(); c.resize(9999); }
              else { c.expand(); r.resize(prevRightWidth.current); }
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

      {/* Main Content */}
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
          maxSize="40%"
          defaultSize={useLayoutStore.getState().rightSidebarWidth}
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
