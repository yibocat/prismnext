import { useEffect, useRef, useState, useCallback, useMemo, type RefObject } from "react";
import { useTheme } from "next-themes";
import { useLayoutStore, type RightToolbarTab } from "@/stores/layout-store";
import { useDocumentStore } from "@/stores/document-store";
import { useRightPanelStore, type RightTab } from "@/stores/right-panel-store";
import { useWindowState } from "@/hooks/use-window-state";
import { RightMainArea } from "@/components/layout/right-main-area";
import { RightSidebar } from "@/components/layout/right-sidebar";
import { TabBar } from "@/components/layout/tab-bar";
import { SidebarControls } from "@/components/layout/sidebar-controls";
import { TabToolbar } from "@/components/layout/tab-toolbar";
import { TexworkspaceToolbar } from "@/components/modules/texworkspace-mode";
import { FileToolbar } from "@/components/modules/editor/toolbars/file-toolbar";
import { BrowserToolbar } from "@/components/modules/browser/browser-toolbar";
import { TerminalToolbar } from "@/components/modules/terminal";
import { useBrowserStore } from "@/stores/browser-store";
import { useTerminalStore } from "@/stores/terminal-store";
import { AiBar } from "@/components/modules/chat";
import { type PanelImperativeHandle } from "react-resizable-panels";
import {
  Folders as FilesIcon,
  GitBranchIcon,
  GlobeIcon,
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
  Terminal as TerminalIcon,
} from "lucide-react";
import { SIDEBAR_RIGHT_MIN, SIDEBAR_RIGHT_MAX } from "@/styles/constants";
import { cn } from "@/lib/utils";

const TOOLBAR_TABS: { id: RightToolbarTab; label: string; icon: React.ReactNode }[] = [
  { id: "files", label: "Files", icon: <FilesIcon className="size-3.5" /> },
  { id: "git", label: "Git", icon: <GitBranchIcon className="size-3.5" /> },
  { id: "browser", label: "Browser", icon: <GlobeIcon className="size-3.5" /> },
  { id: "terminal", label: "Terminal", icon: <TerminalIcon className="size-3.5" /> },
  { id: "texworkspace", label: "Texworkspace", icon: <FileType className="size-3.5" /> },
];

interface RightAreaProps {
  leftSidebarRef: RefObject<PanelImperativeHandle | null>;
  centerRef: RefObject<PanelImperativeHandle | null>;
  rightAreaRef: RefObject<PanelImperativeHandle | null>;
}

function SidebarDragHandle({
  onResize,
  isDraggingRef,
  onDragChange,
}: {
  onResize: (width: number) => void;
  /** Set to true while the user is actively dragging — used to suppress
   *  ResizeObserver feedback during drag (prevents state-update loop). */
  isDraggingRef?: React.MutableRefObject<boolean>;
  /** Called when drag starts (true) or ends (false) — for overlay/UI state. */
  onDragChange?: (dragging: boolean) => void;
}) {
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = useLayoutStore.getState().rightSidebarWidth;

      if (isDraggingRef) isDraggingRef.current = true;
      if (onDragChange) onDragChange(true);

      let rafId: number | null = null;
      const latestEventRef = { current: null as MouseEvent | null };

      const onMouseMove = (ev: MouseEvent) => {
        // Store the latest event so the RAF callback always uses current mouse position
        latestEventRef.current = ev;
        if (rafId !== null) return; // Already scheduled for this frame
        rafId = requestAnimationFrame(() => {
          rafId = null;
          const latest = latestEventRef.current;
          if (latest) {
            onResize(startWidth - (latest.clientX - startX));
          }
        });
      };

      const onMouseUp = () => {
        if (isDraggingRef) isDraggingRef.current = false;
        if (onDragChange) onDragChange(false);
        if (rafId !== null) cancelAnimationFrame(rafId);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [onResize, isDraggingRef, onDragChange],
  );

  return (
    <div
      className="w-px bg-border hover:bg-primary/40 transition-colors cursor-col-resize shrink-0 relative group"
      onMouseDown={handleMouseDown}
    >
      {/* Wider hit area for easier grabbing */}
      <div className="absolute inset-y-0 -left-1 -right-1" />
    </div>
  );
}

