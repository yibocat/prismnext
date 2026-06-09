import { useEffect, useRef, useState, useCallback, useMemo, type RefObject } from "react";
import { useLayoutStore, type RightToolbarTab } from "@/stores/layout-store";
import { useDocumentStore } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { modeRegistry, type RightTab } from "@/lib/mode-registry";
import { useWindowState } from "@/hooks/use-window-state";
import { RightMainArea } from "@/components/layout/right-main-area";
import { RightSidebar } from "@/components/layout/right-sidebar";
import { TabBar } from "@/components/layout/tab-bar";
import { SidebarControls } from "@/components/layout/sidebar-controls";
import { TabToolbar } from "@/components/layout/tab-toolbar";

import { useBrowserStore } from "@/stores/browser-store";
import { useTerminalStore } from "@/stores/terminal-store";
import { useGitStore } from "@/stores/git-store";
import { AiBar } from "@/components/modules/chat";
import { type PanelImperativeHandle } from "react-resizable-panels";
import {
  PanelRight,
  MaximizeIcon,
  MinimizeIcon,
  Minimize2Icon,
  Maximize2Icon,
  XIcon,
} from "lucide-react";
import { SIDEBAR_RIGHT_MIN, SIDEBAR_RIGHT_MAX } from "@/styles/constants";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronsLeftRightEllipsisIcon, LayoutGridIcon } from "lucide-react";
import { cn } from "@/lib/utils";

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
      className="w-px bg-border hover:bg-foreground/30 transition-colors cursor-col-resize shrink-0 relative group"
      onMouseDown={handleMouseDown}
    >
      {/* Wider hit area for easier grabbing */}
      <div className="absolute inset-y-0 -left-1 -right-1" />
    </div>
  );
}

