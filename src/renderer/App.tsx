import { useEffect } from "react";
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

export function App() {
  const rightAreaExpanded = useLayoutStore((s) => s.rightAreaExpanded);
  const editorMaximized = useLayoutStore((s) => s.editorMaximized);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const projectRoot = useDocumentStore((s) => s.projectRoot);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Auto-open last project on startup (silent, no setup dialog)
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
          <div className="flex h-full flex-col">
            <TitleBar />

            <div className="flex flex-1 min-h-0 overflow-hidden">
              <LeftSidebar />
              {!editorMaximized && <LeftMainArea />}
              {(rightAreaExpanded || editorMaximized) && <RightArea maximized={editorMaximized} />}
            </div>

            <BottomBar />
          </div>
        )}
      </ThemeProvider>
    </GlobalErrorBoundary>
  );
}
