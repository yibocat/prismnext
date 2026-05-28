import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { useTheme } from "next-themes";
import { Group, Panel, Separator, usePanelRef, type PanelImperativeHandle } from "react-resizable-panels";
import { useLayoutStore, type RightToolbarTab } from "@/stores/layout-store";
import { useDocumentStore } from "@/stores/document-store";
import { useCompileStore } from "@/stores/compile-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useWindowState } from "@/hooks/use-window-state";
import { resolveCompileTarget } from "@/lib/resolve-tex-root";
import { RightMainArea } from "@/components/layout/right-main-area";
import { RightSidebar } from "@/components/layout/right-sidebar";
import { TabBar } from "@/components/layout/tab-bar";
import { SidebarControls } from "@/components/layout/sidebar-controls";
import { TabToolbar } from "@/components/layout/tab-toolbar";
import { PreviewToolbar } from "@/components/modules/preview-mode";
import {
  FolderOpenIcon as FilesIcon,
  GitBranchIcon,
  GlobeIcon,
  PlayIcon,
  Loader2Icon,
  FileType,
  PanelRight,
  MaximizeIcon,
  MinimizeIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
  Minimize2Icon,
  Maximize2Icon,
  XIcon,
} from "lucide-react";
import { SIDEBAR_RIGHT_MIN } from "@/styles/constants";
import { cn } from "@/lib/utils";

const TOOLBAR_TABS: { id: RightToolbarTab; label: string; icon: React.ReactNode }[] = [
  { id: "files", label: "Files", icon: <FilesIcon className="size-3.5" /> },
  { id: "git", label: "Git", icon: <GitBranchIcon className="size-3.5" /> },
  { id: "browser", label: "Browser", icon: <GlobeIcon className="size-3.5" /> },
  { id: "preview", label: "Texwork", icon: <FileType className="size-3.5" /> },
];

interface RightAreaProps {
  leftSidebarRef: RefObject<PanelImperativeHandle | null>;
  centerRef: RefObject<PanelImperativeHandle | null>;
  rightAreaRef: RefObject<PanelImperativeHandle | null>;
}

