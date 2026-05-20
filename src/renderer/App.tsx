import { ThemeProvider } from "next-themes";
import { TitleBar } from "@/components/layout/title-bar";
import { LeftSidebar } from "@/components/layout/left-sidebar";
import { MainArea } from "@/components/layout/main-area";
import { BottomBar } from "@/components/layout/bottom-bar";

export function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <div className="flex h-full flex-col">
        <TitleBar />

        <div className="flex flex-1 min-h-0 overflow-hidden">
          <LeftSidebar />
          <MainArea />
        </div>

        <BottomBar />
      </div>
    </ThemeProvider>
  );
}