/**
 * Resolve the TabToolbar content based on the active tab's kind and file type.
 *
 * Mode (system) → file type hierarchy:
 *   texworkspace → TexworkspaceToolbar (full LaTeX workflow)
 *   file         → FileToolbar (dispatches by extension)
 *   others       → null (coming soon)
 */
function resolveTabToolbar(
  tab: RightTab | undefined,
  compileFile: string | null | undefined,
): React.ReactNode {
  if (!tab) return null;

  switch (tab.kind) {
    case "texworkspace":
      return <TexworkspaceToolbar compileFile={compileFile} />;
    case "file":
      return <FileToolbar filePath={tab.filePath} />;
    case "browser":
      return (
        <BrowserToolbar
          tabId={tab.id}
          tabUrl={tab.url ?? ""}
          tabTitle={tab.title}
        />
      );
    case "terminal":
      return (
        <TerminalToolbar
          tabId={tab.id}
          tabTitle={tab.title}
        />
      );
    default:
      return null;
  }
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
  const setRightSidebarOpen = useLayoutStore((s) => s.setRightSidebarOpen);
  const rightSidebarWidth = useLayoutStore((s) => s.rightSidebarWidth);
  const setRightSidebarWidth = useLayoutStore((s) => s.setRightSidebarWidth);

  const tabs = useRightPanelStore((s) => s.tabs);
  const activeTabId = useRightPanelStore((s) => s.activeTabId);
  const ensureTab = useRightPanelStore((s) => s.ensureTab);
  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Sync rightToolbarTab and sidebar visibility with active tab
  const prevActiveTabKind = useRef(activeTab?.kind);

  useEffect(() => {
    // Update toolbar tab to match active tab
    if (!activeTab) {
      setRightToolbarTab("dashboard");
    } else {
      switch (activeTab.kind) {
        case "file": setRightToolbarTab("files"); break;
        case "git-overview": case "git-diff": setRightToolbarTab("git"); break;
        case "browser": setRightToolbarTab("browser"); break;
        case "terminal": setRightToolbarTab("terminal"); break;
        case "texworkspace": setRightToolbarTab("texworkspace"); break;
        default: setRightToolbarTab("files"); break;
      }
    }

    // Auto-open sidebar when entering any content mode (files/git/browser/texworkspace)
    const isContentMode = activeTab && activeTab.kind !== undefined;
    const justEntered = activeTab?.kind !== prevActiveTabKind.current;
    if (isContentMode && justEntered) {
      setRightSidebarOpen(true);
    }
    prevActiveTabKind.current = activeTab?.kind;
  }, [activeTab?.kind, setRightSidebarOpen]);

  const projectRoot = useDocumentStore((s) => s.projectRoot);

  // Initialize browser store when project opens
  useEffect(() => {
    if (projectRoot) {
      useBrowserStore.getState().loadFromProject(projectRoot);
    }
  }, [projectRoot]);

  // Initialize terminal store when project opens
  useEffect(() => {
    if (projectRoot) {
      useTerminalStore.getState().loadFromProject(projectRoot);
      useTerminalStore.getState().fetchEnvInfo();
    }
  }, [projectRoot]);
  const fileContents = useDocumentStore((s) => s.fileContents);
  const dirtyFileIds = useMemo(() => {
    const dirty = new Set<string>();
    fileContents.forEach((v, k) => { if (v.isDirty) dirty.add(k); });
    return dirty;
  }, [fileContents]);

  // ─── Sidebar drag-to-resize ───
  // Same pattern as App.tsx Panel onResize:
  //   - Only save width when >= 30px (preserve last real width on collapse)
  //   - Close sidebar when width drops below 30px
  const COLLAPSE_THRESHOLD = 30;

  // Flag to suppress ResizeObserver while the user is actively dragging the
  // sidebar handle. Without this, each drag-induced state update triggers a
  // DOM change, which the ResizeObserver picks up and turns back into another
  // state update — a feedback loop that doubles the per-frame work.
  // Dual-track: ref (fast, no re-render) for ResizeObserver suppression;
  // state (triggers re-render) for the drag overlay that captures mouse
  // events from the webview's native window.
  const isDraggingSidebar = useRef(false);
  const [sidebarDragActive, setSidebarDragActive] = useState(false);

  const handleSidebarResize = useCallback(
    (width: number) => {
      const st = useLayoutStore.getState();
      if (width >= COLLAPSE_THRESHOLD) {
        const clamped = Math.max(SIDEBAR_RIGHT_MIN, Math.min(SIDEBAR_RIGHT_MAX, width));
        st.setRightSidebarWidth(clamped);
        if (!st.rightSidebarOpen) st.setRightSidebarOpen(true);
      } else {
        if (st.rightSidebarOpen) st.setRightSidebarOpen(false);
      }
    },
    [],
  );

  // ─── ResizeObserver: sync sidebar width when squeezed by container ───
  const sidebarElRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sidebarEl = sidebarElRef.current;
    if (!sidebarEl) return;

    const observer = new ResizeObserver((entries) => {
      // Skip while the user is actively dragging — the drag handler is already
      // setting the width, and the ResizeObserver would only create a feedback
      // loop (drag → setState → DOM update → ResizeObserver → setState again).
      if (isDraggingSidebar.current) return;

      const actualWidth = Math.round(entries[0].contentRect.width);
      if (actualWidth <= 0) return;
      const st = useLayoutStore.getState();
      if (actualWidth >= COLLAPSE_THRESHOLD) {
        st.setRightSidebarWidth(actualWidth);
        if (!st.rightSidebarOpen) st.setRightSidebarOpen(true);
      } else {
        if (st.rightSidebarOpen) st.setRightSidebarOpen(false);
      }
    });
    observer.observe(sidebarEl);
    return () => observer.disconnect();
  }, []);

  // ─── Sidebar full-mode: when toggled open in narrow space, sidebar fills RightArea ───
  // Same idea as LeftSidebar overlay: mode is decided at toggle time.
  const containerElRef = useRef<HTMLDivElement>(null);
  const [sidebarFullMode, setSidebarFullMode] = useState(false);

  const handleToggleSidebar = useCallback(() => {
    const st = useLayoutStore.getState();
    if (st.rightSidebarOpen) {
      // Closing: clear full mode
      setSidebarFullMode(false);
      st.setRightSidebarOpen(false);
    } else {
      // Opening: check if space is narrow → full mode
      const containerWidth = containerElRef.current?.clientWidth ?? Infinity;
      const narrow = containerWidth < st.rightSidebarWidth + 150;
      if (narrow) setSidebarFullMode(true);
      st.setRightSidebarOpen(true);
    }
  }, []);

  const compileFile = activeTab?.kind === "file" || activeTab?.kind === "texworkspace" ? activeTab.fileId : null;

  const sidebarFull = rightSidebarOpen && sidebarFullMode;

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
                else if (tab.id === "terminal") ensureTab("terminal");
                else if (tab.id === "texworkspace") ensureTab("texworkspace");
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
            dirtyFileIds={dirtyFileIds}
          />
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
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

        <div className="mx-1 h-4 w-px bg-border/60 shrink-0" />

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
      <TabToolbar
        onToggleSidebar={handleToggleSidebar}
        filePath={activeTab?.filePath}
        projectName={projectRoot?.split(/[/\\]/).pop()}
        hideSpacer={activeTab?.kind === "browser" || activeTab?.kind === "terminal"}
      >
        {resolveTabToolbar(activeTab, compileFile)}
      </TabToolbar>

      {/* Main Content: flex layout — main expands, sidebar stays fixed width */}
      <div ref={containerElRef} className="flex flex-1 min-h-0 relative">
        {!sidebarFull && (
          <div className="flex-1 min-w-[150px]">
            <RightMainArea />
          </div>
        )}

        {rightSidebarOpen && (
          <>
            <SidebarDragHandle onResize={handleSidebarResize} isDraggingRef={isDraggingSidebar} onDragChange={setSidebarDragActive} />
            <div
              ref={sidebarElRef}
              className="shrink-0 overflow-hidden"
              style={{ width: sidebarFull ? "100%" : rightSidebarWidth }}
            >
              <RightSidebar />
            </div>
          </>
        )}

        {editorMaximized && <AiBar />}

        {/* Drag overlay: blocks the webview's native surface from intercepting
            mouse events and prevents frame-by-frame webview resize during
            sidebar drag — both are expensive per-frame operations that cause jank. */}
        {sidebarDragActive && (
          <div
            className="fixed inset-0 z-50 cursor-col-resize"
          />
        )}
      </div>
    </div>
  );
}
