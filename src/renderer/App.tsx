import { useEffect } from "react";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { GlobalErrorBoundary } from "@/components/global-error-boundary";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { WelcomeScreen } from "@/components/welcome/welcome-screen";
import { useDocumentStore } from "@/stores/document-store";
import { useSettingsStore } from "@/stores/settings-store";

export function App() {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const loaded = useSettingsStore((s) => s.loaded);
  const loadSettings = useSettingsStore((s) => s.loadSettings);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return (
    <GlobalErrorBoundary>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <TooltipProvider>
          {projectRoot ? <WorkspaceLayout /> : <WelcomeScreen />}
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </GlobalErrorBoundary>
  );
}
