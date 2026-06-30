import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Group, Panel, Separator, usePanelRef } from "react-resizable-panels";
import { ThemeProvider, useTheme } from "next-themes";
import { useIsMobile } from "@/hooks/use-mobile";
import { leftNavRegistry } from "@/lib/workspace/left-nav";
import { registerLeftNavItems } from "@/lib/workspace/left-nav/items";
import { useLayoutStore } from "@/stores/layout-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useThemeStore } from "@/stores/theme-store";
import { useDocumentStore } from "@/stores/document-store";
import { cn } from "@/lib/utils";
import { injectDiffOverrides } from "@/lib/editor-themes/diff-overrides";
import { registerAllModes } from "@/modes/_register";
import { GlobalErrorBoundary } from "@/components/modules/shared";
import { ProjectSetupDialog, WelcomePage } from "@/components/modules/project";
import { Toaster } from "@/components/ui/sonner";
import { TabCloseConfirmDialog } from "@/components/layout/tab-close-confirm-dialog";
import { LeftSidebar } from "@/components/layout/left-sidebar";
import { LeftMainArea } from "@/components/layout/left-main-area";
import { RightArea } from "@/components/layout/right-area";
import { useAppCloseTab } from "@/hooks/use-app-close-tab";
import { useTerminalAiStream } from "@/hooks/use-terminal-ai-stream";
import { useAiTerminalSweep } from "@/hooks/use-ai-terminal-sweep";
import { useSkillsIntegrationEvents } from "@/hooks/use-skills-integration-events";

import { ContentTopBar } from "@/components/layout/content-top-bar";
import {
  expandSettingsDetailPanel,
  enforceSettingsSplitLayout,
  collapseSettingsDetailPanel,
  closeSettingsDetailPanel,
} from "@/lib/workspace/expand-settings-detail-panel";
import { hasOpenSettingsEditor } from "@/hooks/use-settings-editor";
import {
  SIDEBAR_LEFT_MIN,
  SIDEBAR_LEFT_DEFAULT,
  SIDEBAR_LEFT_MAX,
  MAIN_AREA_MIN,
  RIGHT_AREA_MIN,
  RIGHT_AREA_MAX,
  SIDEBAR_OVERLAY_THRESHOLD,
  RIGHT_AREA_DEFAULT,
} from "@/styles/constants";

const SEP = "w-px bg-border hover:bg-foreground/30 transition-colors outline-none relative after:absolute after:inset-y-0 after:-left-1 after:-right-1";

// 左侧栏导航注册（与右侧 mode 注册并列）。新入口见 left-nav/items.tsx
registerAllModes();
registerLeftNavItems();