export function RightArea({ leftSidebarRef, centerRef, rightAreaRef }: RightAreaProps) {
  const { platform, isMaximized, isFullscreen } = useWindowState();
  const isMac = platform === "darwin";
  const { theme, resolvedTheme, setTheme } = useTheme();

  const cycleTheme = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  const sidebarFullyCollapsed = useLayoutStore((s) => s.sidebarFullyCollapsed);
  const editorMaximized = useLayoutStore((s) => s.editorMaximized);
  const rightToolbarTab = useLayoutStore((s) => s.rightToolbarTab);
  const setRightToolbarTab = useLayoutStore((s) => s.setRightToolbarTab);
  const rightAreaExpanded = useLayoutStore((s) => s.rightAreaExpanded);
  const rightSidebarOpen = useLayoutStore((s) => s.rightSidebarOpen);
  const toggleRightSidebar = useLayoutStore((s) => s.toggleRightSidebar);
  const setRightSidebarWidth = useLayoutStore((s) => s.setRightSidebarWidth);

  const tabs = useRightPanelStore((s) => s.tabs);
  const activeTabId = useRightPanelStore((s) => s.activeTabId);
  const ensureTab = useRightPanelStore((s) => s.ensureTab);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isPreviewActive = activeTab?.kind === "preview";

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

  const showSidebar = rightSidebarOpen;
  const rightSidebarRef = usePanelRef();

  // Sync inner sidebar panel with store.
  // Only operate when outer RightArea panel is expanded — if it's collapsed,
  // the inner panel is constrained to 0px and calling collapse() would save
  // 0 as the pre-collapse size, breaking drag-to-expand.
  //
  // When closing: only collapse programmatically if the panel is at a
  // visible size (>= min). This avoids interfering with user drags, where
  // onResize already sets rightSidebarOpen=false while the panel is mid-drag
  // and near 0px.
  useLayoutEffect(() => {
    const panel = rightSidebarRef.current;
    if (!panel || !rightAreaExpanded) return;
    if (showSidebar) {
      if (panel.isCollapsed()) {
        panel.expand();
      } else if (panel.getSize().inPixels < SIDEBAR_RIGHT_MIN) {
        panel.resize(useLayoutStore.getState().rightSidebarWidth);
      }
    } else {
      if (!panel.isCollapsed() && panel.getSize().inPixels >= SIDEBAR_RIGHT_MIN) {
        panel.collapse();
      }
    }
  }, [showSidebar, rightAreaExpanded]);

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
      <div className="drag-region flex h-[var(--height-titlebar)] shrink-0 items-center px-2 gap-0.5 overflow-x-auto scrollbar-none select-none">
        <div className="flex items-center gap-0.5 shrink-0">
        {/* Sidebar controls when sidebar collapsed AND editor maximized */}
        {sidebarFullyCollapsed && editorMaximized && (
          <SidebarControls leftSidebarRef={leftSidebarRef} showMacSpacer={isMac && !isFullscreen} className="-ml-[1px]" />
        )}
        {sidebarFullyCollapsed && editorMaximized && (
          <div className="mx-1 h-4 w-px bg-border/60 shrink-0" />
        )}
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
        {/* Compile button for non-preview .tex files (preview has its own in tab toolbar) */}
        {activeTab?.kind !== "preview" && isTexFile && (
          <button type="button" className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" title="Compile" onClick={handleCompile} disabled={isCompiling}>
            {isCompiling ? <Loader2Icon className="size-3.5 animate-spin" /> : <PlayIcon className="size-3.5" />}
          </button>
        )}

        {((activeTab?.kind !== "preview" && isTexFile)) && (
          <div className="mx-1 h-4 w-px bg-border/60 shrink-0" />
        )}

        {/* Window controls when editorMaximized (ContentTopBar is hidden) */}
        {editorMaximized && !isMac && (
          <>
            <button
              type="button"
              className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Minimize"
              onClick={() => window.electronAPI?.windowMinimize()}
            >
              <Minimize2Icon className="size-3.5" />
            </button>
            <button
              type="button"
              className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title={isMaximized ? "Restore" : "Maximize"}
              onClick={() => window.electronAPI?.windowMaximize()}
            >
              <Maximize2Icon className="size-3.5" />
            </button>
            <button
              type="button"
              className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-red-500 hover:text-white transition-colors"
              title="Close"
              onClick={() => window.electronAPI?.windowClose()}
            >
              <XIcon className="size-3.5" />
            </button>
            <div className="mx-1 h-4 w-px bg-border/60 shrink-0" />
          </>
        )}

        {/* Editor maximize / restore */}
        <button
          type="button"
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title={editorMaximized ? "Restore Editor" : "Maximize Editor"}
          onClick={() => {
            const c = centerRef.current;
            const r = rightAreaRef.current;
            if (!c || !r) return;
            if (c.isCollapsed()) {
              r.resize(useLayoutStore.getState().rightAreaWidth || 500);
              c.expand();
            } else {
              useLayoutStore.getState().setRightAreaWidth(r.getSize().inPixels);
              c.collapse();
              r.resize(9999);
            }
          }}
        >
          {editorMaximized ? <MinimizeIcon className="size-3.5" /> : <MaximizeIcon className="size-3.5" />}
        </button>

        <div className="mx-1 h-4 w-px bg-border/60 shrink-0" />

        {/* Theme toggle */}
        <button
          type="button"
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title={`Theme: ${theme}`}
          onClick={cycleTheme}
        >
          {theme === "system" ? (
            <MonitorIcon className="size-3.5" />
          ) : resolvedTheme === "dark" ? (
            <SunIcon className="size-3.5" />
          ) : (
            <MoonIcon className="size-3.5" />
          )}
        </button>

        {/* Close right area panel */}
        <button
          type="button"
          className={cn(
            "flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
            rightAreaExpanded && "bg-muted text-foreground",
          )}
          title="Close Panel"
          onClick={() => {
            const r = rightAreaRef.current;
            const c = centerRef.current;
            if (!r || !c) return;
            useLayoutStore.getState().setRightAreaWidth(r.getSize().inPixels);
            r.collapse();
            c.resize(9999);
          }}
        >
          <PanelRight className="size-3.5" />
        </button>
        </div>
      </div>

      {/* Tab Toolbar */}
      <TabToolbar>
        {isPreviewActive && <PreviewToolbar compileFile={compileFile} />}
      </TabToolbar>

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
          maxSize="80%"
          defaultSize={0}
          groupResizeBehavior="preserve-pixel-size"
          onResize={(s) => {
            const st = useLayoutStore.getState();
            // Only save width when above collapse threshold to prevent
            // the collapse animation from polluting rightSidebarWidth
            if (s.inPixels > 30) setRightSidebarWidth(s.inPixels);
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
