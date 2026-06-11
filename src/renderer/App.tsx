import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Group, Panel, Separator, usePanelRef } from "react-resizable-panels";
import { ThemeProvider, useTheme } from "next-themes";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLayoutStore } from "@/stores/layout-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useDocumentStore } from "@/stores/document-store";
import { cn } from "@/lib/utils";
import { registerAllModes } from "@/modes/_register";
import { GlobalErrorBoundary } from "@/components/modules/shared";
import { ProjectSetupDialog, WelcomePage } from "@/components/modules/project";
import { Toaster } from "@/components/ui/sonner";
import { LeftSidebar } from "@/components/layout/left-sidebar";
import { LeftMainArea } from "@/components/layout/left-main-area";
import { RightArea } from "@/components/layout/right-area";

import { ContentTopBar } from "@/components/layout/content-top-bar";
import {
  SIDEBAR_LEFT_MIN,
  SIDEBAR_LEFT_DEFAULT,
  SIDEBAR_LEFT_MAX,
  MAIN_AREA_MIN,
  RIGHT_AREA_MIN,
  SIDEBAR_OVERLAY_THRESHOLD,
} from "@/styles/constants";

const SEP = "w-px bg-border hover:bg-foreground/30 transition-colors outline-none relative after:absolute after:inset-y-0 after:-left-1 after:-right-1";

// Register all RightArea modes before any component renders
registerAllModes();

