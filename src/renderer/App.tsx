import { useEffect, useLayoutEffect, useRef } from "react";
import { Group, Panel, Separator, usePanelRef } from "react-resizable-panels";
import { ThemeProvider } from "next-themes";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLayoutStore } from "@/stores/layout-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useDocumentStore } from "@/stores/document-store";
import { cn } from "@/lib/utils";
import { GlobalErrorBoundary } from "@/components/modules/shared";
import { ProjectSetupDialog, WelcomePage } from "@/components/modules/project";
import { LeftSidebar } from "@/components/layout/left-sidebar";
import { LeftMainArea } from "@/components/layout/left-main-area";
import { RightArea } from "@/components/layout/right-area";
import { BottomBar } from "@/components/layout/bottom-bar";
import { ContentTopBar } from "@/components/layout/content-top-bar";
import {
  SIDEBAR_LEFT_MIN,
  SIDEBAR_LEFT_DEFAULT,
  SIDEBAR_LEFT_MAX,
  RIGHT_AREA_MIN,
  SIDEBAR_OVERLAY_THRESHOLD,
} from "@/styles/constants";

const SEP = "w-px bg-border hover:bg-primary/40 transition-colors outline-none";

export function App() {
  const isMobile = useIsMobile();
  const setSidebarWidth = useLayoutStore((s) => s.setSidebarWidth);
  const setRightAreaWidth = useLayoutStore((s) => s.setRightAreaWidth);
  const rightAreaExpanded = useLayoutStore((s) => s.rightAreaExpanded);
  const editorMaximized = useLayoutStore((s) => s.editorMaximized);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const showWelcome = useDocumentStore((s) => s.showWelcome);
  const setShowWelcome = useDocumentStore((s) => s.setShowWelcome);

  const leftSidebarRef = usePanelRef();
  const centerRef = usePanelRef();
  const rightAreaRef = usePanelRef();

  // RightArea starts collapsed
  useLayoutEffect(() => { if (projectRoot) rightAreaRef.current?.collapse(); }, [projectRoot]);

  // Sidebar overlay threshold: below 500px, sidebar opens as fullscreen overlay
  const belowOverlayThreshold = useRef(false);
  useLayoutEffect(() => {
    const check = () => {
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
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
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

  useEffect(() => {
    if (projectRoot || !showWelcome) return;
    window.electronAPI.settingsGet().then(async (settings) => {
      if (settings.lastProjectPath) {
        try {
          const exists = await window.electronAPI.fsExists(settings.lastProjectPath);
          if (exists) {
            const docState = useDocumentStore.getState();
            await docState.openProject(settings.lastProjectPath);
          }
        } catch {}
      }
    });
  }, []);

  return (
    <GlobalErrorBoundary>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <ProjectSetupDialog />
        {showWelcome ? (
          <WelcomePage onSkip={() => setShowWelcome(false)} />
        ) : projectRoot ? (
          <div className="flex flex-col h-full" key={projectRoot}>
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
                <LeftSidebar leftSidebarRef={leftSidebarRef} />
              </Panel>

              <Separator id="sep-sidebar" className={SEP} />

              <Panel id="main-area" minSize={300}>
                <Group
                  id="center-right"
                  orientation="horizontal"
                  className="h-full"
                  resizeTargetMinimumSize={{ fine: 5, coarse: 5 }}
                >
                  <Panel id="center" panelRef={centerRef} collapsible collapsedSize={0} minSize={300}
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
                    minSize={RIGHT_AREA_MIN}
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
            <BottomBar />
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
                <LeftSidebar leftSidebarRef={leftSidebarRef} />
              </Panel>

              <Separator id="sep-sidebar" className={SEP} />

              <Panel id="main-area" minSize={300}>
                <div className="flex flex-col h-full min-w-0">
                  <ContentTopBar leftSidebarRef={leftSidebarRef} />
                  <div className="flex-1 min-h-0">
                    <LeftMainArea />
                  </div>
                </div>
              </Panel>
            </Group>
            <BottomBar />
          </div>
        )}
      </ThemeProvider>
    </GlobalErrorBoundary>
  );
}
