import { useEffect, useLayoutEffect } from "react";
import { Group, Panel, Separator, usePanelRef } from "react-resizable-panels";
import { ThemeProvider } from "next-themes";
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
  RIGHT_AREA_DEFAULT,
} from "@/styles/constants";

const SEP = "w-px bg-border hover:bg-primary/40 transition-colors outline-none";

export function App() {
  const editorMaximized = useLayoutStore((s) => s.editorMaximized);
  const setSidebarWidth = useLayoutStore((s) => s.setSidebarWidth);
  const setRightAreaWidth = useLayoutStore((s) => s.setRightAreaWidth);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const projectRoot = useDocumentStore((s) => s.projectRoot);

  const leftSidebarRef = usePanelRef();
  const centerRef = usePanelRef();
  const rightAreaRef = usePanelRef();

  useLayoutEffect(() => { if (projectRoot) rightAreaRef.current?.collapse(); }, [projectRoot]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (projectRoot) return;
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
        {!projectRoot ? (
          <WelcomePage />
        ) : (
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
                maxSize="35%"
                defaultSize={SIDEBAR_LEFT_DEFAULT}
                groupResizeBehavior="preserve-pixel-size"
                onResize={(s) => {
                  setSidebarWidth(s.inPixels);
                  const st = useLayoutStore.getState();
                  if (s.inPixels === 0 && st.sidebarExpanded) st.setSidebarExpanded(false);
                  if (s.inPixels > 0 && !st.sidebarExpanded) st.setSidebarExpanded(true);
                  if (s.inPixels > 0 && s.inPixels < SIDEBAR_LEFT_MIN) leftSidebarRef.current?.collapse();
                  if (s.inPixels === 0 && st.editorMaximized) {
                    rightAreaRef.current?.resize(9999);
                  }
                }}
              >
                <LeftSidebar />
              </Panel>

              <Separator id="sep-sidebar" className={SEP} />

              <Panel id="main-area" minSize={200}>
                <Group
                  id="center-right"
                  orientation="horizontal"
                  resizeTargetMinimumSize={{ fine: 5, coarse: 5 }}
                >
                  <Panel id="center" panelRef={centerRef} collapsible collapsedSize={0} minSize={200}
                    onResize={(s) => {
                      const st = useLayoutStore.getState();
                      if (s.inPixels === 0 && !st.editorMaximized) st.setEditorMaximized(true);
                      if (s.inPixels > 0 && st.editorMaximized) st.setEditorMaximized(false);
                    }}
                  >
                    <LeftMainArea />
                  </Panel>

                  <Separator id="sep-center-right" className={SEP} disabled={editorMaximized} />

                  <Panel
                    id="right-area"
                    panelRef={rightAreaRef}
                    collapsible
                    collapsedSize={0}
                    minSize={RIGHT_AREA_MIN}
                    defaultSize={RIGHT_AREA_DEFAULT}
                    groupResizeBehavior="preserve-pixel-size"
                    onResize={(s) => {
                      setRightAreaWidth(s.inPixels);
                      const st = useLayoutStore.getState();
                      if (s.inPixels === 0 && st.rightAreaExpanded) st.setRightAreaExpanded(false);
                      if (s.inPixels > 0 && !st.rightAreaExpanded) st.setRightAreaExpanded(true);
                      if (s.inPixels > 0 && s.inPixels < RIGHT_AREA_MIN) rightAreaRef.current?.collapse();
                    }}
                  >
                    <RightArea centerRef={centerRef} rightAreaRef={rightAreaRef} />
                  </Panel>
                </Group>
              </Panel>
            </Group>
            <BottomBar />
          </div>
        )}
      </ThemeProvider>
    </GlobalErrorBoundary>
  );
}
