import { useEffect, useLayoutEffect, useRef } from "react";
import { Group, Panel, Separator, usePanelRef } from "react-resizable-panels";
import { ThemeProvider } from "next-themes";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLayoutStore } from "@/stores/layout-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useDocumentStore } from "@/stores/document-store";
import { GlobalErrorBoundary } from "@/components/modules/shared";
import { ProjectSetupDialog, WelcomePage } from "@/components/modules/project";
import { TitleBar } from "@/components/layout/title-bar";
import { LeftSidebar } from "@/components/layout/left-sidebar";
import { LeftMainArea } from "@/components/layout/left-main-area";
import { RightArea } from "@/components/layout/right-area";
import { BottomBar } from "@/components/layout/bottom-bar";
import {
  SIDEBAR_LEFT_MIN,
  SIDEBAR_LEFT_DEFAULT,
  RIGHT_AREA_MIN,
  SIDEBAR_OVERLAY_THRESHOLD,
} from "@/styles/constants";

const SEP = "w-px bg-border hover:bg-primary/40 transition-colors outline-none";

export function App() {
  const isMobile = useIsMobile();
  const setSidebarWidth = useLayoutStore((s) => s.setSidebarWidth);
  const setRightAreaWidth = useLayoutStore((s) => s.setRightAreaWidth);
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
        left?.resize(st.sidebarWidth || SIDEBAR_LEFT_DEFAULT);
        belowOverlayThreshold.current = false;
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
          <div className="flex h-full flex-col" key={projectRoot}>
            <TitleBar
              leftSidebarRef={leftSidebarRef}
              centerRef={centerRef}
              rightAreaRef={rightAreaRef}
            />
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
                defaultSize={window.innerWidth < SIDEBAR_OVERLAY_THRESHOLD ? 0 : useLayoutStore.getState().sidebarWidth}
                groupResizeBehavior="preserve-pixel-size"
                onResize={(s) => {
                  if (s.inPixels > 0) setSidebarWidth(s.inPixels);
                  const st = useLayoutStore.getState();
                  if (s.inPixels === 0 && st.sidebarExpanded) st.setSidebarExpanded(false);
                  if (s.inPixels > 0 && !st.sidebarExpanded) st.setSidebarExpanded(true);
                  if (s.inPixels === 0 && st.editorMaximized) {
                    rightAreaRef.current?.resize(9999);
                  }
                }}
              >
                <LeftSidebar />
              </Panel>

              <Separator id="sep-sidebar" className={SEP} />

              <Panel id="main-area" minSize={300}>
                <Group
                  id="center-right"
                  orientation="horizontal"
                  resizeTargetMinimumSize={{ fine: 5, coarse: 5 }}
                >
                  <Panel id="center" panelRef={centerRef} collapsible collapsedSize={0} minSize={300}
                    onResize={(s) => {
                      const st = useLayoutStore.getState();
                      if (s.inPixels === 0 && !st.editorMaximized) st.setEditorMaximized(true);
                      if (s.inPixels > 0 && st.editorMaximized) st.setEditorMaximized(false);
                    }}
                  >
                    <LeftMainArea />
                  </Panel>

                  <Separator id="sep-center-right" className={SEP} />

                  <Panel
                    id="right-area"
                    panelRef={rightAreaRef}
                    collapsible
                    collapsedSize={0}
                    minSize={RIGHT_AREA_MIN}
                    defaultSize={0}
                    onResize={(s) => {
                      const st = useLayoutStore.getState();
                      if (s.inPixels > 0 && !st.editorMaximized) setRightAreaWidth(s.inPixels);
                      if (s.inPixels === 0 && st.rightAreaExpanded) st.setRightAreaExpanded(false);
                      if (s.inPixels > 0 && !st.rightAreaExpanded) st.setRightAreaExpanded(true);
                    }}
                  >
                    <RightArea centerRef={centerRef} rightAreaRef={rightAreaRef} />
                  </Panel>
                </Group>
              </Panel>
            </Group>
            <BottomBar />
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <TitleBar
              leftSidebarRef={leftSidebarRef}
              centerRef={centerRef}
              rightAreaRef={rightAreaRef}
            />
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
                defaultSize={window.innerWidth < SIDEBAR_OVERLAY_THRESHOLD ? 0 : useLayoutStore.getState().sidebarWidth}
                groupResizeBehavior="preserve-pixel-size"
                onResize={(s) => {
                  if (s.inPixels > 0) setSidebarWidth(s.inPixels);
                  const st = useLayoutStore.getState();
                  if (s.inPixels === 0 && st.sidebarExpanded) st.setSidebarExpanded(false);
                  if (s.inPixels > 0 && !st.sidebarExpanded) st.setSidebarExpanded(true);
                }}
              >
                <LeftSidebar />
              </Panel>

              <Separator id="sep-sidebar" className={SEP} />

              <Panel id="main-area" minSize={300}>
                <LeftMainArea />
              </Panel>
            </Group>
            <BottomBar />
          </div>
        )}
      </ThemeProvider>
    </GlobalErrorBoundary>
  );
}
