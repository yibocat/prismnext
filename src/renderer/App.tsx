import { ThemeProvider } from "next-themes";
import { TitleBar } from "@/components/layout/title-bar";
import { BottomBar } from "@/components/layout/bottom-bar";

export function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <div className="flex h-full flex-col">
        <TitleBar />
        <div className="flex-1" />
        <BottomBar />
      </div>
    </ThemeProvider>
  );
}
