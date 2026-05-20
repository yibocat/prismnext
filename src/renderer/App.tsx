import { ThemeProvider } from "next-themes";
import { TitleBar } from "@/components/layout/title-bar";
import { LeftSidebar } from "@/components/layout/left-sidebar";
import { BottomBar } from "@/components/layout/bottom-bar";

export function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <div className="flex h-full flex-col">
        <TitleBar />

        <div className="flex flex-1 min-h-0 overflow-hidden">
          <LeftSidebar />
          <main className="flex-1 bg-background" />
        </div>

        <BottomBar />
      </div>
    </ThemeProvider>
  );
}
