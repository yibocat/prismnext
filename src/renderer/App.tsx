import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";

export function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <TooltipProvider>
        <WorkspaceLayout />
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}