export function RightArea({ leftSidebarRef, centerRef, rightAreaRef }: RightAreaProps) {
  const { platform, isMaximized, isFullscreen } = useWindowState();
  const isMac = platform === "darwin";

  const sidebarFullyCollapsed = useLayoutStore((s) => s.sidebarFullyCollapsed);
  const editorMaximized = useLayoutStore((s) => s.editorMaximized);
  const activeModes = useLayoutStore((s) => s.activeModes);
  const focusedMode = useLayoutStore((s) => s.focusedMode);
  const toggleMode = useLayoutStore((s) => s.toggleMode);
  const activateMode = useLayoutStore((s) => s.activateMode);
  const rightAreaExpanded = useLayoutStore((s) => s.rightAreaExpanded);
  const rightSidebarOpen = useLayoutStore((s) => s.rightSidebarOpen);
  const setRightSidebarOpen = useLayoutStore((s) => s.setRightSidebarOpen);
  const rightSidebarWidth = useLayoutStore((s) => s.rightSidebarWidth);
  const setRightSidebarWidth = useLayoutStore((s) => s.setRightSidebarWidth);

  const tabs = useRightPanelStore((s) => s.tabs);
  const activeTabId = useRightPanelStore((s) => s.activeTabId);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isEditorKind = activeTab?.kind === "file" || activeTab?.kind === "texworkspace";

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

  // ── File watcher: start when checkout root changes (project open OR worktree switch) ──
  const checkoutRoot = useDocumentStore((s) => s.checkoutRoot);

  // Initialize / sync git store when project opens or checkout root changes
  // (e.g. switching between worktree and project views in the Files panel).
  useEffect(() => {
    const root = checkoutRoot || projectRoot;
    if (root) {
      useGitStore.getState().selectUnit(root);
    } else {
      useGitStore.getState().clearAll();
    }
  }, [projectRoot, checkoutRoot]);

  useEffect(() => {
    if (checkoutRoot) {
      window.electronAPI.fsWatchStart(checkoutRoot).catch((err) => {
        console.error("[watcher] Failed to start file watcher:", err);
      });
    }
    return () => {
      window.electronAPI.fsWatchStop().catch((err) => {
        console.error("[watcher] Failed to stop file watcher:", err);
      });
    };
  }, [checkoutRoot]);

  // ── File watcher: reload files AND refresh git when external changes detected ──
  useEffect(() => {
    const unsubscribe = window.electronAPI.onFileChanged(({ changedPaths }) => {
      if (changedPaths && changedPaths.length > 0) {
        // Incremental: only reload the specific files that changed
        useDocumentStore.getState().incrementalFileChanged(changedPaths);
      } else {
        // Fallback: full metadata reload (mass directory changes)
        useDocumentStore.getState().reloadMetadataFromDisk();
      }

      const gs = useGitStore.getState();
      if (gs.isGitRepo && gs.unitRoot) {
        gs.scheduleAutoRefresh(gs.unitRoot);
      }
    });
    return unsubscribe;
  }, []);

  // Subscribe to a lightweight version counter instead of the full Map —
  // avoids RightArea re-rendering on every keystroke in any editor.
  const dirtyVersion = useDocumentStore((s) => s.dirtyVersion);
  const dirtyFileIds = useMemo(() => {
    const dirty = new Set<string>();
    useDocumentStore.getState().openedContents.forEach((v, k) => { if (v.isDirty) dirty.add(k); });
    return dirty;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirtyVersion]);

  // Stable TabBar callbacks — prevents memo break
  const handleTabSelect = useCallback(
    (id: string) => {
      const store = useRightPanelStore.getState();
      store.setActiveTab(id);
      // Sync focusedMode to match the clicked tab
      const tab = store.tabs.find((t) => t.id === id);
      if (tab) {
        const def = modeRegistry.findByTabKind(tab.kind);
        if (def) useLayoutStore.getState().setFocusedMode(def.id as RightToolbarTab);
      }
    }, []);
  const handleTabClose = useCallback(
    (id: string) => useRightPanelStore.getState().closeTab(id), []);
  const handleTabReorder = useCallback(
    (from: number, to: number) => useRightPanelStore.getState().moveTab(from, to), []);

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
        st.setRightSidebarWidth(Math.max(SIDEBAR_RIGHT_MIN, actualWidth));
        if (!st.rightSidebarOpen) st.setRightSidebarOpen(true);
      } else {
        if (st.rightSidebarOpen) st.setRightSidebarOpen(false);
      }
    });
    observer.observe(sidebarEl);
    return () => observer.disconnect();
  }, []);

  // ─── Sidebar full-mode: when space is too narrow for sidebar + content,
  // sidebar fills the whole RightArea (content pane is hidden).
  // Evaluated at toggle time AND continuously via ResizeObserver so the
  // layout stays correct during window resize, not just at toggle.
  const containerElRef = useRef<HTMLDivElement>(null);
  const [sidebarFullMode, setSidebarFullMode] = useState(false);

  // Reactively switch to/from full mode as the container width changes.
  useEffect(() => {
    const el = containerElRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (!useLayoutStore.getState().rightSidebarOpen) return;
      const w = el.clientWidth;
      const sidebarW = useLayoutStore.getState().rightSidebarWidth;
      const narrow = w < sidebarW + 150;
      setSidebarFullMode((prev) => (prev !== narrow ? narrow : prev));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  // ── Mode button: per-mode lifecycle (registry-driven) ──
  const handleModeClick = useCallback(
    (target: string) => {
      const store = useRightPanelStore.getState();
      const active = activeModes.includes(target as RightToolbarTab);
      const def = modeRegistry.get(target);

      if (!active) {
        // ── Activate mode ──
        activateMode(target as RightToolbarTab);
        if (def) {
          // Terminal is special: only create PTY if no sessions exist
          if (target === "terminal" && store.hasTabsOfKind("terminal")) {
            // reuse existing terminal tab
          } else {
            const kind = def.tabKinds[0];
            if (kind) {
              if (target === "terminal") {
                store.newTerminalTab();
              } else {
                store.ensureTab(kind);
              }
            }
          }
          def.onActivate?.();
        }
        // Narrow window → don't auto-open sidebar (tab area is too tight)
        if (!compactModesRef.current) {
          setRightSidebarOpen(true);
          // Determine full mode synchronously — don't rely solely on the
          // async ResizeObserver which may fire during panel expansion
          // with an intermediate width and incorrectly lock full mode.
          const cw = containerElRef.current?.clientWidth ?? Infinity;
          const sw = useLayoutStore.getState().rightSidebarWidth;
          setSidebarFullMode(cw < sw + 150);
        }
      } else if (focusedMode === target) {
        // ── Deactivate mode → close ALL its tabs → Dashboard ──
        if (def) {
          for (const k of def.tabKinds) {
            store.closeTabsOfKind(k);
          }
          def.onDeactivate?.();
        }
        toggleMode(target as RightToolbarTab);
        // Sync activeTabId to new focusedMode
        const newFocused = useLayoutStore.getState().focusedMode;
        if (newFocused !== "dashboard") {
          const newDef = modeRegistry.get(newFocused);
          const newTab = store.tabs.find(
            (t) => newDef?.tabKinds.includes(t.kind),
          );
          if (newTab) store.setActiveTab(newTab.id);
        }
      } else {
        // ── Switch focus (active but not focused) ──
        toggleMode(target as RightToolbarTab);
        const tab = store.tabs.find(
          (t) => def?.tabKinds.includes(t.kind),
        );
        if (tab) store.setActiveTab(tab.id);
      }
    },
    [activeModes, focusedMode, activateMode, toggleMode, setRightSidebarOpen],
  );

  const sidebarFull = rightSidebarOpen && sidebarFullMode;

  // ── Tab overflow detection ──
  const tabBarContainerRef = useRef<HTMLDivElement>(null);
  const [tabsOverflow, setTabsOverflow] = useState(false);
  const tabsOverflowRef = useRef(false);
  useEffect(() => {
    const el = tabBarContainerRef.current;
    if (!el) return;
    const check = () => {
      const ov = tabs.length > 0 && el.clientWidth < tabs.length * 126;
      tabsOverflowRef.current = ov;
      setTabsOverflow(ov);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tabs.length]);

  // ─── Responsive: collapse mode buttons into dropdown on narrow windows ───
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [compactModes, setCompactModes] = useState(false);
  const compactModesRef = useRef(false);
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const check = () => {
      const c = el.clientWidth < 500;
      compactModesRef.current = c;
      setCompactModes(c);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="flex h-full flex-col min-w-0 glass-content">
      {/* Toolbar */}
      <div ref={toolbarRef} className="drag-region flex h-[var(--height-titlebar)] shrink-0 items-center gap-0.5 select-none px-2">
        <div className="flex items-center gap-0.5 shrink-0">
        {/* Sidebar controls when sidebar collapsed AND editor maximized */}
        {sidebarFullyCollapsed && editorMaximized && (
          <SidebarControls leftSidebarRef={leftSidebarRef} showMacSpacer={isMac && !isFullscreen} className="-ml-[1px]" />
        )}
        </div>

        <div ref={tabBarContainerRef} className="flex-1 min-w-0">
          <TabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onSelect={handleTabSelect}
            onClose={handleTabClose}
            onReorder={handleTabReorder}
            dirtyFileIds={dirtyFileIds}
            forceOverflow={tabsOverflow}
          />
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
        {/* ── Tab overflow dropdown (shown when tabs don't fit) ── */}
        {tabsOverflow && tabs.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                title="Open tabs"
              >
                <ChevronsLeftRightEllipsisIcon className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 max-h-80 overflow-y-auto">
              {tabs.map((tab) => (
                <DropdownMenuItem
                  key={tab.id}
                  onClick={() => handleTabSelect(tab.id)}
                  className={cn(
                    "cursor-pointer gap-2 text-xs group pr-1",
                    tab.id === activeTabId && "bg-accent font-medium",
                  )}
                >
                  <span className="truncate flex-1">{tab.kind === "file" && tab.isInitial ? "folder" : tab.title}</span>
                  <button
                    type="button"
                    className="flex size-4 shrink-0 items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-muted-foreground/10 transition-opacity"
                    onClick={(e) => { e.stopPropagation(); handleTabClose(tab.id); }}
                    title="Close tab"
                  >
                    <XIcon className="size-2.5" />
                  </button>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Window controls when editorMaximized (ContentTopBar is hidden) */}
        {editorMaximized && !isMac && (
          <>
            <button
              type="button"
              className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              title="Minimize"
              onClick={() => window.electronAPI?.windowMinimize()}
            >
              <Minimize2Icon className="size-3.5" />
            </button>
            <button
              type="button"
              className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              title={isMaximized ? "Restore" : "Maximize"}
              onClick={() => window.electronAPI?.windowMaximize()}
            >
              <Maximize2Icon className="size-3.5" />
            </button>
            <button
              type="button"
              className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive hover:text-white transition-colors"
              title="Close"
              onClick={() => window.electronAPI?.windowClose()}
            >
              <XIcon className="size-3.5" />
            </button>
            <div className="mx-1 h-4 w-px bg-border/60 shrink-0" />
          </>
        )}

        {!compactModes && <div className="mx-1 h-4 w-px bg-border/60 shrink-0" />}

        {/* ── Mode buttons — collapse to dropdown on narrow windows ── */}
        {compactModes ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                title="Modes"
              >
                <LayoutGridIcon className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              {modeRegistry.getAll().map((mode) => {
                const isActive = activeModes.includes(mode.id as RightToolbarTab);
                const isFocused = focusedMode === mode.id;
                return (
                <DropdownMenuItem
                  key={mode.id}
                  className={cn(
                    "flex items-center gap-2 text-[length:var(--font-menu-item)]",
                    isFocused && "bg-accent",
                  )}
                  onClick={() => handleModeClick(mode.id)}
                >
                  {mode.icon}
                  <span>{mode.label}</span>
                  {isActive && <span className="ml-auto text-[10px] text-muted-foreground">on</span>}
                </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          modeRegistry.getAll().map((mode) => {
            const isActive = activeModes.includes(mode.id as RightToolbarTab);
            const isFocused = focusedMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                className={cn(
                  "flex items-center justify-center rounded transition-all",
                  isActive
                    ? cn(
                        "bg-muted text-foreground h-6 px-1.5 gap-0.5",
                        isFocused && "ring-1 ring-primary/40",
                      )
                    : "size-6 text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
                title={isActive && isFocused ? `Close ${mode.label}` : mode.label}
                onClick={() => handleModeClick(mode.id)}
              >
                {mode.icon}
                {isActive && <XIcon className="size-2.5" />}
              </button>
            );
          }))}

        <div className="mx-1 h-4 w-px bg-border/60 shrink-0" />

        {/* Editor maximize / restore */}
        <button
          type="button"
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
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
            "flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
            rightAreaExpanded && "bg-muted text-foreground",
          )}
          title="Close Panel"
          onClick={() => {
            const r = rightAreaRef.current;
            const c = centerRef.current;
            if (!r || !c) return;
            // Only save the width if not maximized — otherwise keep the last normal width
            if (!useLayoutStore.getState().editorMaximized) {
              useLayoutStore.getState().setRightAreaWidth(r.getSize().inPixels);
            }
            r.collapse();
            c.resize(9999);
          }}
        >
          <PanelRight className="size-3.5" />
        </button>
        </div>
      </div>

      {/* Tab Toolbar — only shown when a mode is focused and has an active tab */}
      {activeTab && focusedMode !== "dashboard" && (
        <TabToolbar
          onToggleSidebar={handleToggleSidebar}
          filePath={activeTab.filePath}
          projectName={projectRoot?.split(/[/\\]/).pop()}
          hideSpacer={!isEditorKind}
        >
          {activeTab && (() => {
            const def = modeRegistry.findByTabKind(activeTab.kind);
            const ToolbarComp = def?.Toolbar;
            return ToolbarComp ? <ToolbarComp tab={activeTab} /> : null;
          })()}
        </TabToolbar>
      )}

      {/* Main Content: flex layout — main expands, sidebar stays fixed width */}
      <div ref={containerElRef} className="flex flex-1 min-h-0 min-w-0 relative border-t border-border">
        {!sidebarFull && (
          <div className="flex-1 min-w-[150px]">
            <RightMainArea tabs={tabs} activeTabId={activeTabId} />
          </div>
        )}

        {rightSidebarOpen && focusedMode !== "dashboard" && (
          <>
            {!sidebarFull && (
              <SidebarDragHandle onResize={handleSidebarResize} isDraggingRef={isDraggingSidebar} onDragChange={setSidebarDragActive} />
            )}
            <div
              ref={sidebarElRef}
              className="shrink-0 overflow-hidden"
              style={{ width: sidebarFull ? "100%" : rightSidebarWidth }}
            >
              <RightSidebar fullMode={sidebarFull} />
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
