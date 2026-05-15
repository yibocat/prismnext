import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { WelcomeScreen } from "@/components/welcome/welcome-screen";
import { useDocumentStore } from "@/stores/document-store";

export function App() {
  const projectRoot = useDocumentStore((s) => s.projectRoot);

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <TooltipProvider>
        {projectRoot ? <WorkspaceLayout /> : <WelcomeScreen />}
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}