export function App() {
  const isMobile = useIsMobile();
  const setSidebarWidth = useLayoutStore((s) => s.setSidebarWidth);
  const setRightAreaWidth = useLayoutStore((s) => s.setRightAreaWidth);
  const rightAreaExpanded = useLayoutStore((s) => s.rightAreaExpanded);
  const rightSidebarOpen = useLayoutStore((s) => s.rightSidebarOpen);
  const leftSidebarView = useLayoutStore((s) => s.leftSidebarView);
  const editorMaximized = useLayoutStore((s) => s.editorMaximized);
  const rightAreaMin = RIGHT_AREA_MIN;
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const showWelcome = useDocumentStore((s) => s.showWelcome);
  const isOpeningProject = useDocumentStore((s) => s.isOpeningProject);
  const setShowWelcome = useDocumentStore((s) => s.setShowWelcome);

  const leftSidebarRef = usePanelRef();
  const centerRef = usePanelRef();
  const rightAreaRef = usePanelRef();

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

  // Mobile (<768px): collapse right area
  useLayoutEffect(() => {
    if (!isMobile) return;
    const right = rightAreaRef.current;
    if (right && !right.isCollapsed() && !useLayoutStore.getState().editorMaximized) {
      right.collapse();
    }
  }, [isMobile]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Apply theme color scheme from settings
  const themeColor = useSettingsStore((s) => s.settings.themeColor);
  useEffect(() => {
    document.documentElement.dataset.themeColor = themeColor || "academic-blue";
  }, [themeColor]);

  // Apply glass transparency settings
  const { setTheme } = useTheme();
  const glassEffect = useSettingsStore((s) => s.settings.glassEffect);
  const glassIntensity = useSettingsStore((s) => s.settings.glassIntensity);
  useEffect(() => {
    const root = document.documentElement;
    if (!glassEffect) {
      root.dataset.glass = "off";
      root.style.removeProperty("--glass-border-light");
      root.style.removeProperty("--glass-border-dark");
      return;
    }
    // Glass requires native vibrancy, whose tint follows the *system* appearance.
    // When the app theme mismatches the system, the vibrancy tint bleeds through
    // semi-transparent surfaces and corrupts the color palette. Force System theme
    // to keep the two in sync.
    setTheme("system");
    delete root.dataset.glass;

    // 5 intensity presets: 1 = most solid, 5 = most transparent
    // Opacities kept in a tighter range so body/sidebar/content feel uniform
    // borderLight: overrides --border in light mode — glass makes light
    // borders invisible, so we darken them proportional to glass intensity.
    const presets: Record<number, Record<string, string>> = {
      1: { dark:  "74%", light:  "78%", sidebarDark:  "70%", sidebarLight:  "75%",
           toolbarDark:  "82%", toolbarLight:  "84%", contentDark:  "86%", contentLight:  "88%",
           borderLight: "oklch(0.90 0.002 0)", borderDark: "oklch(0.24 0.002 0)" },
      2: { dark:  "64%", light:  "68%", sidebarDark:  "57%", sidebarLight:  "63%",
           toolbarDark:  "73%", toolbarLight:  "76%", contentDark:  "77%", contentLight:  "80%",
           borderLight: "oklch(0.88 0.002 0)", borderDark: "oklch(0.26 0.002 0)" },
      3: { dark:  "56%", light:  "60%", sidebarDark:  "50%", sidebarLight:  "55%",
           toolbarDark:  "63%", toolbarLight:  "66%", contentDark:  "70%", contentLight:  "74%",
           borderLight: "oklch(0.86 0.002 0)", borderDark: "oklch(0.28 0.002 0)" },
      4: { dark:  "48%", light:  "52%", sidebarDark:  "43%", sidebarLight:  "47%",
           toolbarDark:  "53%", toolbarLight:  "56%", contentDark:  "63%", contentLight:  "66%",
           borderLight: "oklch(0.84 0.002 0)", borderDark: "oklch(0.30 0.002 0)" },
      5: { dark:  "40%", light:  "44%", sidebarDark:  "36%", sidebarLight:  "40%",
           toolbarDark:  "43%", toolbarLight:  "46%", contentDark:  "56%", contentLight:  "60%",
           borderLight: "oklch(0.84 0.002 0)", borderDark: "oklch(0.32 0.002 0)" },
    };
    const p = presets[glassIntensity ?? 3];
    const style = root.style;
    style.setProperty("--glass-body-dark", p.dark);
    style.setProperty("--glass-body-light", p.light);
    style.setProperty("--glass-sidebar-dark", p.sidebarDark);
    style.setProperty("--glass-sidebar-light", p.sidebarLight);
    style.setProperty("--glass-toolbar-dark", p.toolbarDark);
    style.setProperty("--glass-toolbar-light", p.toolbarLight);
    style.setProperty("--glass-content-dark", p.contentDark);
    style.setProperty("--glass-content-light", p.contentLight);
    style.setProperty("--glass-border-light", p.borderLight);
    style.setProperty("--glass-border-dark", p.borderDark);
  }, [glassEffect, glassIntensity, setTheme]);

  // Auto-collapse RightArea when entering settings/templates, restore on exit
  const savedRightArea = useRef(false);
  useEffect(() => {
    const r = rightAreaRef.current;
    const st = useLayoutStore.getState();
    if (!r) return;
    if (leftSidebarView === "settings" || leftSidebarView === "templates") {
      if (!r.isCollapsed()) {
        st.setRightAreaWidth(r.getSize().inPixels);
        r.collapse();
        centerRef.current?.resize(9999);
      }
      savedRightArea.current = true;
    } else {
      if (savedRightArea.current && r.isCollapsed()) {
        r.resize(st.rightAreaWidth);
        savedRightArea.current = false;
      }
    }
  }, [leftSidebarView]);

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
        {showWelcome ? (
          <WelcomePage onSkip={() => setShowWelcome(false)} />
        ) : projectRoot ? (
          <div className="flex flex-col h-full select-none" key={projectRoot}>
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
                  if (s.inPixels === 0 && st.editorMaximized) {
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
                  <Panel id="center" panelRef={centerRef} collapsible collapsedSize={0} minSize={MAIN_AREA_MIN} className="overflow-hidden"
                    onResize={(s) => {
                      const st = useLayoutStore.getState();
                      if (s.inPixels < 20 && !st.editorMaximized) st.setEditorMaximized(true);
                      if (s.inPixels >= 20 && st.editorMaximized) st.setEditorMaximized(false);
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

                  <Separator id="sep-center-right" className={cn(SEP, (editorMaximized || !rightAreaExpanded) && "w-0")} disabled={editorMaximized} />

                  <Panel
                    id="right-area"
                    panelRef={rightAreaRef}
                    collapsible
                    collapsedSize={0}
                    minSize={rightAreaMin}
                    defaultSize={0}
                    onResize={(s) => {
                      const st = useLayoutStore.getState();
                      // Only save width when panel is expanded (>= 30px threshold)
                      // to prevent collapse animation from polluting rightAreaWidth
                      if (s.inPixels >= 30 && !st.editorMaximized) setRightAreaWidth(s.inPixels);
                      if (s.inPixels < 30 && st.rightAreaExpanded) st.setRightAreaExpanded(false);
                      if (s.inPixels >= 30 && !st.rightAreaExpanded) st.setRightAreaExpanded(true);
                    }}
                  >
                    <RightArea leftSidebarRef={leftSidebarRef} centerRef={centerRef} rightAreaRef={rightAreaRef} />
                  </Panel>
                </Group>
              </Panel>
            </Group>

          </div>
        ) : (
          <div className="flex flex-col h-full select-none">
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
