import { ThemeProvider } from "next-themes";
import { useLayoutStore } from "@/stores/layout-store";
import { TitleBar } from "@/components/layout/title-bar";
import { LeftSidebar } from "@/components/layout/left-sidebar";
import { LeftMainArea } from "@/components/layout/left-main-area";
import { RightArea } from "@/components/layout/right-area";
import { BottomBar } from "@/components/layout/bottom-bar";

export function App() {
  const rightAreaExpanded = useLayoutStore((s) => s.rightAreaExpanded);
  const editorMaximized = useLayoutStore((s) => s.editorMaximized);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <div className="flex h-full flex-col">
        <TitleBar />

        <div className="flex flex-1 min-h-0 overflow-hidden">
          <LeftSidebar />
          {!editorMaximized && <LeftMainArea />}
          {(rightAreaExpanded || editorMaximized) && <RightArea maximized={editorMaximized} />}
        </div>

        <BottomBar />
      </div>
    </ThemeProvider>
  );
}