export function App() {
  const isMobile = useIsMobile();
  const setSidebarWidth = useLayoutStore((s) => s.setSidebarWidth);
  const setRightAreaWidth = useLayoutStore((s) => s.setRightAreaWidth);
  const setSettingsDetailWidth = useLayoutStore((s) => s.setSettingsDetailWidth);
  const rightAreaExpanded = useLayoutStore((s) => s.rightAreaExpanded);
  const rightSidebarOpen = useLayoutStore((s) => s.rightSidebarOpen);
  const leftSidebarView = useLayoutStore((s) => s.leftSidebarView);
  const editorMaximized = useLayoutStore((s) => s.editorMaximized);
  const rightAreaMin = RIGHT_AREA_MIN;
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const initTheme = useThemeStore((s) => s.loadConfig);
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const showWelcome = useDocumentStore((s) => s.showWelcome);
  const isOpeningProject = useDocumentStore((s) => s.isOpeningProject);
  const setShowWelcome = useDocumentStore((s) => s.setShowWelcome);
  const inSettings = leftSidebarView === "settings";
  const settingsDetailStacked = useLayoutStore((s) => s.settingsDetailStacked);
  const settingsDetailOpen = inSettings && hasOpenSettingsEditor();

  const leftSidebarRef = usePanelRef();
  const centerRef = usePanelRef();
  const rightAreaRef = usePanelRef();

  useAppCloseTab();
  useTerminalAiStream();
  useAiTerminalSweep();
  useSkillsIntegrationEvents();

  const rightAreaExpandNonce = useLayoutStore((s) => s.rightAreaExpandNonce);
  const settingsDetailCloseNonce = useLayoutStore((s) => s.settingsDetailCloseNonce);
  const centerExpandNonce = useLayoutStore((s) => s.centerExpandNonce);

  // Programmatic RightArea expand (Browser link chips, settings detail, etc.)
  useLayoutEffect(() => {
    if (rightAreaExpandNonce === 0) return;
    const r = rightAreaRef.current;
    const c = centerRef.current;
    if (!r) return;
    const st = useLayoutStore.getState();
    // Maximized editor: RightArea already full width — do not shrink or restore center.
    if (st.editorMaximized) return;
    if (st.leftSidebarView === "settings" && hasOpenSettingsEditor()) {
      expandSettingsDetailPanel({
        centerRef: c,
        rightAreaRef: r,
        mainAreaWidthPx: measureMainAreaFallback(),
      });
      return;
    }
    const width = st.rightAreaWidth || RIGHT_AREA_DEFAULT;
    if (isMobile) {
      r.resize(9999);
      c?.collapse();
    } else if (r.isCollapsed()) {
      r.resize(width);
      c?.expand();
    }
    // Already visible — preserve the user's split; do not force resize.
  }, [rightAreaExpandNonce, isMobile]);

  // Programmatic settings detail close (editor Cancel/Save, etc.)
  useLayoutEffect(() => {
    if (settingsDetailCloseNonce === 0) return;
    closeSettingsDetailPanel(centerRef.current, rightAreaRef.current);
  }, [settingsDetailCloseNonce]);

  function measureMainAreaFallback(): number {
    const left = leftSidebarRef.current?.getSize().inPixels ?? 0;
    return Math.max(window.innerWidth - left, 0);
  }

  // Programmatic center (Chat) expand — terminal snippet insert, etc.
  useLayoutEffect(() => {
    if (centerExpandNonce === 0) return;
    const c = centerRef.current;
    if (!c?.isCollapsed()) return;
    c.expand();
  }, [centerExpandNonce]);

  // RightArea starts collapsed
  useLayoutEffect(() => { if (projectRoot) rightAreaRef.current?.collapse(); }, [projectRoot]);

  // Sidebar overlay threshold: below 500px, sidebar opens as fullscreen overlay.
  // Throttled via requestAnimationFrame — the native resize event can fire faster
  // than 60fps during a window corner drag, causing unnecessary panel API calls
  // and layout thrashing. Coalescing to one check per frame eliminates this.
  const belowOverlayThreshold = useRef(false);
  useLayoutEffect(() => {
    let rafId: number | null = null;
    const check = () => {
      if (rafId !== null) return; // Already scheduled for this frame
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const narrow = window.innerWidth < SIDEBAR_OVERLAY_THRESHOLD;
        const st = useLayoutStore.getState();
        const left = leftSidebarRef.current;

        if (narrow && !belowOverlayThreshold.current) {
          // Crossed below threshold: collapse panel, close any overlay
          if (st.leftSidebarOverlay) st.setLeftSidebarOverlay(false);
          left?.collapse();
          belowOverlayThreshold.current = true;
        } else if (!narrow && belowOverlayThreshold.current) {
          // Crossed above threshold: close overlay, restore panel
          if (st.leftSidebarOverlay) st.setLeftSidebarOverlay(false);
          left?.resize(Math.min(st.sidebarWidth || SIDEBAR_LEFT_DEFAULT, SIDEBAR_LEFT_MAX));
          belowOverlayThreshold.current = false;
        } else if (!narrow && st.leftSidebarOverlay) {
          // Safety net: on wide windows, never allow overlay to persist
          st.setLeftSidebarOverlay(false);
        }
      });
    };
    check();
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("resize", check);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  // Mobile (<768px): collapse workspace right area (settings uses stacked detail instead).
  useLayoutEffect(() => {
    if (!isMobile || inSettings) return;
    const right = rightAreaRef.current;
    if (right && !right.isCollapsed() && !useLayoutStore.getState().editorMaximized) {
      right.collapse();
    }
  }, [isMobile, inSettings]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Initialize theme system (injects <style id="prism-theme">)
  useEffect(() => {
    initTheme();
  }, [initTheme]);

  // Inject diff override CSS once (native <style> tag — beats all CM6 theme CSS)
  useEffect(() => {
    injectDiffOverrides();
  }, []);

  // Sync native vibrancy to next-themes resolved theme
  const { resolvedTheme } = useTheme();
  const glassEffect = useThemeStore((s) => s.config.glassEffect);

  useEffect(() => {
    if (glassEffect && resolvedTheme) {
      window.electronAPI.themeSetGlassMode(
        resolvedTheme as "light" | "dark" | "system"
      ).catch(() => {});
    }
  }, [resolvedTheme, glassEffect]);

  // Auto-collapse RightArea when entering immersive center views (leftNavRegistry.isImmersiveCenterView)
  useEffect(() => {
    const r = rightAreaRef.current;
    const st = useLayoutStore.getState();
    if (!r) return;
    if (leftNavRegistry.isImmersiveCenterView(leftSidebarView)) {
      if (st.editorMaximized) st.setEditorMaximized(false);
      if (!r.isCollapsed()) {
        st.setRightAreaWidth(r.getSize().inPixels);
        r.collapse();
        centerRef.current?.resize(9999);
        st.setPendingRightAreaRestore(true);
      }
    } else if (st.pendingRightAreaRestore && r.isCollapsed()) {
      r.resize(st.rightAreaWidth);
      st.setPendingRightAreaRestore(false);
    }
  }, [leftSidebarView]);

  // Settings: keep list visible in split mode; collapse detail pane when no editor is open.
  useEffect(() => {
    if (!inSettings) return;
    const st = useLayoutStore.getState();
    if (st.editorMaximized) st.setEditorMaximized(false);

    if (!hasOpenSettingsEditor()) {
      st.setSettingsDetailStacked(false);
      st.setRightAreaExpanded(false);
      const r = rightAreaRef.current;
      if (r && !r.isCollapsed()) {
        collapseSettingsDetailPanel(centerRef.current, r);
      } else {
        centerRef.current?.expand();
      }
      return;
    }
  }, [inSettings, settingsDetailOpen]);

  // Settings stacked mode: apply panel sizes after React has committed
  // the center panel's collapsible/minSize props for stacked layout.
  useLayoutEffect(() => {
    if (!inSettings || !hasOpenSettingsEditor() || !settingsDetailStacked) return;
    const r = rightAreaRef.current;
    const c = centerRef.current;
    if (!r) return;

    const st = useLayoutStore.getState();
    st.setRightAreaExpanded(true);
    if (r.isCollapsed()) r.expand();
    c?.collapse();
    r.resize(Math.max(measureMainAreaFallback(), RIGHT_AREA_MIN));
  }, [inSettings, settingsDetailOpen, settingsDetailStacked]);

  // Leaving settings: tear down shared right panel state so it does not leak into workspace.
  const prevInSettingsRef = useRef(inSettings);
  useLayoutEffect(() => {
    const exitingSettings = prevInSettingsRef.current && !inSettings;
    prevInSettingsRef.current = inSettings;
    if (!exitingSettings) return;

    const st = useLayoutStore.getState();
    const r = rightAreaRef.current;
    const c = centerRef.current;
    if (!r) return;

    st.setSettingsDetailStacked(false);

    const shouldRestore = st.pendingRightAreaRestore;
    if (shouldRestore) st.clearPendingRightAreaRestore();

    if (hasOpenSettingsEditor()) {
      closeSettingsDetailPanel(c, r);
      if (shouldRestore) {
        r.expand();
        r.resize(st.rightAreaWidth || RIGHT_AREA_DEFAULT);
        st.setRightAreaExpanded(true);
        c?.expand();
      }
      return;
    }

    if (!r.isCollapsed()) {
      st.setRightAreaExpanded(false);
      r.collapse();
      c?.expand();
    }

    if (shouldRestore) {
      r.expand();
      r.resize(st.rightAreaWidth || RIGHT_AREA_DEFAULT);
      st.setRightAreaExpanded(true);
      c?.expand();
    }
  }, [inSettings]);

  // Rebalance settings detail when the window is resized.
  useEffect(() => {
    if (!inSettings) return;
    let rafId: number | null = null;
    const onResize = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const st = useLayoutStore.getState();
        if (st.leftSidebarView !== "settings") return;
        if (!hasOpenSettingsEditor()) return;
        const r = rightAreaRef.current;
        if (!r) return;
        expandSettingsDetailPanel({
          centerRef: centerRef.current,
          rightAreaRef: r,
          mainAreaWidthPx: measureMainAreaFallback(),
        });
      });
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [inSettings]);

  useEffect(() => {
    if (projectRoot || !showWelcome) return;
    const st = useSettingsStore.getState();
    if (!st.loaded) {
      const unsub = useSettingsStore.subscribe((s) => {
        if (s.loaded) {
          unsub();
          autoOpen(s.settings.lastProjectPath);
        }
      });
      return;
    }
    autoOpen(st.settings.lastProjectPath);

    async function autoOpen(path?: string | null) {
      if (!path) {
        setAutoOpenChecked(true); // no project → show welcome
        return;
      }
      try {
        const exists = await window.electronAPI.fsExists(path);
        if (exists) {
          await useDocumentStore.getState().openProject(path);
        } else {
          setAutoOpenChecked(true); // path doesn't exist → show welcome
        }
      } catch {
        setAutoOpenChecked(true);
      }
    }
  }, []);

  // ── Startup loading screen lifecycle ──
  // The loading screen stays visible until ONE of these is true:
  //   a) Welcome page is shown AND auto-open has confirmed no project
  //   b) A project has finished loading (projectRoot set, isOpeningProject false)
  const settingsLoaded = useSettingsStore((s) => s.loaded);
  const [autoOpenChecked, setAutoOpenChecked] = useState(false);
  const appReady =
    settingsLoaded &&
    ((showWelcome && autoOpenChecked) || !showWelcome || (projectRoot && !isOpeningProject));

  useEffect(() => {
    if (!appReady) return;
    // ?freeze-splash keeps the loading screen on for design iteration
    if ((window as any).__FREEZE_SPLASH__) return;
    const el = document.getElementById("L");
    if (!el) return;
    el.remove();
  }, [appReady]);

  return (
    <GlobalErrorBoundary>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <ProjectSetupDialog />
        <Toaster
          position="bottom-right"
          duration={5000}
          visibleToasts={5}
          closeButton
          richColors
        />
        <TabCloseConfirmDialog />
        {showWelcome ? (
          <WelcomePage onSkip={() => setShowWelcome(false)} />
        ) : projectRoot ? (
          <div className="flex flex-col h-full" key={projectRoot}>
            {/* Subtle loading bar during project open / switch */}
            {isOpeningProject && (
              <div className="h-0.5 w-full bg-muted overflow-hidden shrink-0">
                <div className="h-full w-1/3 bg-primary rounded-r-full"
                  style={{ animation: "loading-bar 1.2s ease-in-out infinite" }} />
              </div>
            )}
            <Group
              id="main-layout"
              orientation="horizontal"
              className="flex-1 min-h-0"
              resizeTargetMinimumSize={{ fine: 5, coarse: 5 }}
            >
              <Panel
                id="left-sidebar"
                panelRef={leftSidebarRef}
                collapsible
                collapsedSize={0}
                minSize={SIDEBAR_LEFT_MIN}
                maxSize={SIDEBAR_LEFT_MAX}
                className="overflow-hidden"
                defaultSize={window.innerWidth < SIDEBAR_OVERLAY_THRESHOLD ? 0 : Math.min(useLayoutStore.getState().sidebarWidth, SIDEBAR_LEFT_MAX)}
                groupResizeBehavior="preserve-pixel-size"
                onResize={(s) => {
                  const st = useLayoutStore.getState();
                  st.setSidebarFullyCollapsed(s.inPixels <= 0.5);
                  // Only save width when panel is expanded (>= 30px threshold)
                  // to prevent collapse animation from polluting sidebarWidth
                  if (s.inPixels >= 30) setSidebarWidth(s.inPixels);
                  if (s.inPixels < 30 && st.sidebarExpanded) st.setSidebarExpanded(false);
                  if (s.inPixels >= 30 && !st.sidebarExpanded) st.setSidebarExpanded(true);
                  const immersiveView = leftNavRegistry.isImmersiveCenterView(st.leftSidebarView);
                  if (s.inPixels === 0 && st.editorMaximized && !immersiveView) {
                    rightAreaRef.current?.resize(9999);
                  }
                }}
              >
                <LeftSidebar leftSidebarRef={leftSidebarRef} centerRef={centerRef} rightAreaRef={rightAreaRef} />
              </Panel>

              <Separator id="sep-sidebar" className={SEP} />

              <Panel id="main-area" minSize={MAIN_AREA_MIN}>
                <Group
                  id="center-right"
                  orientation="horizontal"
                  className="h-full"
                  resizeTargetMinimumSize={{ fine: 5, coarse: 5 }}
                >
                  <Panel
                    id="center"
                    panelRef={centerRef}
                    collapsible={!inSettings || settingsDetailStacked}
                    collapsedSize={0}
                    minSize={inSettings && settingsDetailStacked ? 0 : MAIN_AREA_MIN}
                    className="overflow-hidden"
                    groupResizeBehavior="preserve-pixel-size"
                    onResize={(s) => {
                      const st = useLayoutStore.getState();
                      if (inSettings) {
                        if (!st.settingsDetailStacked) {
                          enforceSettingsSplitLayout(
                            centerRef.current,
                            rightAreaRef.current,
                          );
                        }
                        return;
                      }
                      const immersiveView = leftNavRegistry.isImmersiveCenterView(st.leftSidebarView);
                      if (!immersiveView) {
                        if (s.inPixels < 20 && !st.editorMaximized) st.setEditorMaximized(true);
                        if (s.inPixels >= 20 && st.editorMaximized) st.setEditorMaximized(false);
                      }
                    }}
                  >
                    <div className="flex flex-col h-full min-w-0">
                      <ContentTopBar
                        leftSidebarRef={leftSidebarRef}
                        centerRef={centerRef}
                        rightAreaRef={rightAreaRef}
                      />
                      <div className="flex-1 min-h-0">
                        <LeftMainArea />
                      </div>
                    </div>
                  </Panel>

                  <Separator
                    id="sep-center-right"
                    className={cn(SEP, ((editorMaximized && !inSettings) || !rightAreaExpanded) && "w-0")}
                    disabled={(editorMaximized && !inSettings) || (inSettings && settingsDetailStacked)}
                  />

                  <Panel
                    id="right-area"
                    panelRef={rightAreaRef}
                    collapsible
                    collapsedSize={0}
                    minSize={
                      inSettings
                        ? (settingsDetailOpen ? rightAreaMin : 0)
                        : rightAreaMin
                    }
                    defaultSize={0}
                    groupResizeBehavior="preserve-pixel-size"
                    onResize={(s) => {
                      const st = useLayoutStore.getState();
                      const r = rightAreaRef.current;
                      if (inSettings && !hasOpenSettingsEditor()) {
                        if (st.settingsDetailStacked) {
                          st.setSettingsDetailStacked(false);
                        }
                        if (s.inPixels >= 30) {
                          r?.collapse();
                          st.setRightAreaExpanded(false);
                        }
                        return;
                      }

                      const settingsSlotOpen = inSettings && hasOpenSettingsEditor();

                      if (s.inPixels < 30) {
                        if (st.rightAreaExpanded) st.setRightAreaExpanded(false);
                        if (r && !r.isCollapsed()) {
                          r.collapse();
                        }
                        return;
                      }

                      if (!st.editorMaximized || inSettings) {
                        if (settingsSlotOpen && !st.settingsDetailStacked) {
                          setSettingsDetailWidth(Math.min(s.inPixels, RIGHT_AREA_MAX));
                        } else if (!inSettings) {
                          setRightAreaWidth(Math.min(Math.max(s.inPixels, RIGHT_AREA_MIN), RIGHT_AREA_MAX));
                        }
                      }
                      if (!st.rightAreaExpanded) st.setRightAreaExpanded(true);
                      if (inSettings && !st.settingsDetailStacked && s.inPixels >= 30) {
                        enforceSettingsSplitLayout(
                          centerRef.current,
                          rightAreaRef.current,
                        );
                      }
                    }}
                  >
                    <RightArea
                      leftSidebarRef={leftSidebarRef}
                      centerRef={centerRef}
                      rightAreaRef={rightAreaRef}
                    />
                  </Panel>
                </Group>
              </Panel>
            </Group>

          </div>
        ) : (
          <div className="flex flex-col h-full">
            <Group
              id="main-layout"
              orientation="horizontal"
              className="flex-1 min-h-0"
              resizeTargetMinimumSize={{ fine: 5, coarse: 5 }}
            >
              <Panel
                id="left-sidebar"
                panelRef={leftSidebarRef}
                collapsible
                collapsedSize={0}
                minSize={SIDEBAR_LEFT_MIN}
                maxSize={SIDEBAR_LEFT_MAX}
                className="overflow-hidden"
                defaultSize={window.innerWidth < SIDEBAR_OVERLAY_THRESHOLD ? 0 : Math.min(useLayoutStore.getState().sidebarWidth, SIDEBAR_LEFT_MAX)}
                groupResizeBehavior="preserve-pixel-size"
                onResize={(s) => {
                  const st = useLayoutStore.getState();
                  st.setSidebarFullyCollapsed(s.inPixels <= 0.5);
                  if (s.inPixels >= 30) setSidebarWidth(s.inPixels);
                  if (s.inPixels < 30 && st.sidebarExpanded) st.setSidebarExpanded(false);
                  if (s.inPixels >= 30 && !st.sidebarExpanded) st.setSidebarExpanded(true);
                }}
              >
                <LeftSidebar leftSidebarRef={leftSidebarRef} centerRef={centerRef} rightAreaRef={rightAreaRef} />
              </Panel>

              <Separator id="sep-sidebar" className={SEP} />

              <Panel id="main-area" minSize={MAIN_AREA_MIN}>
                <div className="flex flex-col h-full min-w-0">
                  <ContentTopBar leftSidebarRef={leftSidebarRef} />
                  <div className="flex-1 min-h-0">
                    <LeftMainArea />
                  </div>
                </div>
              </Panel>
            </Group>

          </div>
        )}
      </ThemeProvider>
    </GlobalErrorBoundary>
  );
}
